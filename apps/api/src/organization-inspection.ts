import type { Pool } from 'pg';
import { OperatorError, OperatorStore, operatorContract } from './operators.js';
import { validId } from './organizations.js';

const pageSize = 25;
const safeActions = new Set([
  'organization.created', 'invitation.created', 'invitation.accepted', 'invitation.declined', 'invitation.revoked',
  'membership.role.owner', 'membership.role.administrator', 'membership.role.member', 'membership.left', 'membership.removed',
]);

function uuidCursor(value: unknown): string | null {
  if (value === undefined || value === '') return null;
  if (!validId(value)) throw new OperatorError(400, 'invalid_admin_cursor');
  return value.toLowerCase();
}
function eventCursor(value: unknown): string | null {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) {
    throw new OperatorError(400, 'invalid_admin_cursor');
  }
  return value;
}
const iso = (value: Date): string => value.toISOString();

/** Read-only, bounded organization facts. Organization roles never confer console authority. */
export class OrganizationInspectionStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  private async organization(actor: string, id: unknown): Promise<string> {
    await this.operators.require(actor, 'read');
    if (!validId(id)) throw new OperatorError(404, 'organization_not_found');
    const result = await this.pool.query('SELECT id FROM organizations WHERE id = $1', [id]);
    if (!result.rowCount) throw new OperatorError(404, 'organization_not_found');
    return id.toLowerCase();
  }

  async detail(actor: string, id: unknown) {
    const organizationId = await this.organization(actor, id);
    const result = await this.pool.query<{ id: string; name: string; status: 'active' | 'suspended'; created_by: string; created_at: Date;
      active_member_count: number; active_owner_count: number; total_membership_count: number; total_invitation_count: number }>(`SELECT o.id, o.name, o.status, o.created_by, o.created_at,
      (SELECT count(*)::int FROM organization_memberships m JOIN persons p ON p.id = m.person_id
        WHERE m.organization_id = o.id AND m.status = 'active' AND p.status = 'active') AS active_member_count,
      (SELECT count(*)::int FROM organization_memberships m JOIN persons p ON p.id = m.person_id
        WHERE m.organization_id = o.id AND m.status = 'active' AND p.status = 'active' AND m.role = 'owner') AS active_owner_count,
      (SELECT count(*)::int FROM organization_memberships m WHERE m.organization_id = o.id) AS total_membership_count,
      (SELECT count(*)::int FROM organization_invitations i WHERE i.organization_id = o.id) AS total_invitation_count
      FROM organizations o WHERE o.id = $1`, [organizationId]);
    const row = result.rows[0];
    if (!row) throw new OperatorError(404, 'organization_not_found');
    return { contract: operatorContract, organization: { id: row.id, name: row.name, status: row.status,
      createdByPersonId: row.created_by, createdAt: iso(row.created_at), activeMemberCount: row.active_member_count,
      activeOwnerCount: row.active_owner_count, totalMembershipCount: row.total_membership_count, totalInvitationCount: row.total_invitation_count } };
  }

  async members(actor: string, id: unknown, after?: unknown) {
    const organizationId = await this.organization(actor, id);
    const next = uuidCursor(after);
    const result = await this.pool.query<{ person_id: string; person_status: 'active' | 'suspended'; role: 'owner' | 'administrator' | 'member';
      status: 'active' | 'left' | 'removed'; joined_at: Date; ended_at: Date | null }>(`SELECT m.person_id, p.status AS person_status,
      m.role, m.status, m.joined_at, m.ended_at FROM organization_memberships m JOIN persons p ON p.id = m.person_id
      WHERE m.organization_id = $1 AND ($2::uuid IS NULL OR m.person_id > $2::uuid)
      ORDER BY m.person_id LIMIT $3`, [organizationId, next, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract: operatorContract, organizationId, members: rows.map(row => ({ personId: row.person_id,
      personStatus: row.person_status, role: row.role, membershipStatus: row.status, joinedAt: iso(row.joined_at),
      endedAt: row.ended_at === null ? null : iso(row.ended_at) })),
      nextCursor: result.rows.length > pageSize ? rows.at(-1)!.person_id : null };
  }

  async invitations(actor: string, id: unknown, after?: unknown) {
    const organizationId = await this.organization(actor, id);
    const next = uuidCursor(after);
    const result = await this.pool.query<{ id: string; invited_person_id: string; invited_by: string; role: 'administrator' | 'member';
      status: 'pending' | 'accepted' | 'declined' | 'revoked'; expires_at: Date; created_at: Date; decided_at: Date | null; pending_expired: boolean }>(`SELECT id,
      invited_person_id, invited_by, role, status, expires_at, created_at, decided_at,
      (status = 'pending' AND expires_at <= now()) AS pending_expired FROM organization_invitations
      WHERE organization_id = $1 AND ($2::uuid IS NULL OR id > $2::uuid) ORDER BY id LIMIT $3`, [organizationId, next, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract: operatorContract, organizationId, invitations: rows.map(row => ({ id: row.id, personId: row.invited_person_id,
      invitedByPersonId: row.invited_by, role: row.role, status: row.status, expiresAt: iso(row.expires_at), createdAt: iso(row.created_at),
      decidedAt: row.decided_at === null ? null : iso(row.decided_at), pendingExpired: row.pending_expired })),
      nextCursor: result.rows.length > pageSize ? rows.at(-1)!.id : null };
  }

  async events(actor: string, id: unknown, after?: unknown) {
    const organizationId = await this.organization(actor, id);
    const next = eventCursor(after);
    const result = await this.pool.query<{ id: string; actor_person_id: string; target_person_id: string | null; action: string; occurred_at: Date }>(`SELECT id,
      actor_person_id, target_person_id, action, occurred_at FROM organization_events
      WHERE organization_id = $1 AND ($2::bigint IS NULL OR id < $2::bigint) ORDER BY id DESC LIMIT $3`, [organizationId, next, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract: operatorContract, organizationId, events: rows.map(row => ({ id: row.id, actorPersonId: row.actor_person_id,
      targetPersonId: row.target_person_id, action: safeActions.has(row.action) ? row.action : 'organization.event', occurredAt: iso(row.occurred_at) })),
      nextCursor: result.rows.length > pageSize ? rows.at(-1)!.id : null };
  }
}
