import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { ApplicationError, ApplicationStore, applicationGrantExpiry } from '../src/applications.js';
import { ApplicationGrantsStore } from '../src/application-grants.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import type { AuthenticatedSubject } from '../src/auth.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const denied = (code: string, status?: number) => (error: unknown) => error instanceof ApplicationError && error.code === code && (!status || error.status === status);
const targetId = (n: number) => `31111111-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function fixture() {
  const database = await openIsolatedDatabase(), { pool } = database;
  const owner = randomUUID(), foreign = randomUUID(), appId = randomUUID();
  await pool.query("INSERT INTO persons(id,status) SELECT unnest($1::uuid[]),'active'", [[owner, foreign, targetId(0), targetId(1)]]);
  const auth: AuthenticatedSubject = { issuer: 'https://iam.grants.example.test/realms/accesslobby-first-party', subject: 'private-owner-' + randomUUID(),
    client: 'accesslobby-web', sid: 'private-session-' + randomUUID(), issuedAt: Math.floor(Date.now() / 1000) - 1, expiresAt: Math.floor(Date.now() / 1000) + 300 };
  await pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3)', [auth.issuer, auth.subject, owner]);
  await pool.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,visibility,admission,
    status,trust_class,activated_at,origin_challenge,origin_verified_at,origin_verified_host)
    VALUES($1,$2,'Individual grants fixture',$3,'https://grants.example.test/callback','https://grants.example.test/',
    'hidden','grant_required','active','first_party',now(),'proof',now(),'_accesslobby-verify.grants.example.test')`, [appId, 'grants-' + randomUUID(), owner]);
  return { ...database, owner, foreign, appId, auth, apps: new ApplicationStore(pool, []), grants: new ApplicationGrantsStore(pool) };
}
async function blockedOn(pool: Awaited<ReturnType<typeof fixture>>['pool'], pid: number) {
  for (let i = 0; i < 200; i++) {
    if ((await pool.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))', [pid])).rowCount) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Expected the grant operation to wait on the controlled application lock');
}

test('grant expiry round-trips real UTC dates, accepts future or indefinite and rejects normalized calendars', () => {
  const now = Date.parse('2026-11-28T00:00:00.000Z');
  assert.equal(applicationGrantExpiry(undefined, now), undefined);
  assert.equal(applicationGrantExpiry('2027-01-01T18:30:00Z', now), '2027-01-01T18:30:00.000Z');
  assert.equal(applicationGrantExpiry('2028-02-29T18:30:00.123Z', now), '2028-02-29T18:30:00.123Z');
  assert.equal(applicationGrantExpiry('2099-01-01T00:00:00Z', now), '2099-01-01T00:00:00.000Z');
  for (const value of [null, '', [], '2027-02-30T18:30:00Z', '2027-02-29T18:30:00Z', '2027-13-01T00:00:00Z',
    '2027-01-01T24:00:00Z', '2027-01-01T18:30:00+01:00', '2027-01-01T18:30:00', '2027-01-01', '2027-01-01T18:30:60Z',
    '2026-11-28T00:00:00.000Z', '2020-01-01T00:00:00Z', ' 2027-01-01T18:30:00Z', '2027-01-01T18:30:00.1234Z']) {
    assert.throws(() => applicationGrantExpiry(value, now), denied('invalid_expiry', 400));
  }
});

test('owner-only grant lists are bounded, deterministically paged and separate recorded revocation, expiry and person state', enabled, async () => {
  const f = await fixture(); try {
    for (let i = 0; i < 30; i++) {
      await f.pool.query("INSERT INTO persons(id,status) VALUES($1,'active') ON CONFLICT(id) DO NOTHING", [targetId(i)]);
      await f.pool.query(`INSERT INTO application_grants(application_id,person_id,status,granted_by,expires_at,revoked_at)
        VALUES($1,$2,$3,$4,$5,$6)`, [f.appId, targetId(i), i === 2 ? 'revoked' : 'active', f.owner,
        i === 3 ? '2020-01-01T00:00:00Z' : i === 4 ? null : '2099-01-01T00:00:00Z', i === 2 ? '2026-01-01T00:00:00Z' : null]);
    }
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [targetId(1)]);
    await manageOperatorRole(f.pool, f.foreign, 'grant', 'application_operator', 'foreign-platform-grant-no-ownership');
    await assert.rejects(f.grants.list(f.foreign, f.appId), denied('application_not_found', 404));
    const first = await f.grants.list(f.owner, f.appId, undefined, f.auth);
    const second = await f.grants.list(f.owner, f.appId, first.nextCursor, f.auth);
    assert.equal(first.grants.length, 25); assert.equal(first.nextCursor, targetId(24));
    assert.equal(second.grants.length, 5); assert.equal(second.nextCursor, null);
    const rows = [...first.grants, ...second.grants];
    assert.deepEqual(rows.map(row => row.personId), Array.from({ length: 30 }, (_, i) => targetId(i)));
    assert.equal(rows[1]?.personStatus, 'suspended'); assert.equal(rows[1]?.status, 'active');
    assert.equal(rows[2]?.status, 'revoked'); assert.equal(rows[2]?.expired, false);
    assert.equal(rows[3]?.status, 'active'); assert.equal(rows[3]?.expired, true); assert.equal(rows[4]?.expiresAt, null);
    assert(!JSON.stringify(first).includes(f.auth.subject)); assert(!JSON.stringify(first).includes(f.auth.sid!));
    assert.deepEqual(Object.keys(rows[0]!).sort(), ['expired', 'expiresAt', 'grantedAt', 'grantedByPersonId', 'personId', 'personStatus', 'revokedAt', 'status']);
    for (const after of [null, [], [targetId(0)], 'invalid', 'x'.repeat(200)]) await assert.rejects(f.grants.list(f.owner, f.appId, after, f.auth), denied('invalid_grant_cursor', 400));
    await f.pool.query("UPDATE applications SET admission='authenticated_open' WHERE id=$1", [f.appId]);
    await assert.rejects(f.grants.list(f.owner, f.appId, undefined, f.auth), denied('application_grants_unavailable', 409));
    await f.pool.query("UPDATE applications SET admission='grant_required',status='requested',trust_class='external' WHERE id=$1", [f.appId]);
    await assert.rejects(f.grants.list(f.owner, f.appId, undefined, f.auth), denied('application_grants_unavailable', 409));
  } finally { await f.close(); }
});

test('explicit future renewal changes only its selected person and actual expiration and revocation deny entry', enabled, async () => {
  const f = await fixture(); try {
    const expiry = '2099-01-01T18:30:00Z';
    const granted = await f.apps.grant(f.owner, f.appId, targetId(0), expiry, f.auth);
    assert.equal(granted.expiresAt, '2099-01-01T18:30:00.000Z');
    const client = (await f.pool.query('SELECT client_id FROM applications WHERE id=$1', [f.appId])).rows[0].client_id;
    assert.equal((await f.apps.entry(targetId(0), client)).admitted, true);
    await f.apps.grant(f.owner, f.appId, targetId(1), undefined, f.auth);
    await f.apps.revoke(f.owner, f.appId, targetId(1), f.auth);
    const other = (await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1 AND person_id=$2', [f.appId, targetId(1)])).rows[0];
    await f.pool.query("UPDATE application_grants SET expires_at='2020-01-01T00:00:00Z' WHERE application_id=$1 AND person_id=$2", [f.appId, targetId(0)]);
    await assert.rejects(f.apps.entry(targetId(0), client), denied('application_entry_denied', 403));
    await f.apps.grant(f.owner, f.appId, targetId(0), expiry, f.auth);
    assert.equal((await f.apps.entry(targetId(0), client)).admitted, true);
    assert.deepEqual((await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1 AND person_id=$2', [f.appId, targetId(1)])).rows[0], other);
    await f.apps.revoke(f.owner, f.appId, targetId(0), f.auth);
    await assert.rejects(f.apps.entry(targetId(0), client), denied('application_entry_denied', 403));
    await f.apps.grant(f.owner, f.appId, targetId(0), undefined, f.auth);
    assert.equal((await f.grants.list(f.owner, f.appId, undefined, f.auth)).grants.find(row => row.personId === targetId(0))?.expiresAt, null);
    assert.equal((await f.grants.list(f.owner, f.appId, undefined, f.auth)).grants.find(row => row.personId === targetId(1))?.status, 'revoked');
  } finally { await f.close(); }
});

test('a queued list, grant and revoke cannot use authentication from before an owner cutoff after resume', enabled, async () => {
  const f = await fixture(), blocker = await f.pool.connect();
  try {
    await f.apps.grant(f.owner, f.appId, targetId(0), undefined, f.auth);
    const before = (await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1', [f.appId])).rows;
    const events = (await f.pool.query('SELECT count(*) FROM application_events WHERE application_id=$1', [f.appId])).rows[0].count;
    await blocker.query('BEGIN');
    const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    await blocker.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [f.appId]);
    const attempts = Promise.allSettled([f.grants.list(f.owner, f.appId, undefined, f.auth),
      f.apps.grant(f.owner, f.appId, targetId(1), undefined, f.auth), f.apps.revoke(f.owner, f.appId, targetId(0), f.auth)]);
    await blockedOn(f.pool, pid);
    const cutoff = f.auth.issuedAt! + 1;
    await f.pool.query("UPDATE persons SET status='active',session_not_before=$2 WHERE id=$1", [f.owner, cutoff]);
    await blocker.query('COMMIT');
    const results = await attempts;
    assert(results.every(result => result.status === 'rejected' && denied('session_ended', 401)(result.reason)));
    assert.deepEqual((await f.pool.query('SELECT * FROM application_grants WHERE application_id=$1', [f.appId])).rows, before);
    assert.equal((await f.pool.query('SELECT count(*) FROM application_events WHERE application_id=$1', [f.appId])).rows[0].count, events);
    assert.equal((await f.grants.list(f.owner, f.appId, undefined, { ...f.auth, issuedAt: cutoff })).grants.length, 1);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); await f.close(); }
});

test('grant writes recheck target status under locks, current owner authentication and audit rollback', enabled, async () => {
  const f = await fixture(), blocker = await f.pool.connect();
  try {
    for (const auth of [{ ...f.auth, sid: undefined }, { ...f.auth, expiresAt: Math.floor(Date.now() / 1000) },
      { ...f.auth, client: 'peer-app' }, { ...f.auth, subject: 'wrong-owner' }]) {
      await assert.rejects(f.grants.list(f.owner, f.appId, undefined, auth), denied('session_ended', 401));
      await assert.rejects(f.apps.grant(f.owner, f.appId, targetId(0), undefined, auth), denied('session_ended', 401));
    }
    await f.pool.query("INSERT INTO revoked_oidc_sessions(issuer,sid,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')", [f.auth.issuer, f.auth.sid]);
    await assert.rejects(f.apps.grant(f.owner, f.appId, targetId(0), undefined, f.auth), denied('session_ended', 401));
    await f.pool.query('DELETE FROM revoked_oidc_sessions WHERE issuer=$1 AND sid=$2', [f.auth.issuer, f.auth.sid]);
    await blocker.query('BEGIN');
    const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
    await blocker.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE', [f.appId]);
    const attempt = f.apps.grant(f.owner, f.appId, targetId(0), undefined, f.auth).then(value => ({ value, error: null }), error => ({ value: null, error }));
    await blockedOn(f.pool, pid);
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [targetId(0)]);
    await blocker.query('COMMIT');
    assert(denied('person_not_found', 404)((await attempt).error));
    assert.equal((await f.pool.query('SELECT count(*) FROM application_grants WHERE application_id=$1', [f.appId])).rows[0].count, '0');
    await f.pool.query("UPDATE persons SET status='active' WHERE id=$1", [targetId(0)]);
    await f.pool.query("ALTER TABLE application_events ADD CONSTRAINT reject_grant_event CHECK(action <> 'application.granted') NOT VALID");
    await assert.rejects(f.apps.grant(f.owner, f.appId, targetId(0), undefined, f.auth));
    assert.equal((await f.pool.query('SELECT count(*) FROM application_grants WHERE application_id=$1', [f.appId])).rows[0].count, '0');
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.owner]);
    await assert.rejects(f.grants.list(f.owner, f.appId), denied('application_owner_unavailable', 403));
    await assert.rejects(f.apps.revoke(f.owner, f.appId, targetId(0)), denied('application_owner_unavailable', 403));
  } finally { await blocker.query('ROLLBACK'); blocker.release(); await f.close(); }
});
