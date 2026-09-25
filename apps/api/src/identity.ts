import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedSubject } from './auth.js';

export interface Identity { id: string; status: 'active' | 'suspended' }
export interface IdentityStore { resolve(subject: AuthenticatedSubject): Promise<Identity> }

export class PostgresIdentityStore implements IdentityStore {
  constructor(private readonly pool: Pool) {}

  async resolve({ issuer, subject }: AuthenticatedSubject): Promise<Identity> {
    const db: PoolClient = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // The advisory lock serializes first login for a particular (issuer, subject).
      // A unique constraint remains the final protection against duplicates.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([issuer, subject])]);
      const existing = await db.query<Identity>(
        'SELECT p.id, p.status FROM iam_subject_links l JOIN persons p ON p.id = l.person_id WHERE l.issuer = $1 AND l.subject = $2',
        [issuer, subject]
      );
      if (existing.rows[0]) {
        await db.query('COMMIT');
        return existing.rows[0];
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
