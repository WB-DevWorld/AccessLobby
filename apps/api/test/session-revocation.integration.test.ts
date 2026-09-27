import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { SessionRevocations } from '../src/logout.js';

test('signed logout event persists revocation and cannot be replayed', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const store = new SessionRevocations(pool);
  const issuer = `https://issuer.example/${crypto.randomUUID()}`;
  const sid = crypto.randomUUID();
  try {
    assert.equal(await store.isRevoked(issuer, sid), false);
    assert.equal(await store.revoke(issuer, sid, crypto.randomUUID()), true);
    assert.equal(await store.isRevoked(issuer, sid), true);
    const jti = crypto.randomUUID();
    assert.equal(await store.revoke(issuer, sid, jti), true);
    assert.equal(await store.revoke(issuer, sid, jti), false);
    assert.equal(await store.isRevoked('https://other.example', sid), false);
  } finally { await pool.end(); }
});
