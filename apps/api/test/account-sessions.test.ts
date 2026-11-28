import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { AccountSessionsStore, accountSessionsContract, accountSecurityEventsContract } from '../src/account-sessions.js';
import { OperatorError } from '../src/operators.js';
import { PeerSessionError, PeerSessions } from '../src/peer-sessions.js';
import { SessionRevocations } from '../src/logout.js';
import { manageOperatorRole } from '../src/manage-operator.js';

const live = { skip: !process.env.TEST_DATABASE_URL };
const known = (status: number, code: string) => (error: unknown) => error instanceof OperatorError && error.status === status && error.code === code;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const db = await openIsolatedDatabase(), person = randomUUID(), other = randomUUID();
  const issuer = 'https://private-issuer.example/realms/own-private', subject = randomUUID(), otherSubject = randomUUID();
  const actor = { issuer, subject, sid: randomUUID(), client: 'accesslobby-web', issuedAt: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 300 };
  for (const id of [person, other]) await db.pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [id]);
  await db.pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3),($1,$4,$5)', [issuer, subject, person, otherSubject, other]);
  const peers = new PeerSessions(db.pool, issuer, async () => true), store = new AccountSessionsStore(db.pool);
  const token = { ...actor, client: 'account-app-a' }, otherActor = { ...actor, subject: otherSubject, sid: randomUUID() };
  return { ...db, person, other, actor, issuer, subject, otherActor, token, peers, store };
}

test('ordinary users list only their recorded groups, with safe browser labels and bounded pagination', live, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.token, f.person), duplicate = await f.peers.issue(f.token, f.person);
    await f.peers.issue({ ...f.token, client: 'account-app-b', sid: randomUUID() }, f.person);
    await f.peers.issue({ ...f.token, subject: f.otherActor.subject, client: 'foreign-app', sid: f.otherActor.sid }, f.other);
    const expired = await f.peers.issue({ ...f.token, client: 'expired-app' }, f.person);
    await f.pool.query("UPDATE peer_session_receipts SET expires_at=now()-interval '1 second' WHERE receipt_hash=$1", [hash(expired.receipt)]);
    const revokedSid = randomUUID();
    await f.peers.issue({ ...f.token, sid: revokedSid, client: 'revoked-app' }, f.person);
    await new SessionRevocations(f.pool).revoke(f.issuer, revokedSid, randomUUID());
    const page = await f.store.list(f.person, f.actor);
    assert.equal(page.contract, accountSessionsContract); assert.equal(page.sessions.length, 2);
    assert.equal(page.sessions.find(row => row.clientId === 'account-app-a')?.receiptCount, 2);
    assert.equal(page.sessions.find(row => row.clientId === 'account-app-a')?.currentBrowser, true);
    assert.equal(page.sessions.find(row => row.clientId === 'account-app-b')?.currentBrowser, false);
    const encoded = JSON.stringify(page);
    for (const privateValue of [f.issuer, f.subject, f.actor.sid, receipt.receipt, duplicate.receipt, hash(receipt.receipt)]) assert(!encoded.includes(privateValue));
    for (const unwanted of ['foreign-app', 'expired-app', 'revoked-app', 'device', 'receipt_hash', 'subject', 'issuer']) assert(!encoded.includes(unwanted));
    assert.equal((await f.store.list(f.other, f.otherActor)).sessions[0]?.clientId, 'foreign-app');
    await assert.rejects(f.store.list(f.other, f.actor), known(401, 'account_session_unauthorized'));
    for (let i = 0; i < 27; i++) await f.peers.issue({ ...f.token, client: `page-app-${i}` }, f.person);
    const first = await f.store.list(f.person, f.actor); assert.equal(first.sessions.length, 25); assert(first.nextCursor);
    const next = await f.store.list(f.person, f.actor, first.nextCursor);
    assert.equal(next.sessions.length, 4); assert.equal(next.nextCursor, null);
    assert.equal(new Set([...first.sessions, ...next.sessions].map(row => row.handle)).size, 29);
    for (const after of [null, [], 'not-an-id', '0 OR 1=1']) {
      await assert.rejects(f.store.list(f.person, f.actor, after), known(400, 'invalid_account_session_cursor'));
    }
  } finally { await f.close(); }
});

test('own session ending works without an operator role and never accepts foreign handles or extra authority', live, async () => {
  const f = await fixture();
  try {
    const own = await f.peers.issue(f.token, f.person);
    await f.peers.issue({ ...f.token, subject: f.otherActor.subject, sid: f.otherActor.sid }, f.other);
    const ownRow = (await f.store.list(f.person, f.actor)).sessions[0]!, foreign = (await f.store.list(f.other, f.otherActor)).sessions[0]!;
    await assert.rejects(f.store.end(f.person, f.actor, foreign.handle, { expectedState: foreign.expectedState }), known(404, 'app_session_not_found'));
    await assert.rejects(f.store.end(f.other, f.actor, foreign.handle, { expectedState: foreign.expectedState }), known(401, 'account_session_unauthorized'));
    for (const bad of [null, [], {}, { expectedState: 'bad' }, { expectedState: ownRow.expectedState, personId: f.other },
      { expectedState: ownRow.expectedState, sid: f.token.sid }, { expectedState: ownRow.expectedState, reference: 'operator-action' },
      Object.assign(Object.create({ expectedState: ownRow.expectedState }), { unrelated: 'field' })]) {
      await assert.rejects(f.store.end(f.person, f.actor, ownRow.handle, bad), known(400, 'invalid_app_session_end'));
    }
    await assert.rejects(f.store.end(f.person, f.actor, 'bad-handle', { expectedState: ownRow.expectedState }), known(404, 'app_session_not_found'));
    assert.equal((await f.peers.status(own.receipt, f.token.client)).active, true);
    // Holding a platform role does not remove a person's own self-service rights.
    await manageOperatorRole(f.pool, f.person, 'grant', 'identity_operator', 'self-service-operator-person');
    const ended = await f.store.end(f.person, f.actor, ownRow.handle.toUpperCase(), { expectedState: ownRow.expectedState });
    assert.deepEqual(ended, { contract: accountSessionsContract, handle: ownRow.handle, ended: true, changed: true, receiptCount: 1 });
    await assert.rejects(f.peers.status(own.receipt, f.token.client), PeerSessionError);
    assert.equal((await f.store.list(f.other, f.otherActor)).sessions.length, 1);
    assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM operator_audit_events WHERE action='person.app_session_ended'")).rows[0].n, 0);
    const events = await f.pool.query('SELECT person_id,action,handle,receipt_count FROM account_security_events');
    assert.deepEqual(events.rows, [{ person_id: f.person, action: 'app_session_ended', handle: ownRow.handle, receipt_count: 1 }]);
  } finally { await f.close(); }
});

test('a stale page cannot end changed records and exact concurrent retries preserve fresh sign-ins', live, async () => {
  const f = await fixture();
  try {
    const original = await f.peers.issue(f.token, f.person);
    const sibling = await f.peers.issue(f.token, f.person);
    const otherApp = await f.peers.issue({ ...f.token, client: 'unrelated-app' }, f.person);
    const otherBrowser = await f.peers.issue({ ...f.token, sid: randomUUID() }, f.person);
    const old = (await f.store.list(f.person, f.actor)).sessions.find(row => row.receiptCount === 2)!;
    const newer = await f.peers.issue(f.token, f.person);
    await assert.rejects(f.store.end(f.person, f.actor, old.handle, { expectedState: old.expectedState }), known(409, 'app_session_snapshot_changed'));
    assert.equal((await f.peers.status(newer.receipt, f.token.client)).active, true);
    const current = (await f.store.list(f.person, f.actor)).sessions.find(row => row.receiptCount === 3)!;
    const first = await f.store.end(f.person, f.actor, current.handle, { expectedState: current.expectedState });
    assert.equal(first.receiptCount, 3); assert.equal(first.changed, true);
    for (const ended of [original, sibling, newer]) await assert.rejects(f.peers.status(ended.receipt, f.token.client), PeerSessionError);
    assert.equal((await f.peers.status(otherApp.receipt, 'unrelated-app')).active, true);
    assert.equal((await f.peers.status(otherBrowser.receipt, f.token.client)).active, true);
    const fresh = await f.peers.issue(f.token, f.person);
    const retries = await Promise.all(Array.from({ length: 8 }, () => f.store.end(f.person, f.actor, current.handle, { expectedState: current.expectedState })));
    assert(retries.every(row => row.changed === false));
    assert.equal((await f.peers.status(fresh.receipt, f.token.client)).active, true);
    await assert.rejects(f.store.end(f.person, f.actor, current.handle, { expectedState: '0'.repeat(64) }), known(409, 'app_session_end_already_recorded'));
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM account_security_events')).rows[0].n, 1);
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM account_session_endings')).rows[0].n, 1);
  } finally { await f.close(); }
});

test('active current authentication is rechecked and expired or suspended authentication never ends a session', live, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.token, f.person), row = (await f.store.list(f.person, f.actor)).sessions[0]!;
    const input = { expectedState: row.expectedState };
    for (const actor of [{ ...f.actor, expiresAt: 0 }, { ...f.actor, sid: undefined }, { ...f.actor, client: 'another-app' },
      { ...f.actor, issuer: 'https://foreign-issuer.invalid' }, { ...f.actor, subject: f.otherActor.subject }]) {
      await assert.rejects(f.store.list(f.person, actor), known(401, 'account_session_unauthorized'));
      await assert.rejects(f.store.end(f.person, actor, row.handle, input), known(401, 'account_session_unauthorized'));
    }
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.person]);
    await assert.rejects(f.store.list(f.person, f.actor), known(403, 'identity_suspended'));
    await assert.rejects(f.store.end(f.person, f.actor, row.handle, input), known(403, 'identity_suspended'));
    await f.pool.query("UPDATE persons SET status='active',session_not_before=$2 WHERE id=$1", [f.person, f.actor.issuedAt + 1]);
    await assert.rejects(f.store.list(f.person, f.actor), known(401, 'session_ended'));
    await assert.rejects(f.store.end(f.person, f.actor, row.handle, input), known(401, 'session_ended'));
    const freshActor = { ...f.actor, issuedAt: f.actor.issuedAt + 1 };
    await f.pool.query("UPDATE peer_session_receipts SET expires_at=now()-interval '1 second' WHERE receipt_hash=$1", [hash(receipt.receipt)]);
    assert.equal((await f.store.list(f.person, freshActor)).sessions.length, 0);
    await assert.rejects(f.store.end(f.person, freshActor, row.handle, input), known(404, 'app_session_not_found'));
    await new SessionRevocations(f.pool).revoke(f.issuer, f.actor.sid, randomUUID());
    await assert.rejects(f.store.list(f.person, freshActor), known(401, 'session_ended'));
  } finally { await f.close(); }
});

test('ordinary security-event failures roll back removal and concurrent receipt issuance remains safe', live, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.token, f.person), row = (await f.store.list(f.person, f.actor)).sessions[0]!;
    await f.pool.query(`CREATE FUNCTION reject_self_session_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event unavailable'; END $$;
      CREATE TRIGGER reject_self_session_event BEFORE INSERT ON account_security_events FOR EACH ROW EXECUTE FUNCTION reject_self_session_event();`);
    await assert.rejects(f.store.end(f.person, f.actor, row.handle, { expectedState: row.expectedState }));
    assert.equal((await f.peers.status(receipt.receipt, f.token.client)).active, true);
    assert.equal((await f.pool.query('SELECT count(*)::int AS n FROM account_session_endings')).rows[0].n, 0);
    await f.pool.query('DROP TRIGGER reject_self_session_event ON account_security_events');
    for (let i = 0; i < 5; i++) {
      const token = { ...f.token, sid: randomUUID(), client: `account-race-${i}` };
      const oldReceipt = await f.peers.issue(token, f.person), selected = (await f.store.list(f.person, f.actor)).sessions.find(item => item.clientId === token.client)!;
      const [ending, issue] = await Promise.allSettled([
        f.store.end(f.person, f.actor, selected.handle, { expectedState: selected.expectedState }), f.peers.issue(token, f.person),
      ]);
      assert.equal(issue.status, 'fulfilled'); if (issue.status !== 'fulfilled') throw issue.reason;
      assert.equal((await f.peers.status(issue.value.receipt, token.client)).active, true);
      if (ending.status === 'rejected') {
        assert(known(409, 'app_session_snapshot_changed')(ending.reason));
        assert.equal((await f.peers.status(oldReceipt.receipt, token.client)).active, true);
      } else await assert.rejects(f.peers.status(oldReceipt.receipt, token.client), PeerSessionError);
    }
  } finally { await f.close(); }
});

test('suspension fences a queued ending and old idempotency retention cleanup is bounded to this person', live, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.token, f.person), selected = (await f.store.list(f.person, f.actor)).sessions[0]!;
    const blocker = await f.pool.connect();
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT id FROM persons WHERE id=$1 FOR UPDATE', [f.person]);
      await blocker.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.person]);
      const ending = f.store.end(f.person, f.actor, selected.handle, { expectedState: selected.expectedState });
      const result = await Promise.race([ending.then(() => 'finished', () => 'finished'), new Promise(resolve => setTimeout(() => resolve('blocked'), 30))]);
      assert.equal(result, 'blocked'); await blocker.query('COMMIT');
      await assert.rejects(ending, known(403, 'identity_suspended'));
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    await f.pool.query("UPDATE persons SET status='active' WHERE id=$1", [f.person]);
    assert.equal((await f.peers.status(receipt.receipt, f.token.client)).active, true);
    for (const person of [f.person, f.other]) {
      await f.pool.query(`INSERT INTO account_session_endings(handle,person_id,expected_state,receipt_count,ended_at)
        SELECT gen_random_uuid(),$1,repeat('a',64),1,now()-interval '31 days' FROM generate_series(1,105)`, [person]);
      await f.pool.query(`INSERT INTO account_security_events(person_id,action,client_id,handle,receipt_count,occurred_at)
        SELECT $1,'app_session_ended','retention-test-app',gen_random_uuid(),1,now()-interval '31 days' FROM generate_series(1,105)`, [person]);
    }
    await f.store.end(f.person, f.actor, selected.handle, { expectedState: selected.expectedState });
    for (const table of ['account_session_endings', 'account_security_events']) {
      const time = table === 'account_session_endings' ? 'ended_at' : 'occurred_at';
      const own = await f.pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE person_id=$1 AND ${time}<now()-interval '30 days'`, [f.person]);
      const other = await f.pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE person_id=$1`, [f.other]);
      assert.equal(own.rows[0].n, 5); assert.equal(other.rows[0].n, 105);
    }
    await f.pool.query("UPDATE account_session_endings SET ended_at=now()-interval '31 days' WHERE handle=$1", [selected.handle]);
    const fresh = await f.peers.issue(f.token, f.person);
    await assert.rejects(f.store.end(f.person, f.actor, selected.handle, { expectedState: selected.expectedState }), known(404, 'app_session_not_found'));
    assert.equal((await f.peers.status(fresh.receipt, f.token.client)).active, true);
  } finally { await f.close(); }
});

test('personal history contains only safe own ending events, opaque cursors and the visible thirty-day window', live, async () => {
  const f = await fixture();
  try {
    const receipt = await f.peers.issue(f.token, f.person), selected = (await f.store.list(f.person, f.actor)).sessions[0]!;
    await f.store.end(f.person, f.actor, selected.handle, { expectedState: selected.expectedState });
    const firstEvent = (await f.store.history(f.person, f.actor)).events[0]!;
    assert.equal(firstEvent.action, 'app_session_ended'); assert.equal(firstEvent.clientId, f.token.client);
    assert.equal(firstEvent.receiptCount, 1); assert.equal(firstEvent.applicationName, null);
    assert.notEqual(firstEvent.id, selected.handle); assert.match(firstEvent.id, /^[a-f0-9-]{36}$/);
    for (const value of [f.issuer, f.subject, f.actor.sid, selected.handle, receipt.receipt, hash(receipt.receipt)]) {
      assert(!JSON.stringify(firstEvent).includes(value));
    }
    assert.deepEqual(Object.keys(firstEvent).sort(), ['action', 'applicationName', 'clientId', 'id', 'occurredAt', 'receiptCount']);
    await f.pool.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,visibility,admission,origin_challenge)
      VALUES($1,$2,'Stored history app',$3,'https://history.example.test/callback','https://history.example.test/','hidden','grant_required','synthetic-history-proof')`,
    [randomUUID(), f.token.client, f.person]);
    assert.equal((await f.store.history(f.person, f.actor)).events[0]?.applicationName, 'Stored history app');
    await f.pool.query("UPDATE applications SET name='Invalid' || chr(10) || 'label' WHERE client_id=$1", [f.token.client]);
    assert.equal((await f.store.history(f.person, f.actor)).events[0]?.applicationName, null);
    const foreign = (await f.pool.query(`INSERT INTO account_security_events(person_id,action,client_id,handle,receipt_count)
      VALUES($1,'app_session_ended','foreign-event-app',gen_random_uuid(),1) RETURNING event_handle`, [f.other])).rows[0].event_handle;
    const expired = (await f.pool.query(`INSERT INTO account_security_events(person_id,action,client_id,handle,receipt_count,occurred_at)
      VALUES($1,'app_session_ended','old-event-app',gen_random_uuid(),1,now()-interval '31 days') RETURNING event_handle`, [f.person])).rows[0].event_handle;
    for (let i = 0; i < 27; i++) await f.pool.query(`INSERT INTO account_security_events(person_id,action,client_id,handle,receipt_count)
      VALUES($1,'app_session_ended',$2,gen_random_uuid(),1)`, [f.person, `own-history-${i}`]);
    const first = await f.store.history(f.person, f.actor);
    assert.equal(first.contract, accountSecurityEventsContract); assert.equal(first.events.length, 25); assert(first.nextCursor);
    const second = await f.store.history(f.person, f.actor, first.nextCursor);
    assert.equal(second.events.length, 3); assert.equal(second.nextCursor, null);
    const all = [...first.events, ...second.events];
    assert.equal(new Set(all.map(event => event.id)).size, 28);
    assert.equal(all.at(-1)?.id, firstEvent.id);
    assert(!JSON.stringify(all).includes('foreign-event-app')); assert(!JSON.stringify(all).includes('old-event-app'));
    assert.equal((await f.store.history(f.other, f.otherActor)).events[0]?.id, foreign);
    await assert.rejects(f.store.history(f.other, f.actor), known(401, 'account_session_unauthorized'));
    for (const after of [foreign, expired, randomUUID(), '1', '1 OR 1=1', [], null]) {
      await assert.rejects(f.store.history(f.person, f.actor, after), known(400, 'invalid_account_security_cursor'));
    }
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.person]);
    await assert.rejects(f.store.history(f.person, f.actor), known(403, 'identity_suspended'));
    await f.pool.query("UPDATE persons SET status='active',session_not_before=$2 WHERE id=$1", [f.person, f.actor.issuedAt + 1]);
    await assert.rejects(f.store.history(f.person, f.actor), known(401, 'session_ended'));
    await assert.rejects(f.store.history(f.person, { ...f.actor, issuedAt: f.actor.issuedAt + 1, expiresAt: 0 }), known(401, 'account_session_unauthorized'));
    const operatorEvents = await f.pool.query("SELECT count(*)::int AS n FROM operator_audit_events WHERE action='person.app_session_ended'");
    assert.equal(operatorEvents.rows[0].n, 0);
  } finally { await f.close(); }
});
