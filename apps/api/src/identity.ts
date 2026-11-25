import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedSubject } from './auth.js';

export interface Identity { id: string; status: 'active' | 'suspended'; sessionNotBefore?: number }
export interface IdentityStore { resolve(subject: AuthenticatedSubject): Promise<Identity> }

/** A transition invalidates all earlier bearer authentication, including on resume.
 * The cutoff is an integer issuer second; fresh authentication may need the next
 * second. It never extends token expiry or changes IAM credentials/lifetimes. */
export function isCurrentPersonAuthentication(person: Pick<Identity, 'sessionNotBefore'>,
  actor: Pick<AuthenticatedSubject, 'issuedAt'>): boolean {
  const cutoff = person.sessionNotBefore ?? 0;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0) return false;
  return cutoff === 0 || (Number.isSafeInteger(actor.issuedAt) && actor.issuedAt! >= cutoff);
}

export class PostgresIdentityStore implements IdentityStore {
  constructor(private readonly pool: Pool) {}

  async resolve({ issuer, subject }: AuthenticatedSubject): Promise<Identity> {
    const db: PoolClient = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // The advisory lock serializes first login for a particular (issuer, subject).
      // A unique constraint remains the final protection against duplicates.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([issuer, subject])]);
      const existing = await db.query<Identity & { session_not_before: string }>(
        'SELECT p.id, p.status, p.session_not_before FROM iam_subject_links l JOIN persons p ON p.id = l.person_id WHERE l.issuer = $1 AND l.subject = $2',
        [issuer, subject]
      );
      if (existing.rows[0]) {
        await db.query('COMMIT');
        const row = existing.rows[0];
        const cutoff = Number(row.session_not_before);
        return { id: row.id, status: row.status, ...(cutoff > 0 ? { sessionNotBefore: cutoff } : {}) };
      }
      const id = randomUUID();
      await db.query('INSERT INTO persons (id, status) VALUES ($1, $2)', [id, 'active']);
      await db.query('INSERT INTO iam_subject_links (issuer, subject, person_id) VALUES ($1, $2, $3)', [issuer, subject, id]);
      await db.query('COMMIT');
      return { id, status: 'active' };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
}
