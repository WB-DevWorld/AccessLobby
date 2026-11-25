import type { Pool, PoolClient } from 'pg';
import { OperatorError, OperatorStore, operatorContract, validOperatorReference } from './operators.js';
import { validId } from './organizations.js';

interface PersonRow {
  id: string; status: 'active' | 'suspended'; created_at: Date; status_version: string;
  status_change_reference: string | null; status_changed_by: string | null;
}
const fail = (status: number, code: string): never => { throw new OperatorError(status, code); };
const validVersion = (value: unknown): value is string => typeof value === 'string' &&
  /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) < 9223372036854775807n;

/** Administrative state belongs to AccessLobby. IAM credentials and app-local
 * authorizations remain with their owners; rechecking peers observe denial. */
export class PersonControlStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  async detail(actor: string, target: string) {
    await this.operators.require(actor, 'read');
    if (!validId(target)) return fail(404, 'person_not_found');
    const result = await this.pool.query<PersonRow & {
      protected_operator: boolean; organization_count: number; application_count: number;
    }>(`SELECT p.id,p.status,p.created_at,p.status_version,
      EXISTS(SELECT 1 FROM platform_operator_roles r WHERE r.person_id=p.id AND r.revoked_at IS NULL) AS protected_operator,
      (SELECT count(*)::int FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
        WHERE m.person_id=p.id AND m.status='active' AND o.status='active') AS organization_count,
      (SELECT count(*)::int FROM applications a WHERE a.owner_person_id=p.id) AS application_count
      FROM persons p WHERE p.id=$1`, [target]);
    const row = result.rows[0];
    if (!row) return fail(404, 'person_not_found');
    return { contract: operatorContract, person: { id: row.id, status: row.status, createdAt: row.created_at.toISOString(),
      organizationCount: row.organization_count, applicationCount: row.application_count,
      protectedOperator: row.protected_operator, statusVersion: row.status_version } };
  }

  async change(actor: string, target: string, input: unknown) {
    await this.operators.require(actor, 'people');
    if (!validId(target)) return fail(404, 'person_not_found');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'invalid_person_change');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).length !== 3 || Object.keys(body).some(key => !['status', 'reference', 'expectedVersion'].includes(key)) ||
        (body.status !== 'active' && body.status !== 'suspended') || !validOperatorReference(body.reference) ||
        !validVersion(body.expectedVersion)) return fail(400, 'invalid_person_change');
    if (target.toLowerCase() === actor.toLowerCase()) return fail(403, 'self_status_change_forbidden');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Order person locks deterministically. The private role CLI locks its
      // target person first, so grants/revocations cannot race this protection.
      const people = await db.query<PersonRow>(`SELECT id,status,created_at,status_version,status_change_reference,status_changed_by
        FROM persons WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[actor, target]]);
      const row = people.rows.find(person => person.id === target.toLowerCase());
      const currentActor = people.rows.find(person => person.id === actor.toLowerCase());
      if (currentActor?.status !== 'active') return fail(403, 'operator_access_denied');
      await this.lockAuthority(db, actor);
      if (!row) return fail(404, 'person_not_found');
      const protectedTarget = await db.query(`SELECT person_id FROM platform_operator_roles
        WHERE person_id=$1 AND revoked_at IS NULL FOR SHARE`, [target]);
      if (protectedTarget.rowCount) return fail(403, 'protected_operator_person');
      // A retry only succeeds when it is the same actor/reference and transition
      // from the immediately previous version. Earlier requests cannot undo a
      // subsequent status transition by replaying their old page.
      const sameRetry = row.status === body.status && row.status_change_reference === body.reference &&
        row.status_changed_by === actor.toLowerCase() && BigInt(row.status_version) === BigInt(body.expectedVersion) + 1n;
      if (sameRetry) {
        await db.query('COMMIT');
        return { contract: operatorContract, person: { id: row.id, status: row.status, statusVersion: row.status_version }, changed: false };
      }
      if (row.status_version !== body.expectedVersion) return fail(409, 'stale_person_change');
      if (row.status === body.status) {
        await db.query('COMMIT');
        return { contract: operatorContract, person: { id: row.id, status: row.status, statusVersion: row.status_version }, changed: false };
      }
      const changed = await db.query<PersonRow>(`UPDATE persons SET status=$2,status_version=status_version+1,
        session_not_before=GREATEST(session_not_before, floor(extract(epoch FROM clock_timestamp()))::bigint+1),
        status_change_reference=$3,status_changed_by=$4,updated_at=now() WHERE id=$1
        RETURNING id,status,status_version`, [target, body.status, body.reference, actor]);
      // Removing capabilities is durable across re-enablement. A fresh valid
      // bearer must negotiate a fresh receipt; no old receipt can revive.
      await db.query('DELETE FROM peer_session_receipts WHERE person_id=$1', [target]);
      await db.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
        VALUES($1,$2,'person',$3,$4)`, [actor, body.status === 'suspended' ? 'person.suspended' : 'person.reenabled', target, body.reference]);
      await db.query('COMMIT');
      const person = changed.rows[0]!;
      return { contract: operatorContract, person: { id: person.id, status: person.status, statusVersion: person.status_version }, changed: true };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async lockAuthority(db: PoolClient, actor: string) {
    const grant = await db.query(`SELECT person_id FROM platform_operator_roles
      WHERE person_id=$1 AND role='identity_operator' AND revoked_at IS NULL FOR SHARE`, [actor]);
    if (!grant.rowCount) return fail(403, 'operator_access_denied');
  }
}
