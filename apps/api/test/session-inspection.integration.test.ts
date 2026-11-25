import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import { PeerSessions, PeerSessionError } from '../src/peer-sessions.js';
import { SessionInspectionStore } from '../src/session-inspection.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const known = (code: string) => (error: unknown) => error instanceof OperatorError && error.code === code;
async function fixture() {
  const database = await openIsolatedDatabase(); const { pool } = database;
  const actor = randomUUID(), reader = randomUUID(), target = randomUUID(), other = randomUUID();
  for (const id of [actor, reader, target, other]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [id]);
  await manageOperatorRole(pool, actor, 'grant', 'identity_operator', 'session-fixture-operator');
  await manageOperatorRole(pool, reader, 'grant', 'support_reader', 'session-fixture-reader');
  const issuer = 'https://private-issuer.example/realms/private', sid = randomUUID(), subject = randomUUID();
  const tokenActor = { issuer, sid, subject, client: 'session-app-a', expiresAt: Math.floor(Date.now() / 1000) + 300 };
  const peers = new PeerSessions(pool, issuer, async () => true);
  const store = new SessionInspectionStore(pool, new OperatorStore(pool));
  return { ...database, actor, reader, target, other, issuer, sid, subject, tokenActor, peers, store };
}

test('session inspection is bounded and exposes independent handles and metadata only', enabled, async () => {
  const f = await fixture();
  try {
    const a = await f.peers.issue(f.tokenActor, f.target), duplicate = await f.peers.issue(f.tokenActor, f.target);
    await f.peers.issue({ ...f.tokenActor, client: 'session-app-b' }, f.target);
    const expired = await f.peers.issue({ ...f.tokenActor, sid: randomUUID(), client: 'expired-app' }, f.target);
    await f.pool.query('UPDATE peer_session_receipts SET expires_at=now()-interval \'1 second\' WHERE receipt_hash=$1', [createHash('sha256').update(expired.receipt).digest('hex')]);
    const page = await f.store.list(f.reader, f.target);
    assert.equal(page.sessions.length, 2); assert.equal(page.sessions.find(row => row.clientId === f.tokenActor.client)!.receiptCount, 2);
    const text = JSON.stringify(page);
    for (const value of [f.issuer, f.sid, f.subject, a.receipt, duplicate.receipt, createHash('sha256').update(a.receipt).digest('hex')]) assert(!text.includes(value));
    assert(!text.includes('expired-app')); assert(!text.includes('device')); assert(!text.includes('receipt_hash'));
    for (const item of page.sessions) { assert.match(item.handle, /^[a-f0-9-]{36}$/); assert.match(item.expectedState, /^[a-f0-9]{64}$/); }
    for (let i = 0; i < 27; i++) await f.peers.issue({ ...f.tokenActor, client: `paging-${i}` }, f.target);
    const first = await f.store.list(f.actor, f.target); assert.equal(first.sessions.length, 25); assert(first.nextCursor);
    const next = await f.store.list(f.actor, f.target, first.nextCursor);
    assert.equal(next.sessions.length, 4); assert.equal(next.nextCursor, null);
    assert.equal(new Set([...first.sessions, ...next.sessions].map(row => row.handle)).size, 29);
    await assert.rejects(f.store.list(f.target, f.target), known('operator_access_denied'));
    await assert.rejects(f.store.list(f.actor, randomUUID()), known('person_not_found'));
    await assert.rejects(f.store.list(f.actor, f.target, 'bad-cursor'), known('invalid_admin_cursor'));
  } finally { await f.close(); }
});

test('session ending requires current person authority and refuses self, protected and foreign handles', enabled, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.tokenActor, f.target), row = (await f.store.list(f.actor, f.target)).sessions[0]!;
    const body = { reference: 'session-end-security', expectedState: row.expectedState };
    await assert.rejects(f.store.end(f.reader, f.target, row.handle, body), known('operator_access_denied'));
    await assert.rejects(f.store.end(f.actor, f.actor, row.handle, body), known('self_session_end_forbidden'));
    await assert.rejects(f.store.end(f.actor, f.reader, row.handle, body), known('protected_operator_person'));
    await assert.rejects(f.store.end(f.actor, f.other, row.handle, body), known('app_session_not_found'));
    for (const bad of [null, [], { ...body, reference: 'secret free text' }, { ...body, expectedState: 'bad' }, { ...body, sid: f.sid }]) {
      await assert.rejects(f.store.end(f.actor, f.target, row.handle, bad), known('invalid_app_session_end'));
    }
    await manageOperatorRole(f.pool, f.actor, 'revoke', 'identity_operator', 'session-end-role-revoked');
    await assert.rejects(f.store.end(f.actor, f.target, row.handle, body), known('operator_access_denied'));
    assert.equal((await f.peers.status(receipt.receipt, f.tokenActor.client)).active, true);
  } finally { await f.close(); }
});

test('stale snapshots cannot end fresh authentication and exact retries preserve later associations', enabled, async () => {
  const f = await fixture();
  try {
    const original = await f.peers.issue(f.tokenActor, f.target), sibling = await f.peers.issue(f.tokenActor, f.target);
    const otherApp = await f.peers.issue({ ...f.tokenActor, client: 'session-app-b' }, f.target);
    const otherBrowser = await f.peers.issue({ ...f.tokenActor, sid: randomUUID() }, f.target);
    const old = (await f.store.list(f.actor, f.target)).sessions.find(row => row.clientId === 'session-app-a' && row.receiptCount === 2)!;
    const newer = await f.peers.issue(f.tokenActor, f.target);
    await assert.rejects(f.store.end(f.actor, f.target, old.handle, { reference: 'session-stale-request', expectedState: old.expectedState }), known('app_session_snapshot_changed'));
    assert.equal((await f.peers.status(newer.receipt, f.tokenActor.client)).active, true);
    const current = (await f.store.list(f.actor, f.target)).sessions.find(row => row.receiptCount === 3)!;
    const body = { reference: 'session-current-request', expectedState: current.expectedState };
    const first = await f.store.end(f.actor, f.target, current.handle, body);
    assert.equal(first.changed, true); assert.equal(first.receiptCount, 3);
    for (const receipt of [original, sibling, newer]) await assert.rejects(f.peers.status(receipt.receipt, f.tokenActor.client), PeerSessionError);
    assert.equal((await f.peers.status(otherApp.receipt, 'session-app-b')).active, true);
    assert.equal((await f.peers.status(otherBrowser.receipt, f.tokenActor.client)).active, true);
    const fresh = await f.peers.issue(f.tokenActor, f.target);
    const retries = await Promise.all(Array.from({ length: 8 }, () => f.store.end(f.actor, f.target, current.handle, body)));
    assert(retries.every(result => result.changed === false));
    assert.equal((await f.peers.status(fresh.receipt, f.tokenActor.client)).active, true);
    await assert.rejects(f.store.end(f.actor, f.target, current.handle, { ...body, reference: 'different-request' }), known('app_session_end_already_recorded'));
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM operator_audit_events WHERE action='person.app_session_ended'")).rows[0].count, 1);
  } finally { await f.close(); }
});

test('session removal, idempotency record and audit fail atomically', enabled, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.tokenActor, f.target), row = (await f.store.list(f.actor, f.target)).sessions[0]!;
    await f.pool.query(`CREATE FUNCTION fail_session_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='person.app_session_ended' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_session_audit BEFORE INSERT ON operator_audit_events FOR EACH ROW EXECUTE FUNCTION fail_session_audit();`);
    await assert.rejects(f.store.end(f.actor, f.target, row.handle, { reference: 'session-audit-failure', expectedState: row.expectedState }));
    assert.equal((await f.peers.status(receipt.receipt, f.tokenActor.client)).active, true);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM console_session_endings')).rows[0].count, 0);
  } finally { await f.close(); }
});

test('a simultaneous receipt issue remains usable whichever snapshot/end transaction wins', enabled, async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 5; i++) {
      const token = { ...f.tokenActor, sid: randomUUID(), client: `race-${i}` };
      const oldReceipt = await f.peers.issue(token, f.target), current = (await f.store.list(f.actor, f.target)).sessions.find(row => row.clientId === token.client)!;
      const [ending, issued] = await Promise.allSettled([
        f.store.end(f.actor, f.target, current.handle, { reference: 'session-issuance-race', expectedState: current.expectedState }),
        f.peers.issue(token, f.target),
      ]);
      assert.equal(issued.status, 'fulfilled'); if (issued.status !== 'fulfilled') throw issued.reason;
      assert.equal((await f.peers.status(issued.value.receipt, token.client)).active, true);
      if (ending.status === 'rejected') {
        assert(known('app_session_snapshot_changed')(ending.reason));
        assert.equal((await f.peers.status(oldReceipt.receipt, token.client)).active, true);
      } else await assert.rejects(f.peers.status(oldReceipt.receipt, token.client), PeerSessionError);
    }
  } finally { await f.close(); }
});

test('a protected-role grant in progress serializes ending and cleanup remains bounded', enabled, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.tokenActor, f.target), row = (await f.store.list(f.actor, f.target)).sessions[0]!;
    const blocker = await f.pool.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT id FROM persons WHERE id=$1 FOR UPDATE', [f.target]);
      await blocker.query("INSERT INTO platform_operator_roles(person_id,role,grant_reference) VALUES($1,'support_reader','session-role-race')", [f.target]);
      const ending = f.store.end(f.actor, f.target, row.handle, { reference: 'session-role-race', expectedState: row.expectedState });
      const outcome = await Promise.race([ending.then(() => 'finished', () => 'finished'), new Promise(resolve => setTimeout(() => resolve('blocked'), 30))]);
      assert.equal(outcome, 'blocked'); await blocker.query('COMMIT');
      await assert.rejects(ending, known('protected_operator_person'));
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    assert.equal((await f.peers.status(receipt.receipt, f.tokenActor.client)).active, true);
    await manageOperatorRole(f.pool, f.target, 'revoke', 'support_reader', 'session-role-race-revoke');
    await f.pool.query(`INSERT INTO console_session_endings(handle,person_id,actor_person_id,expected_state,reference,receipt_count,ended_at)
      SELECT gen_random_uuid(),$1,$2,repeat('a',64),'session-old-tombstone',1,now()-interval '31 days' FROM generate_series(1,105)`, [f.target, f.actor]);
    await f.store.end(f.actor, f.target, row.handle, { reference: 'session-bounded-cleanup', expectedState: row.expectedState });
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM console_session_endings WHERE ended_at<now()-interval '30 days'")).rows[0].count, 5);
  } finally { await f.close(); }
});
