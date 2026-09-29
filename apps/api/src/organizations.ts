import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type OrganizationRole = 'owner' | 'administrator' | 'member';
export class OrganizationError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
const fail = (status: number, code: string): never => { throw new OrganizationError(status, code); };
export const validId = (id: unknown): id is string => typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const inviteRole = (role: unknown): role is 'administrator' | 'member' =>
  role === 'administrator' || role === 'member';

export class OrganizationStore {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async membership(db: PoolClient, orgId: string, personId: string, lock = false): Promise<OrganizationRole> {
    // All writers lock the organization first, so owner changes and invitations serialize.
    const org = await db.query('SELECT status FROM organizations WHERE id = $1' + (lock ? ' FOR UPDATE' : ''), [orgId]);
    if (org.rows[0]?.status !== 'active') return fail(404, 'organization_not_found');
    const member = await db.query<{ role: OrganizationRole }>(
      "SELECT role FROM organization_memberships WHERE organization_id = $1 AND person_id = $2 AND status = 'active'",
      [orgId, personId]
    );
    if (!member.rows[0]) return fail(404, 'organization_not_found');
    return member.rows[0].role;
  }

  private async event(db: PoolClient, orgId: string, actor: string, action: string, target?: string) {
    await db.query('INSERT INTO organization_events (organization_id, actor_person_id, target_person_id, action) VALUES ($1,$2,$3,$4)',
      [orgId, actor, target ?? null, action]);
  }

  async list(personId: string) {
    const [memberships, invitations] = await Promise.all([
      this.pool.query<{ id: string; name: string; role: OrganizationRole }>(
        "SELECT o.id, o.name, m.role FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.person_id = $1 AND m.status = 'active' AND o.status = 'active' ORDER BY o.name, o.id",
        [personId]),
      this.pool.query<{ id: string; organizationId: string; organizationName: string; role: string; expiresAt: string }>(
        "SELECT i.id, i.organization_id AS \"organizationId\", o.name AS \"organizationName\", i.role, i.expires_at AS \"expiresAt\" FROM organization_invitations i JOIN organizations o ON o.id = i.organization_id WHERE i.invited_person_id = $1 AND i.status = 'pending' AND i.expires_at > now() AND o.status = 'active' ORDER BY i.created_at",
        [personId])
    ]);
    return { person: { id: personId }, contexts: [{ type: 'personal' as const },
      ...memberships.rows.map(row => ({ type: 'organization' as const, ...row }))], invitations: invitations.rows };
  }

  async create(personId: string, input: unknown) {
    const name = typeof input === 'string' ? input.trim() : '';
    if (name.length < 2 || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) return fail(400, 'invalid_organization_name');
    return this.transaction(async db => {
      const id = randomUUID();
      await db.query('INSERT INTO organizations (id, name, created_by) VALUES ($1,$2,$3)', [id, name, personId]);
      await db.query("INSERT INTO organization_memberships (organization_id, person_id, role, status) VALUES ($1,$2,'owner','active')", [id, personId]);
      await this.event(db, id, personId, 'organization.created', personId);
      return { id, name, role: 'owner' as const };
    });
  }

  async detail(personId: string, orgId: string) {
    const db = await this.pool.connect();
    try {
      const role = await this.membership(db, orgId, personId);
      const org = await db.query<{ id: string; name: string }>('SELECT id, name FROM organizations WHERE id = $1', [orgId]);
      const members = await db.query<{ personId: string; role: OrganizationRole }>(
        "SELECT person_id AS \"personId\", role FROM organization_memberships WHERE organization_id = $1 AND status = 'active' ORDER BY joined_at, person_id", [orgId]);
      const invitations = role === 'member' ? [] : (await db.query(
        "SELECT id, invited_person_id AS \"personId\", role, expires_at AS \"expiresAt\" FROM organization_invitations WHERE organization_id = $1 AND status = 'pending' AND expires_at > now() ORDER BY created_at", [orgId])).rows;
      return { ...org.rows[0], role, members: members.rows, invitations };
    } finally { db.release(); }
  }

  async invite(actor: string, orgId: string, target: unknown, role: unknown) {
    if (!validId(target) || !inviteRole(role)) return fail(400, 'invalid_invitation');
    if (actor === target) return fail(400, 'cannot_invite_self');
    return this.transaction(async db => {
      const actorRole = await this.membership(db, orgId, actor, true);
      if (actorRole === 'member' || (role === 'administrator' && actorRole !== 'owner')) return fail(403, 'membership_permission_denied');
      const person = await db.query("SELECT 1 FROM persons WHERE id = $1 AND status = 'active'", [target]);
      if (!person.rows[0]) return fail(404, 'person_not_found');
      const active = await db.query("SELECT 1 FROM organization_memberships WHERE organization_id = $1 AND person_id = $2 AND status = 'active'", [orgId, target]);
      if (active.rows[0]) return fail(409, 'already_a_member');
      await db.query("UPDATE organization_invitations SET status = 'revoked', decided_at = now() WHERE organization_id = $1 AND invited_person_id = $2 AND status = 'pending' AND expires_at <= now()", [orgId, target]);
      const id = randomUUID();
      try {
        await db.query("INSERT INTO organization_invitations (id, organization_id, invited_person_id, invited_by, role, status, expires_at) VALUES ($1,$2,$3,$4,$5,'pending',now() + interval '7 days')", [id, orgId, target, actor, role]);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return fail(409, 'invitation_pending');
        throw error;
      }
      await this.event(db, orgId, actor, 'invitation.created', target);
      return { id, organizationId: orgId, personId: target, role };
    });
  }

  async respond(personId: string, invitationId: string, accept: boolean) {
    return this.transaction(async db => {
      const lookup = await db.query<{ organization_id: string }>(
        'SELECT organization_id FROM organization_invitations WHERE id = $1 AND invited_person_id = $2', [invitationId, personId]);
      if (!lookup.rows[0]) return fail(404, 'invitation_not_found');
      // Keep the same lock order as every other organization writer: organization, then invitation.
      const org = await db.query('SELECT status FROM organizations WHERE id = $1 FOR UPDATE', [lookup.rows[0].organization_id]);
      if (org.rows[0]?.status !== 'active') return fail(404, 'invitation_not_found');
      const invite = await db.query<{ organization_id: string; role: OrganizationRole }>(
        "SELECT organization_id, role FROM organization_invitations WHERE id = $1 AND invited_person_id = $2 AND status = 'pending' AND expires_at > now() FOR UPDATE", [invitationId, personId]);
      const row = invite.rows[0];
      if (!row) return fail(404, 'invitation_not_found');
      if (accept) {
        const membership = await db.query("SELECT 1 FROM organization_memberships WHERE organization_id = $1 AND person_id = $2 AND status = 'active'", [row.organization_id, personId]);
        if (membership.rows[0]) return fail(409, 'already_a_member');
        await db.query("INSERT INTO organization_memberships (organization_id, person_id, role, status) VALUES ($1,$2,$3,'active') ON CONFLICT (organization_id, person_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', joined_at = now(), ended_at = NULL", [row.organization_id, personId, row.role]);
      }
      await db.query('UPDATE organization_invitations SET status = $2, decided_at = now() WHERE id = $1', [invitationId, accept ? 'accepted' : 'declined']);
      await this.event(db, row.organization_id, personId, accept ? 'invitation.accepted' : 'invitation.declined', personId);
      return { organizationId: row.organization_id, accepted: accept };
    });
  }

  async revoke(actor: string, orgId: string, invitationId: string) {
    return this.transaction(async db => {
      const role = await this.membership(db, orgId, actor, true);
      if (role === 'member') return fail(403, 'membership_permission_denied');
      const row = await db.query<{ invited_person_id: string; role: string }>(
        "SELECT invited_person_id, role FROM organization_invitations WHERE id = $1 AND organization_id = $2 AND status = 'pending' FOR UPDATE", [invitationId, orgId]);
      if (!row.rows[0]) return fail(404, 'invitation_not_found');
      if (role !== 'owner' && row.rows[0].role === 'administrator') return fail(403, 'membership_permission_denied');
      await db.query("UPDATE organization_invitations SET status = 'revoked', decided_at = now() WHERE id = $1", [invitationId]);
      await this.event(db, orgId, actor, 'invitation.revoked', row.rows[0].invited_person_id);
      return { revoked: true };
    });
  }

  async changeRole(actor: string, orgId: string, target: string, role: unknown) {
    if (!validId(target) || (role !== 'owner' && role !== 'administrator' && role !== 'member')) return fail(400, 'invalid_role');
    return this.transaction(async db => {
      if (await this.membership(db, orgId, actor, true) !== 'owner') return fail(403, 'membership_permission_denied');
      const member = await db.query<{ role: OrganizationRole }>(
        "SELECT m.role FROM organization_memberships m JOIN persons p ON p.id = m.person_id AND p.status = 'active' WHERE m.organization_id = $1 AND m.person_id = $2 AND m.status = 'active'", [orgId, target]);
      if (!member.rows[0]) return fail(404, 'member_not_found');
      if (member.rows[0].role === 'owner' && role !== 'owner') await this.requireAnotherOwner(db, orgId, target);
      await db.query('UPDATE organization_memberships SET role = $3 WHERE organization_id = $1 AND person_id = $2', [orgId, target, role]);
      await this.event(db, orgId, actor, `membership.role.${role}`, target);
      return { personId: target, role };
    });
  }

  private async requireAnotherOwner(db: PoolClient, orgId: string, personId: string) {
    const owners = await db.query("SELECT 1 FROM organization_memberships m JOIN persons p ON p.id = m.person_id AND p.status = 'active' WHERE m.organization_id = $1 AND m.person_id <> $2 AND m.role = 'owner' AND m.status = 'active' LIMIT 1", [orgId, personId]);
    if (!owners.rows[0]) return fail(409, 'last_owner');
  }

  async leaveOrRemove(actor: string, orgId: string, target: string) {
    if (!validId(target)) return fail(400, 'invalid_member');
    return this.transaction(async db => {
      const actorRole = await this.membership(db, orgId, actor, true);
      const member = await db.query<{ role: OrganizationRole }>(
        "SELECT role FROM organization_memberships WHERE organization_id = $1 AND person_id = $2 AND status = 'active'", [orgId, target]);
      if (!member.rows[0]) return fail(404, 'member_not_found');
      if (actor !== target && (actorRole === 'member' || (actorRole !== 'owner' && member.rows[0].role !== 'member'))) return fail(403, 'membership_permission_denied');
      if (member.rows[0].role === 'owner') await this.requireAnotherOwner(db, orgId, target);
      const status = actor === target ? 'left' : 'removed';
      await db.query('UPDATE organization_memberships SET status = $3, ended_at = now() WHERE organization_id = $1 AND person_id = $2', [orgId, target, status]);
      await this.event(db, orgId, actor, `membership.${status}`, target);
      return { personId: target, status };
    });
  }
}
