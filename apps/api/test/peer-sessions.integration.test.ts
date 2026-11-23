import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { PeerSessions, PeerSessionError } from '../src/peer-sessions.js';
import { SessionRevocations } from '../src/logout.js';

test('receipts reconcile missed peer logout without affecting another browser or leaking identities',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const issuer = `https://issuer.example/${randomUUID()}`, person = randomUUID(), sid = randomUUID();
    const actor = { issuer, subject: randomUUID(), sid, client: 'wp-site-a', expiresAt: Math.floor(Date.now() / 1000) + 300 };
    const peers = new PeerSessions(pool, issuer, async client => ['wp-site-a', 'wp-site-b'].includes(client));
    try {
      await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
      const a = await peers.issue(actor, person), b = await peers.issue({ ...actor, client: 'wp-site-b' }, person);
      const device = await peers.issue({ ...actor, sid: randomUUID(), client: 'wp-site-b' }, person);
      assert(a.receipt !== b.receipt); assert.equal(a.receipt.length, 43);
      assert.equal((await peers.status(a.receipt, actor.client)).active, true);
      assert.equal((await peers.status(b.receipt, 'wp-site-b')).active, true);
      const stored = await pool.query('SELECT receipt_hash FROM peer_session_receipts WHERE issuer=$1', [issuer]);
      assert(stored.rows.some(r => r.receipt_hash === createHash('sha256').update(a.receipt).digest('hex')));
      assert(!JSON.stringify(stored.rows).includes(a.receipt));
      await assert.rejects(peers.status(a.receipt, 'wp-site-b'), error => error instanceof PeerSessionError && error.status === 401);
      await assert.rejects(peers.end('x'.repeat(43), actor.client), PeerSessionError);
      await peers.end(a.receipt, actor.client); await peers.end(a.receipt, actor.client);
      assert.equal((await peers.status(b.receipt, 'wp-site-b')).active, false);
      assert.equal((await peers.status(device.receipt, 'wp-site-b')).active, true);
      assert.equal(await new SessionRevocations(pool).isRevoked('https://other.example', sid), false);
      await assert.rejects(peers.issue(actor, person), PeerSessionError);
      const response = JSON.stringify(await peers.status(b.receipt, 'wp-site-b'));
      for (const privateValue of [person, sid, actor.subject, a.receipt, b.receipt]) assert(!response.includes(privateValue));
    } finally { await pool.end(); }
  });

test('receipt status respects expiry, identity suspension, client suspension and admission withdrawal',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const person = randomUUID(), issuer = `https://issuer.example/${randomUUID()}`;
    const actor = { issuer, subject: randomUUID(), sid: randomUUID(), client: 'wp-pilot', expiresAt: Math.floor(Date.now() / 1000) + 300 };
    let allowed = true, admitted = true;
    const peers = new PeerSessions(pool, issuer, async () => allowed, async () => admitted);
    try {
      await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
      const receipt = await peers.issue(actor, person);
      admitted = false; assert.equal((await peers.status(receipt.receipt, actor.client)).active, false);
      admitted = true; allowed = false; assert.equal((await peers.status(receipt.receipt, actor.client)).active, false);
      await assert.rejects(peers.end(receipt.receipt, actor.client), PeerSessionError);
      allowed = true;
      await pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [person]);
      assert.equal((await peers.status(receipt.receipt, actor.client)).active, false);
      await pool.query("UPDATE persons SET status='active' WHERE id=$1", [person]);
      await pool.query("UPDATE peer_session_receipts SET expires_at=now()-interval '1 second' WHERE person_id=$1", [person]);
      assert.equal((await peers.status(receipt.receipt, actor.client)).active, false);
      await assert.rejects(peers.end(receipt.receipt, actor.client), PeerSessionError);
      await assert.rejects(peers.issue({ ...actor, sid: undefined }, person), PeerSessionError);
    } finally { await pool.end(); }
  });
