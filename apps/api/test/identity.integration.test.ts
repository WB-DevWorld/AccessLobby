import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PostgresIdentityStore } from '../src/identity.js';

test('durable mapping is stable, concurrent-safe and issuer-specific', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  try {
    const store = new PostgresIdentityStore(pool);
    const subject = `test-${crypto.randomUUID()}`;
    const actor = { issuer: 'https://one.example/realms/test', subject, client: 'pilot' };
    const results = await Promise.all(Array.from({ length: 8 }, () => store.resolve(actor)));
    assert.equal(new Set(results.map(person => person.id)).size, 1);
    assert.equal((await store.resolve(actor)).id, results[0]!.id);
    assert.notEqual((await store.resolve({ ...actor, issuer: 'https://two.example/realms/test' })).id, results[0]!.id);
    const count = await pool.query<{ count: string }>('SELECT count(*) FROM iam_subject_links WHERE issuer=$1 AND subject=$2', [actor.issuer, subject]);
    assert.equal(Number(count.rows[0]!.count), 1);
  } finally { await pool.end(); }
});
