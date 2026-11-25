import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { OperatorError, OperatorStore, operatorContract, validOperatorReference } from './operators.js';
import { validId } from './organizations.js';

interface ReceiptMetadata { handle: string; createdAt: string; expiresAt: string }
interface GroupRow {
  handle: string; client_id: string; application_name: string | null; created_at: Date; expires_at: Date;
  receipt_count: number; receipts: ReceiptMetadata[];
}
const pageSize = 25;
const fail = (status: number, code: string): never => { throw new OperatorError(status, code); };
const validState = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const snapshot = (rows: ReceiptMetadata[]) => createHash('sha256').update(JSON.stringify(rows
  .map(row => [row.handle, new Date(row.createdAt).toISOString(), new Date(row.expiresAt).toISOString()])
  .sort((a, b) => a[0]!.localeCompare(b[0]!)))).digest('hex');

/** Inspection covers stored, unexpired receipt-backed app associations only.
 * It does not enumerate all IAM sessions, devices or arbitrary local app cookies. */
export class SessionInspectionStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  async list(actor: string, target: string, after?: unknown) {
    await this.operators.require(actor, 'read');
    if (!validId(target)) return fail(404, 'person_not_found');
    if (after !== undefined && after !== '' && !validId(after)) return fail(400, 'invalid_admin_cursor');
    const person = await this.pool.query<{ id: string; protected_operator: boolean }>(`SELECT p.id,
      EXISTS(SELECT 1 FROM platform_operator_roles g WHERE g.person_id=p.id AND g.revoked_at IS NULL) AS protected_operator
      FROM persons p WHERE p.id=$1`, [target]);
    if (!person.rows[0]) return fail(404, 'person_not_found');
    const result = await this.pool.query<GroupRow>(`WITH associations AS (
      SELECT min(r.console_handle::text)::uuid AS handle,r.client_id,min(r.created_at) AS created_at,
        max(r.expires_at) AS expires_at,count(*)::int AS receipt_count,
        json_agg(json_build_object('handle',r.console_handle,'createdAt',r.created_at,'expiresAt',r.expires_at)) AS receipts
      FROM peer_session_receipts r WHERE r.person_id=$1 AND r.expires_at>now()
      GROUP BY r.issuer,r.sid,r.client_id
    ) SELECT s.*,a.name AS application_name FROM associations s LEFT JOIN applications a ON a.client_id=s.client_id
      WHERE ($2::uuid IS NULL OR s.handle>$2::uuid) ORDER BY s.handle LIMIT $3`,
    [target, after || null, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract: operatorContract, person: { id: person.rows[0].id, protectedOperator: person.rows[0].protected_operator },
      sessions: rows.map(row => ({ handle: row.handle, clientId: row.client_id, applicationName: row.application_name,
        createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(), receiptCount: row.receipt_count,
        expectedState: snapshot(row.receipts) })), nextCursor: result.rows.length > pageSize ? rows.at(-1)!.handle : null };
  }

  async end(actor: string, target: string, handle: string, input: unknown) {
    await this.operators.require(actor, 'people');
    if (!validId(target)) return fail(404, 'person_not_found');
    if (!validId(handle)) return fail(404, 'app_session_not_found');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'invalid_app_session_end');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).length !== 2 || Object.keys(body).some(key => !['reference', 'expectedState'].includes(key)) ||
        !validOperatorReference(body.reference) || !validState(body.expectedState)) return fail(400, 'invalid_app_session_end');
    if (actor.toLowerCase() === target.toLowerCase()) return fail(403, 'self_session_end_forbidden');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Person-first deterministic locks match person controls/private role CLI.
      // issue() takes a person SHARE lock; new receipts wait until this commits.
      const people = await db.query<{ id: string; status: string }>(
        'SELECT id,status FROM persons WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [[actor, target]]);
      if (people.rows.find(person => person.id === actor.toLowerCase())?.status !== 'active') return fail(403, 'operator_access_denied');
      const role = await db.query(`SELECT person_id FROM platform_operator_roles
        WHERE person_id=$1 AND role='identity_operator' AND revoked_at IS NULL FOR SHARE`, [actor]);
      if (!role.rowCount) return fail(403, 'operator_access_denied');
      const person = people.rows.find(row => row.id === target.toLowerCase());
      if (!person) return fail(404, 'person_not_found');
      const protectedTarget = await db.query(`SELECT person_id FROM platform_operator_roles
        WHERE person_id=$1 AND revoked_at IS NULL FOR SHARE`, [target]);
      if (protectedTarget.rowCount) return fail(403, 'protected_operator_person');
      if (person.status !== 'active') return fail(409, 'person_session_unavailable');
      // Cleanup is bounded. Older tombstones are eligible for removal after
      // thirty days; no activity means retention may be longer, not a history UI.
      await db.query(`DELETE FROM console_session_endings WHERE handle IN
        (SELECT handle FROM console_session_endings WHERE ended_at<now()-interval '30 days' ORDER BY ended_at LIMIT 100)`);
      const previous = await db.query<{ person_id: string; actor_person_id: string; expected_state: string; reference: string; receipt_count: number }>(
        `SELECT person_id,actor_person_id,expected_state,reference,receipt_count FROM console_session_endings
          WHERE handle=$1 AND ended_at>=now()-interval '30 days'`, [handle]);
      const prior = previous.rows[0];
      if (prior) {
        if (prior.person_id !== target.toLowerCase()) return fail(404, 'app_session_not_found');
        if (prior.actor_person_id !== actor.toLowerCase() || prior.expected_state !== body.expectedState || prior.reference !== body.reference) {
          return fail(409, 'app_session_end_already_recorded');
        }
        await db.query('COMMIT');
        return { contract: operatorContract, personId: target.toLowerCase(), handle: handle.toLowerCase(),
          ended: true as const, changed: false, receiptCount: prior.receipt_count };
      }
      const anchor = await db.query<{ issuer: string; sid: string; client_id: string }>(`SELECT issuer,sid,client_id
        FROM peer_session_receipts WHERE person_id=$1 AND console_handle=$2 AND expires_at>now()`, [target, handle]);
      const key = anchor.rows[0];
      if (!key) return fail(404, 'app_session_not_found');
      const receipts = await db.query<{ console_handle: string; created_at: Date; expires_at: Date }>(`SELECT console_handle,created_at,expires_at
        FROM peer_session_receipts WHERE person_id=$1 AND issuer=$2 AND sid=$3 AND client_id=$4 AND expires_at>now()
        ORDER BY console_handle FOR UPDATE`, [target, key.issuer, key.sid, key.client_id]);
      const state = snapshot(receipts.rows.map(row => ({ handle: row.console_handle, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString() })));
      if (state !== body.expectedState) return fail(409, 'app_session_snapshot_changed');
      const removed = await db.query('DELETE FROM peer_session_receipts WHERE person_id=$1 AND console_handle=ANY($2::uuid[])',
        [target, receipts.rows.map(row => row.console_handle)]);
      if (removed.rowCount !== receipts.rows.length || !removed.rowCount) throw new Error('App association removal did not match inspected receipts');
      await db.query(`INSERT INTO console_session_endings(handle,person_id,actor_person_id,expected_state,reference,receipt_count)
        VALUES($1,$2,$3,$4,$5,$6)`, [handle, target, actor, body.expectedState, body.reference, removed.rowCount]);
      await db.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
        VALUES($1,'person.app_session_ended','person',$2,$3)`, [actor, target, body.reference]);
      await db.query('COMMIT');
      return { contract: operatorContract, personId: target.toLowerCase(), handle: handle.toLowerCase(),
        ended: true as const, changed: true, receiptCount: removed.rowCount };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}
