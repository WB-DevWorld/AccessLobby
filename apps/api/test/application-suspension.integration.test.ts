import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { ApplicationSuspensionStore } from '../src/application-suspension.js';
import { ApplicationStore } from '../src/applications.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import { PeerSessionError, PeerSessions } from '../src/peer-sessions.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const rejected = (code: string) => (error: unknown) => error instanceof OperatorError && error.code === code;
async function fixture() {
  const database = await openIsolatedDatabase(), { pool } = database;
  const operator = randomUUID(), owner = randomUUID(), reader = randomUUID(), appId = randomUUID(), clientId = `suspension-${randomUUID()}`;
  await pool.query("INSERT INTO persons(id,status) SELECT unnest($1::uuid[]),'active'", [[operator, owner, reader]]);
  await manageOperatorRole(pool, operator, 'grant', 'application_operator', 'suspension-operator-fixture');
  await manageOperatorRole(pool, reader, 'grant', 'support_reader', 'suspension-reader-fixture');
  // Disposable active registry fixture: suspension has no IAM dependency and
  // this test neither manufactures nor asserts successful IAM provisioning.
  await pool.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,
    visibility,admission,trust_class,status,activated_at,origin_challenge,origin_verified_at,origin_verified_host,review_reference)
    VALUES($1,$2,'Suspension fixture',$3,'https://suspension.example.test/callback','https://suspension.example.test/',
    'hidden','grant_required','first_party','active',now(),'fixture-proof',now(),'_accesslobby.suspension.example.test','fixture-approved')`, [appId, clientId, owner]);
  await pool.query("INSERT INTO application_grants(application_id,person_id,status,granted_by) VALUES($1,$2,'active',$2)", [appId, owner]);
  const apps = new ApplicationStore(pool, []), controls = new ApplicationSuspensionStore(pool, new OperatorStore(pool));
  const issuer = 'https://iam.suspension.example.test/realms/accesslobby-first-party';
  const actor = { issuer, subject: randomUUID(), client: clientId, sid: randomUUID(), issuedAt: Math.floor(Date.now() / 1000) - 1, expiresAt: Math.floor(Date.now() / 1000) + 300 };
  const peers = new PeerSessions(pool, issuer, client => apps.allowedClient(client), async (person, client) => {
    try { await apps.entry(person, client); return true; } catch { return false; }
  });
  const body = { expectedStatus: 'active', expectedVersion: '0', confirmationClientId: clientId, reference: 'issue:76-suspension-fixture' };
  return { ...database, operator, owner, reader, appId, clientId, apps, controls, actor, peers, body };
}
async function waitForAppWait(pool: Awaited<ReturnType<typeof fixture>>['pool'], excludingPid: number) {
  for (let at = 0; at < 200; at++) {
    const waiting = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND pid<>$1 AND wait_event_type='Lock' AND query LIKE '%FROM applications WHERE id=$1 FOR UPDATE%'`, [excludingPid]);
    if (waiting.rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Suspension did not reach the controlled application lock');
}

test('suspension requires a current application operator, exact confirmation and an active first-party registry row', enabled, async () => {
  const f = await fixture(); try {
    const detail = await f.controls.detail(f.reader, f.appId);
    assert.equal(detail.canSuspend, false); assert.equal(detail.application.version, '0');
    assert.equal((await f.controls.detail(f.operator, f.appId)).canSuspend, true);
    for (const actor of [f.reader, f.owner]) await assert.rejects(f.controls.suspend(actor, f.appId, f.body), rejected('operator_access_denied'));
    await assert.rejects(f.controls.detail(f.owner, f.appId), rejected('operator_access_denied'));
    await assert.rejects(f.controls.suspend(f.operator, randomUUID(), f.body), rejected('application_not_found'));
    await assert.rejects(f.controls.suspend(f.operator, f.appId, { ...f.body, confirmationClientId: 'another-client' }), rejected('suspension_confirmation_mismatch'));
    for (const body of [null, [], { ...f.body, status: 'active' }, { ...f.body, expectedStatus: 'suspended' },
      { ...f.body, expectedVersion: '00' }, { ...f.body, expectedVersion: 0 }, { ...f.body, reference: 'unsafe free text' },
      { ...f.body, confirmationClientId: 'x'.repeat(81) }]) await assert.rejects(f.controls.suspend(f.operator, f.appId, body), rejected('invalid_application_suspension'));
    await f.pool.query("UPDATE applications SET status='requested',trust_class='external' WHERE id=$1", [f.appId]);
    const unavailable = await f.controls.detail(f.reader, f.appId);
    await assert.rejects(f.controls.suspend(f.operator, f.appId, { ...f.body, expectedVersion: unavailable.application.version }), rejected('application_not_suspendable'));
    await f.pool.query("UPDATE applications SET status='active',trust_class='first_party',client_id='accesslobby-web' WHERE id=$1", [f.appId]);
    assert.equal((await f.controls.detail(f.operator, f.appId)).canSuspend, false);
    await assert.rejects(f.controls.suspend(f.operator, f.appId, { ...f.body, confirmationClientId: 'accesslobby-web' }), rejected('protected_application'));
    assert.equal((await f.pool.query("SELECT count(*) FROM operator_audit_events WHERE action='application.suspended'")).rows[0].count, '0');
  } finally { await f.close(); }
});

test('audited suspension denies current admission, preserves grants/config/history and permanently removes existing peer receipts', enabled, async () => {
  const f = await fixture(); try {
    const receipt = await f.peers.issue(f.actor, f.owner);
    assert.equal((await f.peers.status(receipt.receipt, f.clientId)).active, true);
    const before = (await f.pool.query('SELECT * FROM applications WHERE id=$1', [f.appId])).rows[0];
    const grants = (await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1', [f.appId])).rows;
    const result = await f.controls.suspend(f.operator, f.appId, f.body);
    assert.equal(result.changed, true); assert.equal(result.application.status, 'suspended'); assert.equal(result.application.version, '1');
    assert.equal(result.canSuspend, false); assert.equal(await f.apps.allowedClient(f.clientId), false);
    await assert.rejects(f.apps.entry(f.owner, f.clientId), /application_unavailable/);
    await assert.rejects(f.peers.status(receipt.receipt, f.clientId), PeerSessionError);
    await assert.rejects(f.peers.issue(f.actor, f.owner), PeerSessionError);
    const after = (await f.pool.query('SELECT * FROM applications WHERE id=$1', [f.appId])).rows[0];
    for (const key of Object.keys(before).filter(key => !['status', 'administration_version', 'suspended_at', 'suspension_reference', 'suspended_by'].includes(key))) assert.deepEqual(after[key], before[key], key);
    assert.deepEqual((await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1', [f.appId])).rows, grants);
    const audit = (await f.pool.query("SELECT actor_person_id,reference,target_id FROM operator_audit_events WHERE action='application.suspended'")).rows;
    assert.deepEqual(audit, [{ actor_person_id: f.operator, reference: f.body.reference, target_id: f.appId }]);
    assert.equal((await f.pool.query("SELECT count(*) FROM application_events WHERE application_id=$1 AND action='application.suspended'", [f.appId])).rows[0].count, '1');
    // Private registry-only fixture restoration proves receipt non-revival. It
    // does not claim a browser reinstatement feature or IAM acceptance.
    await f.pool.query("UPDATE applications SET status='active' WHERE id=$1", [f.appId]);
    assert.equal(await f.apps.allowedClient(f.clientId), true);
    await assert.rejects(f.peers.status(receipt.receipt, f.clientId), PeerSessionError);
  } finally { await f.close(); }
});

test('concurrent identical suspension is idempotent while config changes and later private transitions fence stale pages', enabled, async () => {
  const f = await fixture(); try {
    await f.pool.query("UPDATE applications SET name='Updated fixture' WHERE id=$1", [f.appId]);
    await assert.rejects(f.controls.suspend(f.operator, f.appId, f.body), rejected('stale_application_suspension'));
    const body = { ...f.body, expectedVersion: '1' };
    const results = await Promise.all(Array.from({ length: 8 }, () => f.controls.suspend(f.operator, f.appId, body)));
    assert.equal(results.filter(result => result.changed).length, 1);
    assert(results.every(result => result.application.version === '2' && result.application.status === 'suspended'));
    assert.equal((await f.pool.query("SELECT count(*) FROM operator_audit_events WHERE action='application.suspended'")).rows[0].count, '1');
    await assert.rejects(f.controls.suspend(f.operator, f.appId, { ...body, reference: 'issue:76-other-command' }), rejected('stale_application_suspension'));
    const sql = readFileSync(new URL('../migrations/014_application_suspension.sql', import.meta.url), 'utf8');
    await f.pool.query(sql);
    assert.equal((await f.controls.detail(f.reader, f.appId)).application.version, '2');
    await f.pool.query("UPDATE applications SET status='active' WHERE id=$1", [f.appId]);
    await assert.rejects(f.controls.suspend(f.operator, f.appId, body), rejected('stale_application_suspension'));
    assert.equal((await f.controls.detail(f.reader, f.appId)).application.status, 'active');
  } finally { await f.close(); }
});

test('operator authority revoked while a suspension waits is checked again under locks', enabled, async () => {
  const f = await fixture(); const lock = await f.pool.connect(); let pending: Promise<unknown> | undefined;
  try {
    await lock.query('BEGIN'); const pid = Number((await lock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await lock.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [f.appId]);
    pending = f.controls.suspend(f.operator, f.appId, f.body);
    // Attach rejection handling immediately while the fixture controls locks.
    const denied = assert.rejects(pending, rejected('operator_access_denied'));
    await waitForAppWait(f.pool, pid);
    await manageOperatorRole(f.pool, f.operator, 'revoke', 'application_operator', 'issue:76-race-revoke');
    await lock.query('COMMIT'); await denied;
    assert.equal((await f.controls.detail(f.reader, f.appId)).application.status, 'active');
  } finally { await lock.query('ROLLBACK'); lock.release(); await pending?.catch(() => {}); await f.close(); }
});

test('failed audit rolls registry, receipt removal and application event back together', enabled, async () => {
  const f = await fixture(); try {
    const receipt = await f.peers.issue(f.actor, f.owner);
    await f.pool.query(`CREATE FUNCTION fail_suspension_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='application.suspended' THEN RAISE EXCEPTION 'fixture audit unavailable'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER reject_suspension_audit BEFORE INSERT ON operator_audit_events FOR EACH ROW EXECUTE FUNCTION fail_suspension_audit()`);
    await assert.rejects(f.controls.suspend(f.operator, f.appId, f.body), /fixture audit unavailable/);
    const detail = await f.controls.detail(f.reader, f.appId);
    assert.equal(detail.application.status, 'active'); assert.equal(detail.application.version, '0');
    assert.equal((await f.peers.status(receipt.receipt, f.clientId)).active, true);
    assert.equal((await f.pool.query("SELECT count(*) FROM application_events WHERE action='application.suspended'")).rows[0].count, '0');
  } finally { await f.close(); }
});

test('receipt issue preflight before suspension cannot insert after the app becomes suspended', enabled, async () => {
  const f = await fixture(); let release!: () => void, entered!: () => void;
  const atPreflight = new Promise<void>(resolve => { entered = resolve; });
  const proceed = new Promise<void>(resolve => { release = resolve; });
  try {
    const racing = new PeerSessions(f.pool, f.actor.issuer, async () => { entered(); await proceed; return true; });
    const issue = racing.issue(f.actor, f.owner), denied = assert.rejects(issue, PeerSessionError);
    await atPreflight; await f.controls.suspend(f.operator, f.appId, f.body); release(); await denied;
    assert.equal((await f.pool.query('SELECT count(*) FROM peer_session_receipts WHERE client_id=$1', [f.clientId])).rows[0].count, '0');
    // An unregistered explicitly allowed legacy client retains its existing path.
    const legacy = new PeerSessions(f.pool, f.actor.issuer, async () => true);
    assert((await legacy.issue({ ...f.actor, client: 'legacy-fixture' }, f.owner)).receipt);
  } finally { release(); await f.close(); }
});

test('an in-flight receipt holding its app lock completes before suspension removes it without deadlock', enabled, async () => {
  const f = await fixture(); const personLock = await f.pool.connect(); let issue: Promise<unknown> | undefined, suspend: Promise<unknown> | undefined;
  try {
    await personLock.query('BEGIN'); await personLock.query('SELECT id FROM persons WHERE id=$1 FOR UPDATE', [f.owner]);
    // Receipt issuance locks the app first, then blocks on this person. A
    // suspension must wait for issuance, then remove the newly committed row.
    issue = f.peers.issue(f.actor, f.owner);
    let waiting = false;
    for (let n = 0; n < 200; n++) {
      const row = await f.pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%SELECT status,session_not_before FROM persons WHERE id=$1 FOR SHARE%'");
      if (row.rowCount) { waiting = true; break; } await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(waiting, 'receipt reached its person lock after holding the application lock');
    suspend = f.controls.suspend(f.operator, f.appId, f.body);
    const pid = Number((await personLock.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
    await waitForAppWait(f.pool, pid);
    await personLock.query('COMMIT');
    const receipt = await issue as { receipt: string }; await suspend;
    await assert.rejects(f.peers.status(receipt.receipt, f.clientId), PeerSessionError);
    assert.equal((await f.pool.query('SELECT count(*) FROM peer_session_receipts WHERE client_id=$1', [f.clientId])).rows[0].count, '0');
  } finally { await personLock.query('ROLLBACK'); personLock.release(); await Promise.allSettled([issue, suspend]); await f.close(); }
});
