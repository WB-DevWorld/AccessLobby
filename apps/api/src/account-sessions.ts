import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedSubject } from './auth.js';
import { isCurrentPersonAuthentication } from './identity.js';
import { OperatorError } from './operators.js';
import { validId } from './organizations.js';

export const accountSessionsContract = 'accesslobby.account-sessions.v0.1' as const;
export const accountSecurityEventsContract = 'accesslobby.account-security-events.v0.1' as const;
const pageSize = 25;
const fail = (status: number, code: string): never => { throw new OperatorError(status, code); };
const validState = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const safeApplicationName = (value: string | null) => typeof value === 'string' && value.length >= 2 && value.length <= 120 &&
  !/[\x00-\x1f\x7f]/.test(value) ? value : null;
interface ReceiptMetadata { handle: string; createdAt: string; expiresAt: string }
interface GroupRow {
  handle: string; client_id: string; application_name: string | null; created_at: Date; expires_at: Date;
  receipt_count: number; receipts: ReceiptMetadata[]; current_browser: boolean;
}
const snapshot = (rows: ReceiptMetadata[]) => createHash('sha256').update(JSON.stringify(rows
  .map(row => [row.handle, new Date(row.createdAt).toISOString(), new Date(row.expiresAt).toISOString()])
  .sort((a, b) => a[0]!.localeCompare(b[0]!)))).digest('hex');

/** Self-service covers only this person's stored, unexpired app associations.
 * It neither enumerates IAM devices nor changes account or app permissions. */
export class AccountSessionsStore {
  constructor(private readonly pool: Pool) {}

  private async person(db: PoolClient, personId: string, actor: AuthenticatedSubject, lock: 'share' | 'update') {
    if (!validId(personId) || !actor.sid || actor.client !== 'accesslobby-web' ||
        !Number.isSafeInteger(actor.expiresAt) || actor.expiresAt! <= Math.floor(Date.now() / 1000)) {
      return fail(401, 'account_session_unauthorized');
    }
    const result = await db.query<{ status: string; session_not_before: string }>(`SELECT status,session_not_before
      FROM persons WHERE id=$1 FOR ${lock === 'update' ? 'UPDATE' : 'SHARE'}`, [personId]);
    const person = result.rows[0];
    // A blocked transaction must not outlive its authenticating bearer.
    if (!person || actor.expiresAt! <= Math.floor(Date.now() / 1000)) return fail(401, 'account_session_unauthorized');
    if (person.status !== 'active') return fail(403, 'identity_suspended');
    const link = await db.query('SELECT 1 FROM iam_subject_links WHERE person_id=$1 AND issuer=$2 AND subject=$3',
      [personId, actor.issuer, actor.subject]);
    if (!link.rowCount) return fail(401, 'account_session_unauthorized');
    if (!isCurrentPersonAuthentication({ sessionNotBefore: Number(person.session_not_before) }, actor)) return fail(401, 'session_ended');
    const revoked = await db.query(`SELECT 1 FROM revoked_oidc_sessions
      WHERE issuer=$1 AND sid=$2 AND expires_at>clock_timestamp()`, [actor.issuer, actor.sid]);
    if (revoked.rowCount) return fail(401, 'session_ended');
  }

  async list(personId: string, actor: AuthenticatedSubject, after?: unknown) {
    if (after !== undefined && after !== '' && !validId(after)) return fail(400, 'invalid_account_session_cursor');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await this.person(db, personId, actor, 'share');
      const result = await db.query<GroupRow>(`WITH associations AS (
        SELECT min(r.console_handle::text)::uuid AS handle,r.client_id,min(r.created_at) AS created_at,
          max(r.expires_at) AS expires_at,count(*)::int AS receipt_count,
          bool_and(r.issuer=$2 AND r.sid=$3) AS current_browser,
          json_agg(json_build_object('handle',r.console_handle,'createdAt',r.created_at,'expiresAt',r.expires_at)) AS receipts
        FROM peer_session_receipts r WHERE r.person_id=$1 AND r.expires_at>clock_timestamp()
          AND NOT EXISTS(SELECT 1 FROM revoked_oidc_sessions v WHERE v.issuer=r.issuer AND v.sid=r.sid AND v.expires_at>clock_timestamp())
        GROUP BY r.issuer,r.sid,r.client_id
      ) SELECT s.*,a.name AS application_name FROM associations s LEFT JOIN applications a ON a.client_id=s.client_id
        WHERE ($4::uuid IS NULL OR s.handle>$4::uuid) ORDER BY s.handle LIMIT $5`,
      [personId, actor.issuer, actor.sid, after || null, pageSize + 1]);
      const rows = result.rows.slice(0, pageSize);
      await db.query('COMMIT');
      return { contract: accountSessionsContract, sessions: rows.map(row => ({ handle: row.handle, clientId: row.client_id,
        applicationName: safeApplicationName(row.application_name), createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString(),
        receiptCount: row.receipt_count, expectedState: snapshot(row.receipts), currentBrowser: row.current_browser })),
      nextCursor: result.rows.length > pageSize ? rows.at(-1)!.handle : null };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async history(personId: string, actor: AuthenticatedSubject, after?: unknown) {
    if (after !== undefined && after !== '' && !validId(after)) return fail(400, 'invalid_account_security_cursor');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await this.person(db, personId, actor, 'share');
      let cursor: string | null = null;
      if (after) {
        // Resolve only the signed-in person's opaque event ID. A foreign,
        // unknown or no-longer-visible cursor has the same safe failure.
        const previous = await db.query<{ id: string }>(`SELECT id FROM account_security_events
          WHERE person_id=$1 AND event_handle=$2 AND occurred_at>=clock_timestamp()-interval '30 days'`, [personId, after]);
        if (!previous.rows[0]) return fail(400, 'invalid_account_security_cursor');
        cursor = previous.rows[0].id;
      }
      const found = await db.query<{ id: string; event_handle: string; action: 'app_session_ended'; client_id: string;
        application_name: string | null; occurred_at: Date; receipt_count: number }>(`SELECT e.id,e.event_handle,e.action,e.client_id,
          a.name AS application_name,e.occurred_at,e.receipt_count FROM account_security_events e
        LEFT JOIN applications a ON a.client_id=e.client_id
        WHERE e.person_id=$1 AND e.occurred_at>=clock_timestamp()-interval '30 days'
          AND ($2::bigint IS NULL OR e.id<$2::bigint) ORDER BY e.id DESC LIMIT $3`, [personId, cursor, pageSize + 1]);
      const rows = found.rows.slice(0, pageSize);
      await db.query('COMMIT');
      return { contract: accountSecurityEventsContract, events: rows.map(row => ({ id: row.event_handle, action: row.action,
        clientId: row.client_id, applicationName: safeApplicationName(row.application_name), occurredAt: row.occurred_at.toISOString(), receiptCount: row.receipt_count })),
      nextCursor: found.rows.length > pageSize ? rows.at(-1)!.event_handle : null };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async end(personId: string, actor: AuthenticatedSubject, handle: string, input: unknown) {
    if (!validId(handle)) return fail(404, 'app_session_not_found');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'invalid_app_session_end');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'expectedState') || !validState(body.expectedState)) return fail(400, 'invalid_app_session_end');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Receipt issuance locks this person FOR SHARE. The UPDATE lock fences
      // issuance, status transitions and self-service removals through commit.
      await this.person(db, personId, actor, 'update');
      await db.query(`DELETE FROM account_session_endings WHERE handle IN
        (SELECT handle FROM account_session_endings WHERE person_id=$1 AND ended_at<now()-interval '30 days'
          ORDER BY ended_at LIMIT 100)`, [personId]);
      await db.query(`DELETE FROM account_security_events WHERE id IN
        (SELECT id FROM account_security_events WHERE person_id=$1 AND occurred_at<now()-interval '30 days'
          ORDER BY occurred_at LIMIT 100)`, [personId]);
      const previous = await db.query<{ expected_state: string; receipt_count: number }>(`SELECT expected_state,receipt_count
        FROM account_session_endings WHERE handle=$1 AND person_id=$2 AND ended_at>=now()-interval '30 days'`, [handle, personId]);
      const prior = previous.rows[0];
      if (prior) {
        if (prior.expected_state !== body.expectedState) return fail(409, 'app_session_end_already_recorded');
        await db.query('COMMIT');
        return { contract: accountSessionsContract, handle: handle.toLowerCase(), ended: true as const,
          changed: false, receiptCount: prior.receipt_count };
      }
      const anchor = await db.query<{ issuer: string; sid: string; client_id: string }>(`SELECT issuer,sid,client_id
        FROM peer_session_receipts WHERE person_id=$1 AND console_handle=$2 AND expires_at>clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM revoked_oidc_sessions v WHERE v.issuer=peer_session_receipts.issuer
          AND v.sid=peer_session_receipts.sid AND v.expires_at>clock_timestamp())`, [personId, handle]);
      const key = anchor.rows[0];
      if (!key) return fail(404, 'app_session_not_found');
      const receipts = await db.query<{ console_handle: string; created_at: Date; expires_at: Date }>(`SELECT console_handle,created_at,expires_at
        FROM peer_session_receipts WHERE person_id=$1 AND issuer=$2 AND sid=$3 AND client_id=$4 AND expires_at>clock_timestamp()
        ORDER BY console_handle FOR UPDATE`, [personId, key.issuer, key.sid, key.client_id]);
      const state = snapshot(receipts.rows.map(row => ({ handle: row.console_handle, createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString() })));
      if (state !== body.expectedState) return fail(409, 'app_session_snapshot_changed');
      const removed = await db.query('DELETE FROM peer_session_receipts WHERE person_id=$1 AND console_handle=ANY($2::uuid[])',
        [personId, receipts.rows.map(row => row.console_handle)]);
      if (removed.rowCount !== receipts.rows.length || !removed.rowCount) throw new Error('App association removal failed');
      await db.query(`INSERT INTO account_session_endings(handle,person_id,expected_state,receipt_count) VALUES($1,$2,$3,$4)`,
        [handle, personId, body.expectedState, removed.rowCount]);
      await db.query(`INSERT INTO account_security_events(person_id,action,client_id,handle,receipt_count) VALUES($1,'app_session_ended',$2,$3,$4)`,
        [personId, key.client_id, handle, removed.rowCount]);
      await db.query('COMMIT');
      return { contract: accountSessionsContract, handle: handle.toLowerCase(), ended: true as const,
        changed: true, receiptCount: removed.rowCount };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}
