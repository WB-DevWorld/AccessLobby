import type { Pool } from 'pg';
import { ApplicationError, currentGrantOwnerAuthentication } from './applications.js';
import { validId } from './organizations.js';
import type { AuthenticatedSubject } from './auth.js';

export const applicationGrantsContract = 'accesslobby.application-grants.v0.1' as const;
const pageSize = 25;
const fail = (status: number, code: string): never => { throw new ApplicationError(status, code); };

/** App owners inspect their own stored grants; platform/organization roles confer no authority here. */
export class ApplicationGrantsStore {
  constructor(private readonly pool: Pool) {}

  async list(actor: string, appId: string, after?: unknown, auth?: AuthenticatedSubject) {
    if (!validId(actor) || !validId(appId)) return fail(404, 'application_not_found');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const app = (await db.query<{ id: string; client_id: string; name: string; status: string; trust_class: string; admission: string; owner_person_id: string }>(
        'SELECT id,client_id,name,status,trust_class,admission,owner_person_id FROM applications WHERE id=$1 FOR SHARE', [appId])).rows[0];
      if (!app || app.owner_person_id !== actor.toLowerCase()) return fail(404, 'application_not_found');
      const owner = (await db.query<{ status: string; session_not_before: string }>('SELECT status,session_not_before FROM persons WHERE id=$1 FOR SHARE', [actor])).rows[0];
      if (!owner) return fail(403, 'application_owner_unavailable');
      await currentGrantOwnerAuthentication(db, actor, owner, auth);
      if (app.status !== 'active' || app.trust_class !== 'first_party' || app.admission !== 'grant_required') return fail(409, 'application_grants_unavailable');
      if (after !== undefined && !validId(after)) return fail(400, 'invalid_grant_cursor');
      const result = await db.query<{ person_id: string; person_status: 'active' | 'suspended'; status: 'active' | 'revoked';
        granted_at: Date; granted_by: string; expires_at: Date | null; revoked_at: Date | null; expired: boolean }>(`SELECT g.person_id,p.status AS person_status,
        g.status,g.granted_at,g.granted_by,g.expires_at,g.revoked_at,
        (g.status='active' AND g.expires_at IS NOT NULL AND g.expires_at<=clock_timestamp()) AS expired
        FROM application_grants g JOIN persons p ON p.id=g.person_id
        WHERE g.application_id=$1 AND ($2::uuid IS NULL OR g.person_id>$2::uuid)
        ORDER BY g.person_id LIMIT $3`, [appId, after ?? null, pageSize + 1]);
      const rows = result.rows.slice(0, pageSize);
      await db.query('COMMIT');
      return { contract: applicationGrantsContract, application: { id: app.id, clientId: app.client_id, name: app.name,
        status: 'active' as const, trustClass: 'first_party' as const, admission: 'grant_required' as const },
        grants: rows.map(row => ({ personId: row.person_id, personStatus: row.person_status, status: row.status,
          grantedAt: row.granted_at.toISOString(), grantedByPersonId: row.granted_by, expiresAt: row.expires_at?.toISOString() ?? null,
          revokedAt: row.revoked_at?.toISOString() ?? null, expired: row.expired })),
        nextCursor: result.rows.length > pageSize ? rows.at(-1)!.person_id : null };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}
