import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ApplicationStore, ApplicationError } from '../src/applications.js';
import { ApplicationLifecycleStore } from '../src/application-lifecycle.js';
import { openIsolatedDatabase } from './isolated-database.js';
import { recordFixtureApproval } from './application-review-fixture.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const rejects = (code: string) => (error: unknown) => error instanceof ApplicationError && error.code === code;
const fields = { name: 'Owner lifecycle app', platform: 'web' as const, redirectUri: 'https://lifecycle.example.test/callback',
  logoutUri: 'https://lifecycle.example.test/', backchannelLogoutUri: 'https://lifecycle.example.test/backchannel',
  visibility: 'hidden' as const, admission: 'grant_required' as const };

async function fixture() {
  const database = await openIsolatedDatabase();
  try {
    const [owner, outsider] = [randomUUID(), randomUUID()];
    await database.pool.query("INSERT INTO persons(id,status) VALUES($1,'active'),($2,'active')", [owner, outsider]);
    const apps = new ApplicationStore(database.pool, []);
    const app = await apps.request(owner, { ...fields, clientId: `lifecycle-${randomUUID()}` });
    const lifecycle = new ApplicationLifecycleStore(database.pool);
    const detail = await lifecycle.detail(owner, app.id);
    return { ...database, owner, outsider, apps, app, lifecycle, hash: detail.application.configurationHash };
  } catch (error) { await database.close(); throw error; }
}

test('owner lifecycle refuses takeover, hidden authority fields and unsafe route/platform changes', enabled, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.lifecycle.detail(f.outsider, f.app.id), rejects('application_not_found'));
    const body = { ...fields, reference: 'owner-change-1', expectedConfigurationHash: f.hash };
    await assert.rejects(f.lifecycle.edit(f.outsider, f.app.id, body), rejects('application_not_found'));
    for (const extra of [{ clientId: 'takeover' }, { ownerPersonId: f.outsider }, { status: 'active' }, { trustClass: 'first_party' }]) {
      await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, { ...body, ...extra }), rejects('invalid_application_mutation'));
    }
    await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, { ...body, redirectUri: 'https://elsewhere.example.test/callback' }), rejects('application_origin_mismatch'));
    await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, { ...body, redirectUri: fields.redirectUri + '?code=private' }), rejects('invalid_application_url'));
    await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, { ...body, platform: 'native' }), rejects('invalid_application_platform'));
    await assert.rejects(f.lifecycle.cancel(f.owner, f.app.id, { expectedConfigurationHash: f.hash, reference: 'contains spaces' }), rejects('invalid_application_mutation'));
    assert.equal((await f.lifecycle.detail(f.owner, f.app.id)).application.configurationHash, f.hash);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_lifecycle_commands')).rows[0].count, 0);
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.owner]);
    await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, body), rejects('identity_suspended'));
    await assert.rejects(f.lifecycle.detail(f.owner, f.app.id), rejects('application_not_found'));
  } finally { await f.close(); }
});

test('owner edits preserve identity, invalidate proof/review, and rotate only a changed hostname challenge', enabled, async () => {
  const f = await fixture();
  try {
    await f.pool.query("UPDATE applications SET origin_verified_at=now(),origin_verified_host='_accesslobby-verify.lifecycle.example.test' WHERE id=$1", [f.app.id]);
    await recordFixtureApproval(f.pool, f.app.id, 'lifecycle-initial-review');
    let current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    assert.equal(current.reviewDecision, 'approved');
    const originalProof = current.originVerificationValue;
    const oldApprovedHash = current.configurationHash;
    const update = await f.lifecycle.edit(f.owner, f.app.id, { ...fields, name: 'Edited request', reference: 'owner-change-2', expectedConfigurationHash: current.configurationHash });
    assert.equal(update.changed, true);
    current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    assert.equal(current.id, f.app.id); assert.equal(current.clientId, f.app.clientId);
    assert.equal(current.originVerifiedAt, null); assert.equal(current.reviewDecision, null);
    assert.equal(current.originVerificationValue, originalProof);
    assert.notEqual(current.configurationHash, oldApprovedHash);
    await f.lifecycle.edit(f.owner, f.app.id, { ...fields, reference: 'owner-restore', expectedConfigurationHash: current.configurationHash });
    current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    assert.notEqual(current.configurationHash, oldApprovedHash);
    const firstNoop = current.configurationHash;
    await f.lifecycle.edit(f.owner, f.app.id, { ...fields, reference: 'owner-noop', expectedConfigurationHash: current.configurationHash });
    current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    assert.notEqual(current.configurationHash, firstNoop);
    await f.lifecycle.edit(f.owner, f.app.id, { ...fields, redirectUri: 'https://new-lifecycle.example.test/callback',
      logoutUri: 'https://new-lifecycle.example.test/', backchannelLogoutUri: '', reference: 'owner-host-change', expectedConfigurationHash: current.configurationHash });
    current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    assert.notEqual(current.originVerificationValue, originalProof);
    assert.equal(current.originVerificationHost, '_accesslobby-verify.new-lifecycle.example.test');
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_reviews')).rows[0].count, 1);
    await assert.rejects(f.pool.query('DELETE FROM application_reviews'));
  } finally { await f.close(); }
});

test('cancellation/resubmission retains client reservation and cannot reuse an earlier approval', enabled, async () => {
  const f = await fixture();
  try {
    await f.pool.query("UPDATE applications SET origin_verified_at=now(),origin_verified_host='_accesslobby-verify.lifecycle.example.test' WHERE id=$1", [f.app.id]);
    await recordFixtureApproval(f.pool, f.app.id, 'lifecycle-cancel-review');
    const before = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    const cancelled = await f.lifecycle.cancel(f.owner, f.app.id, { expectedConfigurationHash: before.configurationHash, reference: 'cancel-request' });
    assert.equal(cancelled.status, 'cancelled'); assert.notEqual(cancelled.configurationHash, before.configurationHash);
    assert.equal(await f.apps.allowedClient(f.app.clientId), false);
    await assert.rejects(f.apps.request(f.outsider, { ...fields, clientId: f.app.clientId }), rejects('client_id_taken'));
    const reopened = await f.lifecycle.resubmit(f.owner, f.app.id, { expectedConfigurationHash: cancelled.configurationHash, reference: 'resubmit-request' });
    assert.equal(reopened.status, 'requested'); assert.notEqual(reopened.configurationHash, cancelled.configurationHash);
    const current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    assert.equal(current.id, f.app.id); assert.equal(current.clientId, f.app.clientId);
    assert.equal(current.reviewDecision, null); assert.equal(current.originVerifiedAt, null);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_reviews')).rows[0].count, 1);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM applications')).rows[0].count, 1);
  } finally { await f.close(); }
});

test('concurrent identical owner mutations produce one event and stale/contradictory versions are refused', enabled, async () => {
  const f = await fixture();
  try {
    const command = { expectedConfigurationHash: f.hash, reference: 'cancel-concurrently' };
    const all = await Promise.all(Array.from({ length: 8 }, () => f.lifecycle.cancel(f.owner, f.app.id, command)));
    assert.equal(all.filter(result => result.changed).length, 1);
    assert(all.every(result => result.status === 'cancelled'));
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM application_events WHERE action='application.cancelled'")).rows[0].count, 1);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_lifecycle_commands')).rows[0].count, 1);
    await assert.rejects(f.lifecycle.cancel(f.owner, f.app.id, { ...command, reference: 'different-command' }), rejects('application_mutation_conflict'));
    await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, { ...fields, reference: 'stale-edit', expectedConfigurationHash: f.hash }), rejects('stale_application_mutation'));
    await assert.rejects(f.pool.query('DELETE FROM application_lifecycle_commands'));
    const current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    await f.lifecycle.resubmit(f.owner, f.app.id, { expectedConfigurationHash: current.configurationHash, reference: 'resume-after-cancel' });
    const replay = await f.lifecycle.cancel(f.owner, f.app.id, command);
    assert.equal(replay.changed, false); assert.equal(replay.status, 'requested');
  } finally { await f.close(); }
});

test('cancelled requests free quota and concurrent resubmission cannot exceed ten pending', enabled, async () => {
  const f = await fixture();
  try {
    const extra = [];
    for (let i = 0; i < 9; i++) extra.push(await f.apps.request(f.owner, { ...fields, clientId: `quota-${randomUUID()}` }));
    await assert.rejects(f.apps.request(f.owner, { ...fields, clientId: `full-${randomUUID()}` }), rejects('too_many_application_requests'));
    const one = await f.lifecycle.cancel(f.owner, f.app.id, { expectedConfigurationHash: f.hash, reference: 'quota-cancel-one' });
    const second = (await f.lifecycle.detail(f.owner, extra[0].id)).application;
    const two = await f.lifecycle.cancel(f.owner, extra[0].id, { expectedConfigurationHash: second.configurationHash, reference: 'quota-cancel-two' });
    await f.apps.request(f.owner, { ...fields, clientId: `quota-replacement-${randomUUID()}` });
    const race = await Promise.allSettled([
      f.lifecycle.resubmit(f.owner, f.app.id, { expectedConfigurationHash: one.configurationHash, reference: 'quota-resubmit-one' }),
      f.lifecycle.resubmit(f.owner, extra[0].id, { expectedConfigurationHash: two.configurationHash, reference: 'quota-resubmit-two' }),
    ]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = race.find(result => result.status === 'rejected');
    assert(rejected?.status === 'rejected' && rejects('too_many_application_requests')(rejected.reason));
    assert.equal((await f.pool.query("SELECT count(*)::int AS count FROM applications WHERE owner_person_id=$1 AND status='requested'", [f.owner])).rows[0].count, 10);
  } finally { await f.close(); }
});

test('active, suspended and external requests cannot be owner-edited and failed audit rolls back a mutation', enabled, async () => {
  const f = await fixture();
  try {
    await f.pool.query(`CREATE FUNCTION fail_lifecycle_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='application.cancelled' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END; $$`);
    await f.pool.query('CREATE TRIGGER fail_lifecycle_audit BEFORE INSERT ON application_events FOR EACH ROW EXECUTE FUNCTION fail_lifecycle_audit()');
    await assert.rejects(f.lifecycle.cancel(f.owner, f.app.id, { expectedConfigurationHash: f.hash, reference: 'rollback-cancel' }));
    assert.equal((await f.lifecycle.detail(f.owner, f.app.id)).application.configurationHash, f.hash);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_lifecycle_commands')).rows[0].count, 0);
    await f.pool.query('DROP TRIGGER fail_lifecycle_audit ON application_events');
    await f.pool.query("UPDATE applications SET status='active',trust_class='first_party',origin_verified_at=now(),origin_verified_host='_accesslobby-verify.lifecycle.example.test',activated_at=now() WHERE id=$1", [f.app.id]);
    for (const status of ['active', 'suspended']) {
      await f.pool.query('UPDATE applications SET status=$2 WHERE id=$1', [f.app.id, status]);
      const current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
      const body = { expectedConfigurationHash: current.configurationHash, reference: 'forbidden-state' };
      await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, { ...body, ...fields }), rejects('application_lifecycle_unavailable'));
      await assert.rejects(f.lifecycle.cancel(f.owner, f.app.id, body), rejects('application_lifecycle_unavailable'));
      await assert.rejects(f.lifecycle.resubmit(f.owner, f.app.id, body), rejects('application_lifecycle_unavailable'));
    }
    await f.pool.query("UPDATE applications SET status='requested',trust_class='external' WHERE id=$1", [f.app.id]);
    const current = (await f.lifecycle.detail(f.owner, f.app.id)).application;
    await assert.rejects(f.lifecycle.edit(f.owner, f.app.id, { ...fields, expectedConfigurationHash: current.configurationHash, reference: 'external-refused' }), rejects('application_lifecycle_unavailable'));
  } finally { await f.close(); }
});
