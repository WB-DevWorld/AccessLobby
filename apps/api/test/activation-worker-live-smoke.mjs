/** CI acceptance with native disposable Keycloak and PostgreSQL. Person, role,
 * independent review and DNS proof are explicitly synthetic fixtures; IAM
 * credentials, client creation/readback and transaction boundaries are real.
 * Never run against staging or pass credentials as command-line arguments. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { migrationFiles } from '../dist/migration-files.js';
import { ApplicationStore } from '../dist/applications.js';
import { ApplicationReviewStore } from '../dist/application-reviews.js';
import { OperatorStore } from '../dist/operators.js';
import { manageOperatorRole } from '../dist/manage-operator.js';
import { ActivationJobStore } from '../dist/activation-jobs.js';
import { runActivationJob } from '../dist/activation-worker.js';
import { withScopedClientToken } from '../../../infra/scripts/private-client-token.mjs';

const disposableDatabase = 'postgres://accesslobby:test-only-password@127.0.0.1:5432/accesslobby_iam_lifecycle';
if (process.argv.length !== 2 || process.env.CI !== 'true' ||
    process.env.TEST_DATABASE_URL !== disposableDatabase ||
    process.env.IAM_LIFECYCLE_DATABASE_URL !== disposableDatabase || !process.env.IAM_SMOKE_TOKEN) {
  throw new Error('Native activation acceptance requires the dedicated disposable CI database and private token environment');
}

const base = 'http://127.0.0.1:8080';
const issuer = 'http://localhost:8080/realms/accesslobby-first-party';
const adminPath = `${base}/admin/realms/accesslobby-first-party`;
const adminToken = process.env.IAM_SMOKE_TOKEN;
const suffix = randomBytes(8).toString('hex');
const schema = `alnative_${suffix}`;
assert.match(schema, /^alnative_[a-f0-9]{16}$/);
const adminDatabase = new Pool({ connectionString: disposableDatabase, max: 1, connectionTimeoutMillis: 5000 });
const pool = new Pool({ connectionString: disposableDatabase, max: 4, connectionTimeoutMillis: 5000,
  options: `-c search_path=${schema}`, statement_timeout: 15000 });
pool.on('error', () => {});
adminDatabase.on('error', () => {});
const proofs = new Map();
const lookupTxt = async host => proofs.get(host) ?? [];
const apps = new ApplicationStore(pool, [], lookupTxt);
const operators = new OperatorStore(pool);
const reviews = new ApplicationReviewStore(pool, operators);
const jobs = new ActivationJobStore(pool, operators);
const owner = randomUUID(), reviewer = randomUUID(), requester = randomUUID();
const ownedClients = new Set();
let schemaCreated = false, failed = false, cleanupFailed = false;
let stage = 'setup';

async function admin(path, init = {}) {
  const response = await fetch(`${adminPath}${path}`, { ...init,
    headers: { authorization: `Bearer ${adminToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(8000) });
  assert.ok(response.ok, 'Disposable IAM setup or readback failed');
  return response;
}

async function exactClients(clientId) {
  // Always filter exact names, including during cleanup; never enumerate or
  // remove a different test's clients by a broad synthetic-name prefix.
  const value = await (await admin(`/clients?clientId=${encodeURIComponent(clientId)}`)).json();
  assert.ok(Array.isArray(value), 'Native IAM client lookup must return a list');
  return value.filter(client => client.clientId === clientId);
}

async function clientReadback(clientId) {
  const list = await exactClients(clientId);
  assert.equal(list.length, 1, 'Expected exactly one native IAM client');
  assert.match(list[0].id, /^[a-f0-9-]{36}$/i);
  const endpoint = `/clients/${encodeURIComponent(list[0].id)}`;
  const actual = await (await admin(endpoint)).json();
  const mappers = await (await admin(`${endpoint}/protocol-mappers/models`)).json();
  assert.equal(actual.id, list[0].id, 'Readback must address the exact IAM client');
  return { actual, mappers };
}

function assertApprovedClient(fixture, readback) {
  // Assert independently against the submitted app, rather than reusing the
  // provisioner's own matchesClient predicate as acceptance evidence.
  const { input } = fixture;
  const { actual, mappers } = readback;
  assert.equal(actual.clientId, input.clientId);
  assert.equal(actual.name, input.name);
  assert.equal(actual.enabled, true);
  assert.equal(actual.protocol, 'openid-connect');
  assert.equal(actual.publicClient, true);
  assert.equal(actual.standardFlowEnabled, true);
  assert.equal(actual.implicitFlowEnabled, false);
  assert.equal(actual.directAccessGrantsEnabled, false);
  assert.equal(actual.serviceAccountsEnabled, false);
  assert.deepEqual(actual.redirectUris, [input.redirectUri]);
  assert.deepEqual(actual.webOrigins, [new URL(input.redirectUri).origin]);
  assert.equal(actual.attributes?.['pkce.code.challenge.method'], 'S256');
  assert.equal(actual.attributes?.['post.logout.redirect.uris'], input.logoutUri);
  assert.equal(actual.attributes?.['backchannel.logout.url'], input.backchannelLogoutUri);
  assert.equal(actual.attributes?.['backchannel.logout.session.required'], 'true');
  assert.ok(Array.isArray(mappers));
  const audience = mappers.filter(mapper => mapper.name === 'accesslobby-api-audience');
  assert.equal(audience.length, 1, 'Exactly one approved API audience mapper is required');
  assert.equal(audience[0].protocol, 'openid-connect');
  assert.equal(audience[0].protocolMapper, 'oidc-audience-mapper');
  assert.equal(audience[0].config?.['included.client.audience'], 'accesslobby-api');
  assert.equal(audience[0].config?.['access.token.claim'], 'true');
  assert.equal(audience[0].config?.['id.token.claim'], 'false');
}

async function fixture(label) {
  const origin = `https://native-${label}-${suffix}.example.test`;
  const input = { clientId: `ci-native-activation-${label}-${suffix}`, name: `Native activation ${label}`,
    redirectUri: `${origin}/callback`, logoutUri: `${origin}/signed-out`,
    backchannelLogoutUri: `${origin}/backchannel-logout`, visibility: 'hidden', admission: 'grant_required' };
  assert.equal((await exactClients(input.clientId)).length, 0, 'Fixture must not reuse an existing IAM client');
  ownedClients.add(input.clientId);
  const app = await apps.request(owner, input);
  // Explicit synthetic TXT answers exercise origin policy without making real
  // DNS claims or changing any deployed domain.
  proofs.set(app.originVerificationHost, [[app.originVerificationValue]]);
  await apps.verifyOrigin(owner, app.id);
  const reviewed = await reviews.detail(reviewer, app.id);
  const reference = `ci-native-review-${label}-${suffix}`;
  await reviews.record(reviewer, app.id, { decision: 'approved', reference,
    configurationHash: reviewed.application.configurationHash });
  const queued = await jobs.enqueue(requester, app.id, {
    configurationHash: reviewed.application.configurationHash, reviewReference: reference });
  assert.equal(queued.job.status, 'queued');
  assert.equal(queued.job.applicationStatus, 'requested', 'Scheduling is not activation');
  assert.equal(queued.job.attempt, 0);
  assert.equal(await apps.allowedClient(input.clientId), false);
  assert.equal((await exactClients(input.clientId)).length, 0, 'Browser queue may not create an IAM client');
  return { input, app, job: queued.job, reference };
}

async function privateWorker(fixture) {
  let temporaryClient;
  const result = await withScopedClientToken({ base,
    // This disposable IAM derives the issuer from the actual request host.
    // Human/provisioning issuer still uses the approved localhost URL.
    issuer: `${base}/realms/accesslobby-first-party`, adminToken }, async token => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    temporaryClient = payload.azp;
    assert.match(temporaryClient, /^accesslobby-private-provision-[a-f0-9-]{36}$/i);
    ownedClients.add(temporaryClient);
    const forbidden = await fetch(`${adminPath}/users`, { headers: { authorization: `Bearer ${token}` },
      redirect: 'error', signal: AbortSignal.timeout(8000) });
    assert.equal(forbidden.status, 403, 'Private client manager may not read or manage human users');
    // The helper cryptographically checks its short-lived token and exact
    // realm client-management roles. This is not a one-client IAM permission.
    return runActivationJob(pool, { issuer, base, token, lookupTxt }, fixture.job.id);
  });
  assert.ok(temporaryClient, 'Native scoped credential must have been issued');
  assert.equal((await exactClients(temporaryClient)).length, 0, 'Temporary private credential must be removed');
  return result;
}

async function registry(fixture) {
  const result = await pool.query(`SELECT a.status,a.trust_class,a.activation_job_id,a.activated_at,
    (SELECT count(*)::int FROM application_events e WHERE e.application_id=a.id AND e.action='application.activated') AS activation_events,
    (SELECT count(*)::int FROM operator_audit_events e WHERE e.target_id=a.id::text AND e.action='application.activated_private') AS activation_audits,
    (SELECT count(*)::int FROM operator_audit_events e WHERE e.target_id=$2::text AND e.action='application.activation_job.succeeded') AS job_success_audits
    FROM applications a WHERE a.id=$1`, [fixture.app.id, fixture.job.id]);
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function assertInactive(fixture) {
  const row = await registry(fixture);
  assert.equal(row.status, 'requested');
  assert.equal(row.trust_class, 'unreviewed');
  assert.equal(row.activation_job_id, null);
  assert.equal(row.activated_at, null);
  assert.equal(row.activation_events, 0);
  assert.equal(row.activation_audits, 0);
  assert.equal(row.job_success_audits, 0);
  assert.equal(await apps.allowedClient(fixture.input.clientId), false);
}

async function assertSucceeded(fixture, attempt) {
  const job = (await jobs.detail(requester, fixture.job.id)).job;
  assert.equal(job.status, 'succeeded');
  assert.equal(job.applicationStatus, 'active');
  assert.equal(job.attempt, attempt);
  assert.equal(job.lastError, null);
  assert.equal(job.retryable, false);
  assert.equal(job.leaseExpiresAt, null);
  const row = await registry(fixture);
  assert.equal(row.status, 'active');
  assert.equal(row.trust_class, 'first_party');
  assert.equal(row.activation_job_id, fixture.job.id);
  assert.ok(row.activated_at instanceof Date);
  assert.equal(row.activation_events, 1);
  assert.equal(row.activation_audits, 1);
  assert.equal(row.job_success_audits, 1);
  assert.equal(await apps.allowedClient(fixture.input.clientId), true);
  const lease = await pool.query('SELECT lease_token FROM application_activation_jobs WHERE id=$1', [fixture.job.id]);
  assert.equal(lease.rows[0].lease_token, null);
}

try {
  await adminDatabase.query(`CREATE SCHEMA ${schema}`);
  schemaCreated = true;
  assert.equal((await pool.query('SELECT current_schema() AS schema')).rows[0].schema, schema);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    for (const migration of migrationFiles) {
      await db.query(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'));
    }
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
  await pool.query("INSERT INTO persons(id,status) SELECT unnest($1::uuid[]),'active'", [[owner, reviewer, requester]]);
  await manageOperatorRole(pool, reviewer, 'grant', 'application_reviewer', 'ci-native-independent-reviewer');
  await manageOperatorRole(pool, requester, 'grant', 'application_operator', 'ci-native-private-activation-requester');

  stage = 'approved_queue_native_client_readback';
  const accepted = await fixture('accepted');
  const success = await privateWorker(accepted);
  assert.equal(success.state, 'succeeded');
  assert.equal(success.jobId, accepted.job.id);
  assertApprovedClient(accepted, await clientReadback(accepted.input.clientId));
  await assertSucceeded(accepted, 1);
  // A completed job cannot repeat private work even with a fresh credential.
  assert.equal((await privateWorker(accepted)).state, 'idle');
  assert.equal((await exactClients(accepted.input.clientId)).length, 1);
  console.info('NATIVE_ACTIVATION_PASS approved-queue scoped-private-token exact-Keycloak-readback atomic-success');

  stage = 'native_existing_client_mismatch';
  const conflict = await fixture('conflict');
  const wrongRedirect = `https://native-conflict-${suffix}.example.test/unapproved-callback`;
  await admin('/clients', { method: 'POST', body: JSON.stringify({ clientId: conflict.input.clientId,
    name: conflict.input.name, enabled: true, protocol: 'openid-connect', publicClient: true,
    standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false, redirectUris: [wrongRedirect],
    webOrigins: [new URL(conflict.input.redirectUri).origin], attributes: {
      'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': conflict.input.logoutUri,
      'backchannel.logout.url': conflict.input.backchannelLogoutUri, 'backchannel.logout.session.required': 'true' },
    protocolMappers: [{ name: 'accesslobby-api-audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
      config: { 'included.client.audience': 'accesslobby-api', 'access.token.claim': 'true', 'id.token.claim': 'false' } }] }) });
  const beforeConflict = await clientReadback(conflict.input.clientId);
  assert.deepEqual(beforeConflict.actual.redirectUris, [wrongRedirect]);
  const rejected = await privateWorker(conflict);
  assert.equal(rejected.state, 'failed');
  assert.equal(rejected.error, 'activation_iam_configuration_mismatch');
  const failedJob = (await jobs.detail(requester, conflict.job.id)).job;
  assert.equal(failedJob.status, 'failed');
  assert.equal(failedJob.lastError, 'activation_iam_configuration_mismatch');
  assert.equal(failedJob.retryable, false);
  assert.equal(failedJob.attempt, 1);
  await assertInactive(conflict);
  const unchanged = await clientReadback(conflict.input.clientId);
  assert.equal(unchanged.actual.id, beforeConflict.actual.id);
  assert.deepEqual(unchanged.actual.redirectUris, [wrongRedirect], 'Worker may not silently repair a conflicting IAM client');
  await assert.rejects(jobs.retry(requester, conflict.job.id, { expectedAttempt: 1 }), /activation_retry_unavailable/);
  console.info('NATIVE_ACTIVATION_PASS real-Keycloak-conflict no-implicit-repair registry-inactive terminal-job');

  stage = 'native_creation_database_rollback_and_retry';
  const recovery = await fixture('recovery');
  // Only this random test schema is affected. Real IAM creation/readback must
  // occur first; rejecting job completion proves the app update rolls back too.
  await pool.query(`CREATE FUNCTION reject_native_completion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.status='succeeded' THEN RAISE EXCEPTION 'synthetic native completion failure'; END IF;
    RETURN NEW; END; $$;
    CREATE TRIGGER native_completion_failure BEFORE UPDATE ON application_activation_jobs
    FOR EACH ROW EXECUTE FUNCTION reject_native_completion()`);
  const rolledBack = await privateWorker(recovery);
  assert.equal(rolledBack.state, 'failed');
  assert.equal(rolledBack.error, 'activation_private_service_unavailable');
  const createdBeforeCommit = await clientReadback(recovery.input.clientId);
  assertApprovedClient(recovery, createdBeforeCommit);
  await assertInactive(recovery);
  const retryable = (await jobs.detail(requester, recovery.job.id)).job;
  assert.equal(retryable.status, 'failed');
  assert.equal(retryable.retryable, true);
  assert.equal(retryable.attempt, 1);
  await pool.query('DROP TRIGGER native_completion_failure ON application_activation_jobs; DROP FUNCTION reject_native_completion()');
  const retried = await jobs.retry(requester, recovery.job.id, { expectedAttempt: 1 });
  assert.equal(retried.job.id, recovery.job.id);
  assert.equal(retried.job.status, 'queued');
  await assertInactive(recovery);
  assert.equal((await privateWorker(recovery)).state, 'succeeded');
  const recovered = await clientReadback(recovery.input.clientId);
  assertApprovedClient(recovery, recovered);
  assert.equal(recovered.actual.id, createdBeforeCommit.actual.id, 'Retry must reuse the existing exact native client');
  await assertSucceeded(recovery, 2);
  console.info('NATIVE_ACTIVATION_PASS actual-IAM-create synthetic-DB-failure atomic-rollback retry-without-duplicate');
} catch {
  failed = true;
  // Do not print assertion values, fetch response bodies, tokens or PG errors.
  console.error(`NATIVE_ACTIVATION_FAIL ${stage}`);
} finally {
  for (const name of ownedClients) {
    try {
      const own = await exactClients(name);
      assert.ok(own.length <= 1, 'Ambiguous own fixture cleanup');
      for (const client of own) {
        assert.match(client.id, /^[a-f0-9-]{36}$/i);
        await admin(`/clients/${encodeURIComponent(client.id)}`, { method: 'DELETE' });
      }
      assert.equal((await exactClients(name)).length, 0, 'Own fixture cleanup must be verified');
    } catch { cleanupFailed = true; }
  }
  try { await pool.end(); } catch { cleanupFailed = true; }
  if (schemaCreated) {
    try { await adminDatabase.query(`DROP SCHEMA ${schema} CASCADE`); }
    catch { cleanupFailed = true; }
  }
  try { await adminDatabase.end(); } catch { cleanupFailed = true; }
}

if (failed || cleanupFailed) {
  if (cleanupFailed) console.error('NATIVE_ACTIVATION_FAIL own-fixture-cleanup');
  process.exitCode = 1;
} else {
  console.info('NATIVE_ACTIVATION_ACCEPTANCE_PASS native-Keycloak native-PostgreSQL synthetic-DNS-and-review-fixtures own-fixtures-removed');
}
