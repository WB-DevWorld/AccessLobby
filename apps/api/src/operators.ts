import type { Pool } from 'pg';
import { validId } from './organizations.js';

export type OperatorRole = 'support_reader' | 'application_reviewer' | 'identity_operator' | 'application_operator';
export type OperatorPermission = 'read' | 'review' | 'people' | 'activate';
export const operatorContract = 'accesslobby.admin.v0.1' as const;
const pageSize = 25;

export class OperatorError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

const fail = (status: number, code: string): never => { throw new OperatorError(status, code); };
export const validOperatorRole = (role: unknown): role is OperatorRole =>
  role === 'support_reader' || role === 'application_reviewer' || role === 'identity_operator' || role === 'application_operator';
export const validOperatorReference = (reference: unknown): reference is string =>
  typeof reference === 'string' && /^[A-Za-z0-9._:/-]{4,120}$/.test(reference);

function cursor(value: unknown): string | null {
  if (value === undefined || value === '') return null;
  if (!validId(value)) return fail(400, 'invalid_admin_cursor');
  return value.toLowerCase();
}

function search(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) {
    return fail(400, 'invalid_admin_search');
  }
  return value.trim();
}

function numericCursor(value: unknown): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    return fail(400, 'invalid_admin_cursor');
  }
  return value;
}

const iso = (value: Date): string => value.toISOString();

/** No token/organization role or email can confer platform operator authority. */
export class OperatorStore {
  constructor(private readonly pool: Pool) {}

  async require(personId: string, permission: OperatorPermission): Promise<OperatorRole[]> {
    if (!validId(personId)) return fail(403, 'operator_access_denied');
    const result = await this.pool.query<{ role: OperatorRole }>(`SELECT r.role
      FROM platform_operator_roles r JOIN persons p ON p.id = r.person_id
      WHERE r.person_id = $1 AND r.revoked_at IS NULL AND p.status = 'active'
      ORDER BY r.role`, [personId]);
    const roles = result.rows.map(row => row.role).filter(validOperatorRole);
    const needed = { review: 'application_reviewer', people: 'identity_operator', activate: 'application_operator' } as const;
    if (!roles.length || (permission !== 'read' && !roles.includes(needed[permission]))) {
      return fail(403, 'operator_access_denied');
    }
    return roles;
  }

  async access(personId: string) {
    const roles = await this.require(personId, 'read');
    return { contract: operatorContract, roles, capabilities: { read: true as const,
      reviewApplications: roles.includes('application_reviewer'), managePeople: roles.includes('identity_operator'),
      activateApplications: roles.includes('application_operator') } };
  }

  async people(actorId: string, query?: unknown, after?: unknown) {
    await this.require(actorId, 'read');
    const q = search(query).toLowerCase();
    if (q && !/^[0-9a-f][0-9a-f-]{3,35}$/.test(q)) return fail(400, 'invalid_admin_search');
    const next = cursor(after);
    const result = await this.pool.query<{ id: string; status: string; created_at: Date;
      organization_count: number; application_count: number }>(`SELECT p.id, p.status, p.created_at,
      (SELECT count(*)::int FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id
        WHERE m.person_id = p.id AND m.status = 'active' AND o.status = 'active') AS organization_count,
      (SELECT count(*)::int FROM applications a WHERE a.owner_person_id = p.id) AS application_count
      FROM persons p WHERE ($1 = '' OR p.id::text LIKE $1 || '%')
      AND ($2::uuid IS NULL OR p.id > $2::uuid) ORDER BY p.id LIMIT $3`, [q, next, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract: operatorContract, people: rows.map(row => ({ id: row.id, status: row.status,
      createdAt: iso(row.created_at), organizationCount: row.organization_count, applicationCount: row.application_count })),
      nextCursor: result.rows.length > pageSize ? rows.at(-1)!.id : null };
  }

  async organizations(actorId: string, query?: unknown, after?: unknown) {
    await this.require(actorId, 'read');
    const q = search(query);
    const next = cursor(after);
    // Treat percent, underscore and escape as literal name characters.
    const literal = q.replace(/[\\%_]/g, '\\$&');
    const result = await this.pool.query<{ id: string; name: string; status: string; created_at: Date;
      member_count: number; owner_count: number }>(`SELECT o.id, o.name, o.status, o.created_at,
      (SELECT count(*)::int FROM organization_memberships m JOIN persons p ON p.id = m.person_id
        WHERE m.organization_id = o.id AND m.status = 'active' AND p.status = 'active') AS member_count,
      (SELECT count(*)::int FROM organization_memberships m JOIN persons p ON p.id = m.person_id
        WHERE m.organization_id = o.id AND m.status = 'active' AND p.status = 'active' AND m.role = 'owner') AS owner_count
      FROM organizations o WHERE ($1 = '' OR o.name ILIKE '%' || $1 || '%' ESCAPE '\\' OR o.id::text = $2)
      AND ($3::uuid IS NULL OR o.id > $3::uuid) ORDER BY o.id LIMIT $4`,
    [literal, q.toLowerCase(), next, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract: operatorContract, organizations: rows.map(row => ({ id: row.id, name: row.name,
      status: row.status, createdAt: iso(row.created_at), memberCount: row.member_count, ownerCount: row.owner_count })),
      nextCursor: result.rows.length > pageSize ? rows.at(-1)!.id : null };
  }

  async audit(actorId: string, after?: unknown) {
    await this.require(actorId, 'read');
    const next = numericCursor(after);
    const result = await this.pool.query<{ id: string; actor_person_id: string | null; action: string;
      target_type: string; target_id: string; reference: string; occurred_at: Date }>(`SELECT id, actor_person_id,
      action, target_type, target_id, reference, occurred_at FROM operator_audit_events
      WHERE ($1::bigint IS NULL OR id < $1::bigint) ORDER BY id DESC LIMIT $2`, [next, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract: operatorContract, events: rows.map(row => ({ id: row.id, actorPersonId: row.actor_person_id,
      action: row.action, targetType: row.target_type, targetId: row.target_id, reference: row.reference,
      occurredAt: iso(row.occurred_at) })), nextCursor: result.rows.length > pageSize ? rows.at(-1)!.id : null };
  }
}
