import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthenticatedSubject } from './auth.js';
import { SessionRevocations } from './logout.js';
import { isCurrentPersonAuthentication } from './identity.js';

export class PeerSessionError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
interface ReceiptRow { issuer: string; sid: string; client_id: string; person_id: string; expires_at: Date; person_status: string }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const peerSessionContract = 'accesslobby.peer-session.v0.1';

/** First-party, per-session capabilities; no refresh/access token is retained or exposed by status. */
export class PeerSessions {
  constructor(private readonly pool: Pool, private readonly issuer: string,
    private readonly allowedClient: (client: string) => Promise<boolean>,
    private readonly admitted: (person: string, client: string) => Promise<boolean> = async () => true) {}

  async issue(actor: AuthenticatedSubject, personId: string) {
    const now = Math.floor(Date.now() / 1000);
    if (actor.issuer !== this.issuer || !actor.sid || !Number.isSafeInteger(actor.expiresAt) || actor.expiresAt! <= now) {
      throw new PeerSessionError(400, 'session_receipt_unavailable');
    }
    if (!await this.allowedClient(actor.client) || !await this.admitted(personId, actor.client) ||
        await new SessionRevocations(this.pool).isRevoked(actor.issuer, actor.sid)) throw new PeerSessionError(401, 'invalid_peer_session');
    const expiresAt = Math.min(now + 3600, actor.expiresAt!);
    const receipt = randomBytes(32).toString('base64url');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const person = await db.query<{ status: string; session_not_before: string }>(
        'SELECT status,session_not_before FROM persons WHERE id=$1 FOR SHARE', [personId]);
      if (person.rows[0]?.status !== 'active' || !isCurrentPersonAuthentication({
        sessionNotBefore: Number(person.rows[0].session_not_before),
      }, actor)) throw new PeerSessionError(401, 'invalid_peer_session');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify(['peer-receipts', actor.issuer, actor.sid, actor.client])]);
      await db.query("DELETE FROM peer_session_receipts WHERE expires_at < now() - interval '2 hours'");
      const count = await db.query<{ count: string }>(`SELECT count(*) FROM peer_session_receipts
        WHERE issuer=$1 AND sid=$2 AND client_id=$3 AND expires_at>now()`, [actor.issuer, actor.sid, actor.client]);
      if (Number(count.rows[0]!.count) >= 64) throw new PeerSessionError(429, 'session_receipt_limit');
      await db.query(`INSERT INTO peer_session_receipts(receipt_hash,issuer,sid,client_id,person_id,expires_at)
        VALUES($1,$2,$3,$4,$5,to_timestamp($6))`, [hash(receipt), actor.issuer, actor.sid, actor.client, personId, expiresAt]);
      await db.query('COMMIT');
      return { contract: peerSessionContract, receipt, expiresAt, checkAfterSeconds: 30, offlineGraceSeconds: 90 };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async find(receipt: string, client: string): Promise<ReceiptRow> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(receipt) || !/^[a-z0-9_-]{1,80}$/.test(client)) {
      throw new PeerSessionError(401, 'invalid_peer_session');
    }
    const result = await this.pool.query<ReceiptRow>(`SELECT r.*,p.status AS person_status
      FROM peer_session_receipts r JOIN persons p ON p.id=r.person_id WHERE receipt_hash=$1`, [hash(receipt)]);
    const row = result.rows[0];
    if (!row || row.issuer !== this.issuer || row.client_id !== client) throw new PeerSessionError(401, 'invalid_peer_session');
    return row;
  }

  async status(receipt: string, client: string) {
    const row = await this.find(receipt, client);
    const active = row.expires_at.getTime() > Date.now() && row.person_status === 'active' &&
      await this.allowedClient(client) && await this.admitted(row.person_id, client) &&
      !await new SessionRevocations(this.pool).isRevoked(row.issuer, row.sid);
    return { contract: peerSessionContract, active, expiresAt: Math.floor(row.expires_at.getTime() / 1000), checkAfterSeconds: 30 };
  }

  async end(receipt: string, client: string) {
    const row = await this.find(receipt, client);
    if (row.expires_at.getTime() <= Date.now() || !await this.allowedClient(client)) throw new PeerSessionError(401, 'invalid_peer_session');
    // Deterministic event key makes repeat requests idempotent without trusting a caller-supplied sid.
    await new SessionRevocations(this.pool).revoke(row.issuer, row.sid, 'peer-end:' + hash(receipt));
    return { contract: peerSessionContract, active: false, ended: true };
  }
}
