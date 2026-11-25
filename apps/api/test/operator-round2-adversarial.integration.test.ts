import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { ApplicationError, ApplicationStore } from '../src/applications.js';
import { ApplicationLifecycleStore } from '../src/application-lifecycle.js';
import { ApplicationReviewStore } from '../src/application-reviews.js';
import { ActivationJobStore, claimActivationJob } from '../src/activation-jobs.js';
import { runActivationJob } from '../src/activation-worker.js';
import { provisionApp } from '../src/provision-app.js';
import { PersonControlStore } from '../src/person-controls.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import { proofValue } from '../src/origin-proof.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const issuer = 'https://iam.adversarial.example.test/realms/accesslobby-first-party';
const endpoint = 'http://iam:8080/admin/realms/accesslobby-first-party/clients';
type Client = Record<string, unknown> & { id: string; clientId: string; protocolMappers: unknown[] };

/** Real stores and PostgreSQL with a controlled IAM readback transport only. */
async function fixture(orderedPeople = false) {
  const database = await openIsolatedDatabase();
  try {
    const { pool } = database;
    const owner = orderedPeople ? '20000000-0000-4000-8000-000000000002' : randomUUID();
    const reviewer = orderedPeople ? '30000000-0000-4000-8000-000000000003' : randomUUID();
    const requester = orderedPeople ? '10000000-0000-4000-8000-000000000001' : randomUUID();
    for (const id of [owner, reviewer, requester]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [id]);
    await manageOperatorRole(pool, reviewer, 'grant', 'application_reviewer', 'adversarial-reviewer-grant');
    await manageOperatorRole(pool, requester, 'grant', 'application_operator', 'adversarial-requester-grant');
    let challenge = '';
    const lookupTxt = async (host: string) => {
      assert.equal(host, '_accesslobby-verify.adversarial-app.example.test');
      return [[proofValue(challenge)]];
    };
    const applications = new ApplicationStore(pool, [], lookupTxt);
    const lifecycle = new ApplicationLifecycleStore(pool);
    const operators = new OperatorStore(pool);
    const reviews = new ApplicationReviewStore(pool, operators);
    const jobs = new ActivationJobStore(pool, operators);
    const app = await applications.request(owner, { clientId: `adversarial-${randomUUID()}`, name: 'Adversarial queue fixture',
      platform: 'web', redirectUri: 'https://adversarial-app.example.test/callback', logoutUri: 'https://adversarial-app.example.test/',
      backchannelLogoutUri: 'https://adversarial-app.example.test/backchannel', visibility: 'hidden', admission: 'grant_required' });
    challenge = app.originVerificationValue.slice('accesslobby-verify='.length);
    const clients = new Map<string, Client>();
    let iamCalls = 0, iamWrites = 0;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      iamCalls++;
      const target = String(url);
      if (target === `${endpoint}?clientId=${app.clientId}`) {
        const current = clients.get(app.clientId);
        return Response.json(current ? [{ id: current.id, clientId: current.clientId }] : []);
      }
      if (target === endpoint && init?.method === 'POST') {
        iamWrites++;
        const desired = JSON.parse(String(init.body)) as Client;
        assert.equal(desired.clientId, app.clientId);
        assert.equal(clients.has(desired.clientId), false, 'A retry must reuse the existing exact client');
        clients.set(desired.clientId, { ...desired, id: randomUUID() });
        return new Response(null, { status: 201 });
      }
      const current = clients.get(app.clientId);
      if (current && target === `${endpoint}/${current.id}`) return Response.json(current);
      if (current && target === `${endpoint}/${current.id}/protocol-mappers/models`) return Response.json(current.protocolMappers);
      throw new Error('Unexpected controlled IAM operation');
    }) as typeof fetch;
    const options = { issuer, base: 'http://iam:8080', token: 'adversarial-private-scoped-token', lookupTxt, fetcher };
    async function approve(reference: string) {
      await applications.verifyOrigin(owner, app.id);
      const detail = await reviews.detail(reviewer, app.id);
      await reviews.record(reviewer, app.id, { decision: 'approved', reference,
        configurationHash: detail.application.configurationHash });
      return jobs.enqueue(requester, app.id, { configurationHash: detail.application.configurationHash, reviewReference: reference });
    }
    const queued = await approve('adversarial-original-review');
    return { ...database, owner, reviewer, requester, applications, lifecycle, reviews, jobs, app, queued, options, approve,
      counters: () => ({ iamCalls, iamWrites }) };
  } catch (error) { await database.close(); throw error; }
}

test('a cancelled and resubmitted request cannot revive its old queued job after a fresh independent approval', enabled, async () => {
  const f = await fixture();
  try {
    const before = await f.lifecycle.detail(f.owner, f.app.id);
    const cancelled = await f.lifecycle.cancel(f.owner, f.app.id, {
      expectedConfigurationHash: before.application.configurationHash, reference: 'adversarial-owner-cancel',
    });
    const reopened = await f.lifecycle.resubmit(f.owner, f.app.id, {
      expectedConfigurationHash: cancelled.configurationHash, reference: 'adversarial-owner-resubmit',
    });
    assert.notEqual(reopened.configurationHash, before.application.configurationHash);
    const fresh = await f.approve('adversarial-renewed-review');
    assert.notEqual(fresh.job.id, f.queued.job.id);
    assert.equal((await runActivationJob(f.pool, f.options, f.queued.job.id)).state, 'failed');
    assert.deepEqual(f.counters(), { iamCalls: 0, iamWrites: 0 });
    assert.equal(await f.applications.allowedClient(f.app.clientId), false);
    await assert.rejects(f.jobs.retry(f.requester, f.queued.job.id, { expectedAttempt: 1 }), OperatorError);
    assert.equal((await runActivationJob(f.pool, f.options, fresh.job.id)).state, 'succeeded');
    assert.equal(f.counters().iamWrites, 1);
    assert.equal(await f.applications.allowedClient(f.app.clientId), true);
    const current = await f.lifecycle.detail(f.owner, f.app.id);
    assert.equal(current.application.id, f.app.id);
    assert.equal(current.application.clientId, f.app.clientId);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [f.app.id])).rows[0].count, 2);
    const outcomes = await f.pool.query('SELECT status FROM application_activation_jobs WHERE application_id=$1 ORDER BY created_at,id', [f.app.id]);
    assert.deepEqual(outcomes.rows.map(row => row.status), ['failed', 'succeeded']);
  } finally { await f.close(); }
});

test('restoring requester privileges requires a fresh explicit enqueue rather than reviving queued authority', enabled, async () => {
  const f = await fixture();
  try {
    await manageOperatorRole(f.pool, f.requester, 'revoke', 'application_operator', 'adversarial-requester-revoke');
    await manageOperatorRole(f.pool, f.requester, 'grant', 'application_operator', 'adversarial-requester-restore');
    assert.equal((await runActivationJob(f.pool, f.options, f.queued.job.id)).state, 'failed');
    assert.deepEqual(f.counters(), { iamCalls: 0, iamWrites: 0 });
    const detail = await f.reviews.detail(f.reviewer, f.app.id);
    const fresh = await f.jobs.enqueue(f.requester, f.app.id, { configurationHash: detail.application.configurationHash,
      reviewReference: 'adversarial-original-review' });
    assert.notEqual(fresh.job.id, f.queued.job.id);
    assert.equal((await runActivationJob(f.pool, f.options, fresh.job.id)).state, 'succeeded');
    assert.equal(f.counters().iamWrites, 1);
    const generations = await f.pool.query('SELECT requester_grant_version FROM application_activation_jobs WHERE application_id=$1 ORDER BY created_at,id', [f.app.id]);
    assert.equal(generations.rows.length, 2);
    assert(BigInt(generations.rows[1].requester_grant_version) > BigInt(generations.rows[0].requester_grant_version));
  } finally { await f.close(); }
});

test('restoring reviewer privileges cannot restore an old approval or queued activation', enabled, async () => {
  const f = await fixture();
  try {
    await manageOperatorRole(f.pool, f.reviewer, 'revoke', 'application_reviewer', 'adversarial-reviewer-revoke');
    await manageOperatorRole(f.pool, f.reviewer, 'grant', 'application_reviewer', 'adversarial-reviewer-restore');
    assert.equal((await runActivationJob(f.pool, f.options, f.queued.job.id)).state, 'failed');
    assert.deepEqual(f.counters(), { iamCalls: 0, iamWrites: 0 });
    const prior = await f.reviews.detail(f.reviewer, f.app.id);
    await assert.rejects(f.jobs.enqueue(f.requester, f.app.id, {
      configurationHash: prior.application.configurationHash, reviewReference: 'adversarial-original-review',
    }), OperatorError);
    const fresh = await f.approve('adversarial-restored-reviewer-review');
    assert.notEqual(fresh.job.id, f.queued.job.id);
    assert.equal((await runActivationJob(f.pool, f.options, fresh.job.id)).state, 'succeeded');
    assert.equal(f.counters().iamWrites, 1);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [f.app.id])).rows[0].count, 2);
  } finally { await f.close(); }
});

test('owner suspension can complete while activation waits on its job and stale owner reads cannot authorize IAM work', enabled, async () => {
  const f = await fixture(true);
  const blocker = await f.pool.connect();
  let pendingActivation: Promise<{ value?: unknown; error?: unknown }> | undefined;
  let pendingSuspension: Promise<unknown> | undefined;
  try {
    await manageOperatorRole(f.pool, f.requester, 'grant', 'identity_operator', 'adversarial-combined-operator');
    const lease = await claimActivationJob(f.pool, f.queued.job.id);
    assert(lease);
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM application_activation_jobs WHERE id=$1 FOR UPDATE', [f.queued.job.id]);
    pendingActivation = provisionApp(f.pool, f.app.id, '--activate-first-party', 'adversarial-original-review', {
      ...f.options, activationLease: lease,
    }).then(value => ({ value }), error => ({ error }));
    // The worker has read/locked its app, but cannot pass its separately held job
    // lease. This is an actual row-lock barrier, not an arbitrary startup delay.
    let appLocked = false;
    for (let i = 0; i < 100; i++) {
      try { await f.pool.query('SELECT id FROM applications WHERE id=$1 FOR UPDATE NOWAIT', [f.app.id]); }
      catch (error) {
        if ((error as { code?: string }).code !== '55P03') throw error;
        appLocked = true; break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(appLocked, 'Private activation must reach the app lock before the competing transition');
    pendingSuspension = new PersonControlStore(f.pool, new OperatorStore(f.pool)).change(f.requester, f.owner, {
      status: 'suspended', reference: 'adversarial-suspend-queued-owner', expectedVersion: '0',
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([pendingSuspension, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Activation retained an out-of-order owner lock while waiting for its job')), 5000);
      })]);
    } finally { clearTimeout(timer); }
    await blocker.query('COMMIT');
    const result = await pendingActivation;
    assert(result.error, 'A new suspended-owner snapshot must deny activation');
    assert.notEqual((result.error as { code?: string }).code, '40P01', 'Consistent person ordering must avoid a deadlock');
    assert.deepEqual(f.counters(), { iamCalls: 0, iamWrites: 0 });
    assert.equal((await f.pool.query('SELECT status FROM persons WHERE id=$1', [f.owner])).rows[0].status, 'suspended');
    assert.equal((await f.pool.query('SELECT status FROM applications WHERE id=$1', [f.app.id])).rows[0].status, 'requested');
  } finally {
    await blocker.query('ROLLBACK').catch(() => {});
    blocker.release();
    await Promise.allSettled([pendingActivation, pendingSuspension].filter(Boolean));
    await f.close();
  }
});

test('a duplicate client request is refused while its owner row is busy, preserving quota and event history', enabled, async () => {
  const f = await fixture();
  const blocker = await f.pool.connect();
  let pending: Promise<{ value?: unknown; error?: unknown }> | undefined;
  try {
    const initialEvents = await f.pool.query('SELECT count(*)::int AS count FROM application_events WHERE application_id=$1', [f.app.id]);
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM persons WHERE id=$1 FOR UPDATE', [f.owner]);
    pending = f.applications.request(f.owner, { clientId: f.app.clientId, name: 'Duplicate while owner is busy',
      platform: 'web', redirectUri: 'https://adversarial-app.example.test/callback', logoutUri: 'https://adversarial-app.example.test/',
      visibility: 'hidden', admission: 'grant_required',
    }).then(value => ({ value }), error => ({ error }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: { value?: unknown; error?: unknown };
    try {
      result = await Promise.race([pending, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('An existing client ID waited on an unrelated owner transaction')), 5000);
      })]);
    } finally { clearTimeout(timer); }
    assert(result.error instanceof ApplicationError);
    assert.equal(result.error.status, 409);
    assert.equal(result.error.code, 'client_id_taken');
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM applications WHERE owner_person_id=$1', [f.owner])).rows[0].count, 1);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_events WHERE application_id=$1', [f.app.id])).rows[0].count, initialEvents.rows[0].count);
    assert.deepEqual(f.counters(), { iamCalls: 0, iamWrites: 0 });
  } finally {
    await blocker.query('ROLLBACK').catch(() => {});
    blocker.release();
    await pending;
    await f.close();
  }
});

test('an owner security transition requires fresh execution approval without discarding the independent configuration review', enabled, async () => {
  const f = await fixture();
  try {
    await manageOperatorRole(f.pool, f.requester, 'grant', 'identity_operator', 'adversarial-owner-transition-operator');
    const controls = new PersonControlStore(f.pool, new OperatorStore(f.pool));
    await controls.change(f.requester, f.owner, {
      status: 'suspended', reference: 'adversarial-owner-suspend', expectedVersion: '0',
    });
    await controls.change(f.requester, f.owner, {
      status: 'active', reference: 'adversarial-owner-resume', expectedVersion: '1',
    });
    const reviewed = await f.reviews.detail(f.reviewer, f.app.id);
    assert.equal(reviewed.application.configurationHash, f.queued.job.configurationHash);
    assert.equal(reviewed.application.review?.authorizationCurrent, true);
    assert.equal((await runActivationJob(f.pool, f.options, f.queued.job.id)).state, 'failed');
    assert.deepEqual(f.counters(), { iamCalls: 0, iamWrites: 0 });
    const fresh = await f.jobs.enqueue(f.requester, f.app.id, {
      configurationHash: reviewed.application.configurationHash, reviewReference: 'adversarial-original-review',
    });
    assert.notEqual(fresh.job.id, f.queued.job.id);
    assert.equal((await runActivationJob(f.pool, f.options, fresh.job.id)).state, 'succeeded');
    assert.equal(f.counters().iamWrites, 1);
    const versions = await f.pool.query('SELECT owner_person_version FROM application_activation_jobs WHERE application_id=$1 ORDER BY created_at,id', [f.app.id]);
    assert.deepEqual(versions.rows.map(row => row.owner_person_version), ['0', '2']);
    assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [f.app.id])).rows[0].count, 1);
  } finally { await f.close(); }
});
