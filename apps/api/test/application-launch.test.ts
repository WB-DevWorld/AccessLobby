import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { ApplicationLaunchStore, applicationLaunchUrl } from '../src/application-launch.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import { applicationConfigurationHash } from '../src/application-reviews.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const rejected = (code: string, status?: number) => (error: unknown) => error instanceof OperatorError && error.code === code && (!status || error.status === status);
const callback = 'https://launch.example.test/callback', entry = 'https://launch.example.test/account';
async function fixture() {
  const database = await openIsolatedDatabase(), { pool } = database;
  const operator = randomUUID(), owner = randomUUID(), reader = randomUUID(), appId = randomUUID();
  await pool.query("INSERT INTO persons(id,status) SELECT unnest($1::uuid[]),'active'", [[operator, owner, reader]]);
  await manageOperatorRole(pool, operator, 'grant', 'application_operator', 'launch-operator-fixture');
  await manageOperatorRole(pool, reader, 'grant', 'support_reader', 'launch-reader-fixture');
  // A disposable active registry fixture is not a claim of IAM provisioning.
  await pool.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,
    visibility,admission,trust_class,status,activated_at,origin_challenge,origin_verified_at,origin_verified_host,review_reference)
    VALUES($1,$2,'Launch fixture',$3,$4,'https://launch.example.test/',
    'hidden','grant_required','first_party','active',now(),'fixture-proof',now(),'_accesslobby-verify.launch.example.test','fixture-approved')`,
  [appId, `launch-${randomUUID()}`, owner, callback]);
  await pool.query("INSERT INTO application_grants(application_id,person_id,status,granted_by) VALUES($1,$2,'active',$2)", [appId, owner]);
  const store = new ApplicationLaunchStore(pool, new OperatorStore(pool));
  const detail = await store.get(operator, appId);
  const body = { launchUrl: entry, expectedVersion: detail.launch.version, reference: 'issue:round4-launch' };
  return { ...database, operator, owner, reader, appId, store, body };
}

test('launch URLs are canonical queryless public HTTPS entry points on the registered origin', () => {
  assert.equal(applicationLaunchUrl(entry, callback), entry);
  assert.equal(applicationLaunchUrl('https://launch.example.test/', callback), 'https://launch.example.test/');
  assert.equal(applicationLaunchUrl(entry, 'https://launch.example.test/wp-login.php?action=al_callback'), entry);
  for (const value of [null, [], '', 'javascript:alert(1)', 'data:text/html,Hi', '//launch.example.test/', 'http://launch.example.test/',
    'https://other.example.test/', 'https://launch.example.test:444/', 'https://user:password@launch.example.test/',
    `${entry}#`, `${entry}#fragment`, `${entry}?`, `${entry}?return=https://evil.example/`, `${entry}\n`,
    'https://launch.example.test//evil.example/', 'https://launch.example.test/%2f%2fevil.example/', 'https://launch.example.test/%0aheader',
    'https://launch.example.test/%5cpath', 'https://launch.example.test:443/', 'https://launch.example.test', 'https://launch.example.test/' + 'x'.repeat(2048)]) {
    assert.throws(() => applicationLaunchUrl(value, callback), rejected('invalid_application_launch_url', 400));
  }
  for (const origin of ['https://127.0.0.1/', 'https://192.168.1.1/', 'https://[::1]/', 'https://localhost/', 'https://box.localhost/',
    'https://iam/', 'https://iam.internal/', 'https://box.local/']) {
    assert.throws(() => applicationLaunchUrl(origin, origin), rejected('invalid_application_launch_url'));
  }
});

test('launch inspection and writes use current explicit platform authority and reject ineligible or core apps', enabled, async () => {
  const f = await fixture(); try {
    assert.equal((await f.store.get(f.reader, f.appId)).canManage, false);
    assert.equal((await f.store.get(f.operator, f.appId)).canManage, true);
    await assert.rejects(f.store.get(f.owner, f.appId), rejected('operator_access_denied', 403));
    for (const actor of [f.owner, f.reader, { personId: f.owner, roles: ['application_operator'] } as unknown as string]) {
      await assert.rejects(f.store.set(actor, f.appId, f.body), rejected('operator_access_denied', 403));
    }
    await assert.rejects(f.store.get(f.operator, 'invalid'), rejected('application_not_found', 404));
    await assert.rejects(f.store.set(f.operator, randomUUID(), f.body), rejected('application_not_found', 404));
    for (const body of [null, [], { ...f.body, role: 'application_operator' }, { ...f.body, reference: 'free form notes' },
      { ...f.body, expectedVersion: '0' }, { ...f.body, launchUrl: undefined }, { ...f.body, expectedVersion: 1 }]) {
      await assert.rejects(f.store.set(f.operator, f.appId, body), rejected('invalid_application_launch', 400));
    }
    for (const state of [{ status: 'requested', trust: 'unreviewed' }, { status: 'cancelled', trust: 'unreviewed' },
      { status: 'suspended', trust: 'first_party' }, { status: 'requested', trust: 'external' }]) {
      await f.pool.query('UPDATE applications SET status=$2,trust_class=$3 WHERE id=$1', [f.appId, state.status, state.trust]);
      assert.equal((await f.store.get(f.operator, f.appId)).canManage, false);
      await assert.rejects(f.store.set(f.operator, f.appId, f.body), rejected('application_launch_unavailable', 409));
    }
    for (const client of ['accesslobby-web', 'accesslobby-api']) {
      await f.pool.query("UPDATE applications SET client_id=$2,status='active',trust_class='first_party' WHERE id=$1", [f.appId, client]);
      assert.equal((await f.store.get(f.operator, f.appId)).canManage, false);
      await assert.rejects(f.store.set(f.operator, f.appId, f.body), rejected('protected_application', 403));
    }
  } finally { await f.close(); }
});

test('setting and removing launch metadata audits atomically and preserves all OIDC, review, visibility and grant facts', enabled, async () => {
  const f = await fixture(); try {
    const before = (await f.pool.query('SELECT * FROM applications WHERE id=$1', [f.appId])).rows[0];
    const grants = (await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1', [f.appId])).rows;
    const hash = applicationConfigurationHash(before);
    const saved = await f.store.set(f.operator, f.appId, f.body);
    assert.equal(saved.changed, true); assert.equal(saved.launch.launchUrl, entry);
    assert.notEqual(saved.launch.version, f.body.expectedVersion); assert.equal(saved.launch.reference, f.body.reference);
    assert(saved.launch.updatedAt); assert.equal(saved.canManage, true);
    assert.equal((await f.store.forApplications([f.appId])).get(f.appId), entry);
    assert.equal((await f.store.forApplications([])).size, 0);
    const removed = await f.store.set(f.operator, f.appId, { launchUrl: null, expectedVersion: saved.launch.version, reference: 'issue:round4-remove' });
    assert.equal(removed.changed, true); assert.equal(removed.launch.launchUrl, null);
    assert.notEqual(removed.launch.version, saved.launch.version); assert.equal((await f.store.forApplications([f.appId])).size, 0);
    const after = (await f.pool.query('SELECT * FROM applications WHERE id=$1', [f.appId])).rows[0];
    assert.deepEqual(after, before); assert.equal(applicationConfigurationHash(after), hash);
    assert.deepEqual((await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1', [f.appId])).rows, grants);
    const audit = (await f.pool.query("SELECT action,actor_person_id,reference,target_id FROM operator_audit_events WHERE target_type='application' ORDER BY id")).rows;
    assert.deepEqual(audit, [{ action: 'application.launch_set', actor_person_id: f.operator, reference: f.body.reference, target_id: f.appId },
      { action: 'application.launch_removed', actor_person_id: f.operator, reference: 'issue:round4-remove', target_id: f.appId }]);
    assert.equal((await f.pool.query('SELECT count(*) FROM application_events WHERE application_id=$1', [f.appId])).rows[0].count, '2');
    await assert.rejects(f.pool.query('UPDATE application_launch_commands SET reference=$1', ['replacement']), /append-only/);
    await assert.rejects(f.pool.query('DELETE FROM application_launch_commands'), /append-only/);
    await f.pool.query(readFileSync(new URL('../migrations/016_application_launch.sql', import.meta.url), 'utf8'));
    assert.equal((await f.store.get(f.reader, f.appId)).launch.version, removed.launch.version);
  } finally { await f.close(); }
});

test('concurrent exact retries create one change and old command replay cannot overwrite later launch metadata', enabled, async () => {
  const f = await fixture(); try {
    const results = await Promise.all(Array.from({ length: 8 }, () => f.store.set(f.operator, f.appId, f.body)));
    assert.equal(results.filter(result => result.changed).length, 1);
    assert.equal(new Set(results.map(result => result.launch.version)).size, 1);
    const saved = results[0]!;
    assert.equal((await f.pool.query('SELECT count(*) FROM application_launch_commands')).rows[0].count, '1');
    assert.equal((await f.pool.query("SELECT count(*) FROM operator_audit_events WHERE action='application.launch_set'")).rows[0].count, '1');
    const competing = await Promise.allSettled(['one', 'two'].map(suffix => f.store.set(f.operator, f.appId, { ...f.body,
      launchUrl: `https://launch.example.test/new-entry-${suffix}`, expectedVersion: saved.launch.version, reference: `issue:round4-second-${suffix}` })));
    const winners = competing.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof f.store.set>>> => result.status === 'fulfilled');
    const losers = competing.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.equal(winners.length, 1); assert.equal(losers.length, 1);
    assert(rejected('stale_application_launch')(losers[0]!.reason));
    const later = winners[0]!.value;
    const replay = await f.store.set(f.operator, f.appId, f.body);
    assert.equal(replay.changed, false); assert.equal(replay.launch.launchUrl, later.launch.launchUrl);
    await assert.rejects(f.store.set(f.operator, f.appId, { ...f.body, launchUrl: 'https://launch.example.test/other' }), rejected('application_launch_reference_conflict'));
    await assert.rejects(f.store.set(f.operator, f.appId, { ...f.body, reference: 'issue:round4-stale' }), rejected('stale_application_launch'));
    const version = later.launch.version;
    await f.pool.query("UPDATE applications SET name='Revised registered application' WHERE id=$1", [f.appId]);
    await assert.rejects(f.store.set(f.operator, f.appId, { launchUrl: null, expectedVersion: version, reference: 'issue:round4-stale-config' }), rejected('stale_application_launch'));
    // Saving the current destination records an idempotency receipt, without a false change audit.
    const current = await f.store.get(f.operator, f.appId);
    const unchanged = await f.store.set(f.operator, f.appId, { launchUrl: current.launch.launchUrl, expectedVersion: current.launch.version, reference: 'issue:round4-no-change' });
    assert.equal(unchanged.changed, false); assert.equal(unchanged.launch.version, current.launch.version);
  } finally { await f.close(); }
});

test('failed audit rolls back metadata and commands, and public enrichment excludes invalid or ineligible destinations', enabled, async () => {
  const f = await fixture(); try {
    await f.pool.query("ALTER TABLE operator_audit_events ADD CONSTRAINT reject_launch_audit CHECK(action <> 'application.launch_set') NOT VALID");
    await assert.rejects(f.store.set(f.operator, f.appId, f.body));
    assert.equal((await f.pool.query('SELECT count(*) FROM application_launches')).rows[0].count, '0');
    assert.equal((await f.pool.query('SELECT count(*) FROM application_launch_commands')).rows[0].count, '0');
    assert.equal((await f.pool.query('SELECT count(*) FROM application_events WHERE application_id=$1', [f.appId])).rows[0].count, '0');
    await f.pool.query('ALTER TABLE operator_audit_events DROP CONSTRAINT reject_launch_audit');
    await f.store.set(f.operator, f.appId, f.body);
    assert.equal((await f.store.forApplications([randomUUID()])).size, 0);
    for (const [status, trust] of [['suspended', 'first_party'], ['requested', 'external']]) {
      await f.pool.query('UPDATE applications SET status=$2,trust_class=$3 WHERE id=$1', [f.appId, status, trust]);
      assert.equal((await f.store.forApplications([f.appId])).size, 0);
    }
    await f.pool.query("UPDATE applications SET status='active',trust_class='first_party' WHERE id=$1", [f.appId]);
    await f.pool.query("UPDATE application_launches SET launch_url='javascript:private-canary' WHERE application_id=$1", [f.appId]);
    assert.equal((await f.store.forApplications([f.appId])).size, 0);
    const invalid = await f.store.get(f.operator, f.appId);
    assert.equal(invalid.launch.launchUrl, null); assert.equal(invalid.launch.needsReview, true);
    assert(!JSON.stringify(invalid).includes('private-canary'));
    await f.pool.query('UPDATE application_launches SET launch_url=$2 WHERE application_id=$1', [f.appId, entry]);
    await f.pool.query("UPDATE applications SET redirect_uri='https://changed.example.test/callback' WHERE id=$1", [f.appId]);
    assert.equal((await f.store.forApplications([f.appId])).size, 0);
    const obsolete = await f.store.get(f.operator, f.appId);
    assert.equal(obsolete.launch.needsReview, true);
    const repaired = await f.store.set(f.operator, f.appId, { launchUrl: 'https://changed.example.test/', expectedVersion: obsolete.launch.version, reference: 'issue:round4-origin-repair' });
    assert.equal(repaired.launch.needsReview, false); assert.equal(repaired.launch.launchUrl, 'https://changed.example.test/');
    await assert.rejects(f.store.forApplications(['not-an-id']), rejected('invalid_application_launch'));
  } finally { await f.close(); }
});

test('a role revoked after preflight is rechecked under the application lock before any launch write', enabled, async () => {
  const f = await fixture();
  const blocker = await f.pool.connect();
  try {
    await blocker.query('BEGIN');
    const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    await blocker.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [f.appId]);
    const attempt = f.store.set(f.operator, f.appId, f.body);
    // Attach rejection handling immediately while the transaction is deliberately blocked.
    const result = attempt.then(value => ({ value, error: null }), error => ({ value: null, error }));
    let blocked = false;
    for (let i = 0; i < 200; i++) {
      const waiting = await f.pool.query(`SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))
        AND query LIKE '%FROM applications WHERE id=$1 FOR UPDATE%'`, [pid]);
      if (waiting.rowCount) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(blocked, true, 'launch writer reached the controlled application lock');
    await manageOperatorRole(f.pool, f.operator, 'revoke', 'application_operator', 'launch-revoked-after-preflight');
    await blocker.query('COMMIT');
    const completed = await result;
    assert(rejected('operator_access_denied', 403)(completed.error));
    assert.equal((await f.pool.query('SELECT count(*) FROM application_launches')).rows[0].count, '0');
    assert.equal((await f.pool.query('SELECT count(*) FROM application_launch_commands')).rows[0].count, '0');
  } finally { await blocker.query('ROLLBACK'); blocker.release(); await f.close(); }
});
