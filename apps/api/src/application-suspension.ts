import type { Pool, PoolClient } from 'pg';
import { OperatorError, OperatorStore, validOperatorReference } from './operators.js';
import { validId } from './organizations.js';

export const applicationSuspensionContract = 'accesslobby.application-suspension.v0.1';
const protectedClients = new Set(['accesslobby-web', 'accesslobby-api']);
const fail = (status: number, code: string): never => { throw new OperatorError(status, code); };
const validVersion = (value: unknown): value is string => typeof value === 'string' &&
  /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) < 9223372036854775807n;
interface ApplicationRow {
  id: string; client_id: string; name: string; status: 'requested' | 'cancelled' | 'active' | 'suspended';
  trust_class: 'unreviewed' | 'first_party' | 'external'; administration_version: string;
  suspended_at: Date | null; suspension_reference: string | null; suspended_by: string | null;
}
const columns = 'id,client_id,name,status,trust_class,administration_version,suspended_at,suspension_reference,suspended_by';
function envelope(app: ApplicationRow, maySuspend = true) {
  return { contract: applicationSuspensionContract, application: {
    id: app.id, clientId: app.client_id, name: app.name, status: app.status, trustClass: app.trust_class,
    version: app.administration_version, suspendedAt: app.suspended_at?.toISOString() ?? null,
    suspensionReference: app.suspension_reference,
  }, canSuspend: maySuspend && app.status === 'active' && app.trust_class === 'first_party' && !protectedClients.has(app.client_id) };
}

/** End AccessLobby admission and negotiated receipt authority. Local application
 * cookies, IAM configuration, grants and user data remain with their owners. */
export class ApplicationSuspensionStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  async detail(actor: string, target: string) {
    const roles = await this.operators.require(actor, 'read');
    if (!validId(target)) return fail(404, 'application_not_found');
    const result = await this.pool.query<ApplicationRow>(`SELECT ${columns} FROM applications WHERE id=$1`, [target]);
    if (!result.rows[0]) return fail(404, 'application_not_found');
    return envelope(result.rows[0], roles.includes('application_operator'));
  }

  async suspend(actor: string, target: string, input: unknown) {
    await this.operators.require(actor, 'activate');
    if (!validId(target)) return fail(404, 'application_not_found');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'invalid_application_suspension');
    const body = input as Record<string, unknown>;
    const keys = ['expectedStatus', 'expectedVersion', 'confirmationClientId', 'reference'];
    if (Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key)) ||
      body.expectedStatus !== 'active' || !validVersion(body.expectedVersion) || !validOperatorReference(body.reference) ||
      typeof body.confirmationClientId !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(body.confirmationClientId)) {
      return fail(400, 'invalid_application_suspension');
    }
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Same lock order as lifecycle/provisioning: application, then people,
      // then grants. Current authority remains locked through audit commit.
      const result = await db.query<ApplicationRow>(`SELECT ${columns} FROM applications WHERE id=$1 FOR UPDATE`, [target]);
      const app = result.rows[0];
      await this.lockAuthority(db, actor);
      if (!app) return fail(404, 'application_not_found');
      if (protectedClients.has(app.client_id)) return fail(403, 'protected_application');
      if (body.confirmationClientId !== app.client_id) return fail(409, 'suspension_confirmation_mismatch');
      const sameRetry = app.status === 'suspended' && app.trust_class === 'first_party' &&
        app.suspended_by === actor.toLowerCase() && app.suspension_reference === body.reference &&
        BigInt(app.administration_version) === BigInt(body.expectedVersion) + 1n;
      if (sameRetry) {
        await db.query('COMMIT');
        return { ...envelope(app), changed: false };
      }
      if (app.administration_version !== body.expectedVersion) return fail(409, 'stale_application_suspension');
      if (app.status !== 'active' || app.trust_class !== 'first_party') return fail(409, 'application_not_suspendable');
      const updated = await db.query<ApplicationRow>(`UPDATE applications SET status='suspended',suspended_at=clock_timestamp(),
        suspension_reference=$2,suspended_by=$3 WHERE id=$1 RETURNING ${columns}`, [target, body.reference, actor]);
      // Receipt issuance takes a registered application SHARE lock first, so
      // none can commit after this deletion using pre-suspension admission.
      await db.query('DELETE FROM peer_session_receipts WHERE client_id=$1', [app.client_id]);
      await db.query(`INSERT INTO application_events(application_id,actor_person_id,action)
        VALUES($1,$2,'application.suspended')`, [target, actor]);
      await db.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
        VALUES($1,'application.suspended','application',$2,$3)`, [actor, target, body.reference]);
      await db.query('COMMIT');
      return { ...envelope(updated.rows[0]!), changed: true };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async lockAuthority(db: PoolClient, actor: string) {
    const person = await db.query<{ status: string }>('SELECT status FROM persons WHERE id=$1 ORDER BY id FOR SHARE', [actor]);
    if (person.rows[0]?.status !== 'active') return fail(403, 'operator_access_denied');
    const grant = await db.query(`SELECT person_id FROM platform_operator_roles
      WHERE person_id=$1 AND role='application_operator' AND revoked_at IS NULL FOR SHARE`, [actor]);
    if (!grant.rowCount) return fail(403, 'operator_access_denied');
  }
}
