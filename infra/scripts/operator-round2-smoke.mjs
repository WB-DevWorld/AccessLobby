#!/usr/bin/env node
/** Joined round-2 qualification: real isolated PostgreSQL, compiled Nest API,
 * production Next UI and browser, with synthetic signed OIDC and DNS fixtures.
 * No live IAM, estate, installed-device or production acceptance is inferred. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiDirectory = resolve(root, 'apps/api'), web = resolve(root, 'apps/web');
const requireApi = createRequire(resolve(apiDirectory, 'package.json'));
const { Pool } = requireApi('pg');
const { EncryptJWT, SignJWT, generateKeyPair, exportJWK } = await import(pathToFileURL(requireApi.resolve('jose')).href);
const { migrationFiles } = await import(pathToFileURL(resolve(apiDirectory, 'dist/migration-files.js')).href);
const { manageOperatorRole } = await import(pathToFileURL(resolve(apiDirectory, 'dist/manage-operator.js')).href);
const { ApplicationStore } = await import(pathToFileURL(resolve(apiDirectory, 'dist/applications.js')).href);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for isolated round-2 qualification');

const schema = 'alround2_' + randomBytes(8).toString('hex');
assert.match(schema, /^alround2_[a-f0-9]{16}$/);
const database = new URL(process.env.TEST_DATABASE_URL);
database.searchParams.set('options', '-c search_path=' + schema);
const adminDatabase = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
const pool = new Pool({ connectionString: database.href, max: 8 });
const artifacts = resolve(root, 'artifacts/operator-round2');
mkdirSync(artifacts, { recursive: true });
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirtyWorktree = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
const actors = Object.fromEntries(['reader', 'reviewer', 'identityOperator', 'appOperator', 'owner', 'outsider', 'target', 'browserTarget'].map(name => [name, {
  id: randomUUID(), subject: 'private-round2-subject-' + name + '-' + randomUUID(), sid: 'private-round2-sid-' + randomUUID(),
}]));
const sealedKey = randomBytes(32), secrets = new Set();
for (const actor of Object.values(actors)) { secrets.add(actor.subject); secrets.add(actor.sid); }
const checks = [], children = [], contexts = [], browserErrors = [], usedPorts = new Set();
let browser, issuerServer, schemaCreated = false, issuer, apiOrigin, origin, mint;
let stage = 'setup';
const tokens = {};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listener = createServer();
    listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    if (!usedPorts.has(port)) { usedPorts.add(port); return port; }
  }
  throw new Error('No independent fixture port');
}
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-10000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-10000); });
  child.on('error', () => {});
  child.fixtureOutput = () => output;
  children.push(child); return child;
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.exitCode !== null || child.signalCode) throw new Error('Fixture process exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Fixture readiness timed out');
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode) return;
  const stopped = once(child, 'exit').catch(() => {});
  child.kill('SIGTERM');
  let timer;
  await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000); })]);
  clearTimeout(timer);
}
async function check(name, work) {
  stage = name;
  try { await work(); checks.push({ name, result: 'PASS' }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, result: 'FAIL', error: error?.name ?? 'Error' }); throw error; }
}
async function api(path, token, status = 200, init = {}) {
  const response = await fetch(apiOrigin + path, {
    ...init,
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    signal: AbortSignal.timeout(6000),
  });
  const statuses = Array.isArray(status) ? status : [status];
  assert(statuses.includes(response.status), 'Unexpected HTTP status ' + response.status + ' for ' + path + '; expected ' + statuses.join('/'));
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const value = await response.json();
  return value;
}
function post(body) { return { method: 'POST', body: JSON.stringify(body) }; }
function privateValuesAbsent(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of secrets) assert(!text.includes(secret), 'A private authentication value reached page or API output');
}
function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join('[private]');
  return text.replace(/eyJ[A-Za-z0-9_.-]+/g, '[token]');
}
async function contextFor(token) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  contexts.push(context);
  context.on('page', page => page.on('pageerror', error => browserErrors.push(error.name)));
  if (token) {
    const sealed = await new EncryptJWT({ accessToken: token }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt().setExpirationTime('15m').encrypt(sealedKey);
    secrets.add(sealed);
    await context.addCookies([{ name: 'al-session', value: sealed, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  }
  return context;
}
async function currentToken(actor) {
  const result = await pool.query('SELECT session_not_before FROM persons WHERE id=$1', [actor.id]);
  const cutoff = Number(result.rows[0]?.session_not_before ?? 0);
  for (let attempt = 0; Math.floor(Date.now() / 1000) < cutoff; attempt++) {
    if (attempt >= 35) throw new Error('Fresh-token cutoff did not become current');
    await delay(100);
  }
  return mint(actor);
}
async function submitNative(page, buttonName, destination) {
  const button = page.getByRole('button', { name: buttonName, exact: true });
  const confirm = await button.getAttribute('data-confirm');
  const finished = page.waitForURL(destination, { timeout: 12000 });
  await button.click();
  if (confirm) {
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click();
  }
  await finished;
}
function editable(application, reference, changes = {}) {
  const names = ['name', 'platform', 'redirectUri', 'logoutUri', 'backchannelLogoutUri', 'visibility', 'admission'];
  const fields = Object.fromEntries(names.map(name => [name, application[name]]));
  return { ...fields, expectedConfigurationHash: application.configurationHash, reference, ...changes };
}
async function assertProtectedPage(page, path, heading) {
  const response = await page.goto(origin + path);
  assert.match(response.headers()['cache-control'] ?? '', /no-store/);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  privateValuesAbsent(await page.content());
}
async function csrf(context, path, form) {
  const response = await context.request.post(origin + path, {
    headers: { origin: 'https://unrelated.example.test' }, form, maxRedirects: 0,
  });
  assert.equal(response.status(), 403);
  assert.match(response.headers()['cache-control'] ?? '', /no-store/);
}

try {
  await adminDatabase.query('CREATE SCHEMA ' + schema); schemaCreated = true;
  for (const migration of migrationFiles) await pool.query(readFileSync(resolve(apiDirectory, 'migrations', migration), 'utf8'));
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'round2-fixture', alg: 'RS256', use: 'sig' };
  issuerServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/realms/accesslobby-first-party/.well-known/openid-configuration') return res.end(JSON.stringify({
      issuer, jwks_uri: issuer + '/certs', authorization_endpoint: issuer + '/auth',
      token_endpoint: issuer + '/token', end_session_endpoint: issuer + '/logout',
    }));
    if (req.url === '/realms/accesslobby-first-party/certs') return res.end(JSON.stringify({ keys: [jwk] }));
    res.statusCode = 404; res.end(JSON.stringify({ error: 'synthetic_endpoint_only' }));
  });
  issuerServer.listen(0, '127.0.0.1'); await once(issuerServer, 'listening');
  issuer = 'http://127.0.0.1:' + issuerServer.address().port + '/realms/accesslobby-first-party';
  usedPorts.add(issuerServer.address().port);
  const apiPort = await freePort(), webPort = await freePort();
  apiOrigin = 'http://127.0.0.1:' + apiPort; origin = 'http://127.0.0.1:' + webPort;
  mint = async (actor, client = 'accesslobby-web', issuedAt = Math.floor(Date.now() / 1000)) => {
    const token = await new SignJWT({
      azp: client, sid: actor.sid,
      realm_access: { roles: ['admin', 'identity_operator', 'application_operator', 'application_reviewer'] },
    }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setSubject(actor.subject)
      .setAudience('accesslobby-api').setIssuedAt(issuedAt).setExpirationTime(Math.floor(Date.now() / 1000) + 900).sign(privateKey);
    secrets.add(token); return token;
  };
  for (const actor of Object.values(actors)) {
    await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [actor.id]);
    await pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3)', [issuer, actor.subject, actor.id]);
  }
  for (const [actor, role] of [['reader', 'support_reader'], ['reviewer', 'application_reviewer'],
    ['identityOperator', 'identity_operator'], ['appOperator', 'application_operator']]) {
    await manageOperatorRole(pool, actors[actor].id, 'grant', role, 'round2-fixture-' + actor);
  }
  const organizationId = randomUUID();
  await pool.query("INSERT INTO organizations(id,name,created_by) VALUES($1,'Round two qualification organization',$2)", [organizationId, actors.owner.id]);
  await pool.query("INSERT INTO organization_memberships(organization_id,person_id,role,status) VALUES($1,$2,'owner','active'),($1,$3,'member','active')", [organizationId, actors.owner.id, actors.target.id]);
  const dns = new Map();
  const applications = new ApplicationStore(pool, [], async host => dns.has(host) ? [[dns.get(host)]] : []);
  async function fixtureApp(name, suffix, active = false) {
    const hostname = suffix + '.round2.example.test';
    const requested = await applications.request(actors.owner.id, {
      clientId: 'round2-' + suffix + '-' + randomUUID(), name, platform: 'web',
      redirectUri: 'https://' + hostname + '/callback', logoutUri: 'https://' + hostname + '/',
      visibility: 'hidden', admission: 'grant_required',
    });
    dns.set(requested.originVerificationHost, requested.originVerificationValue);
    await applications.verifyOrigin(actors.owner.id, requested.id);
    if (active) {
      // Explicit synthetic legacy-active registry fixture; no IAM client or DNS claim.
      await pool.query("UPDATE applications SET status='active',trust_class='first_party',activated_at=now(),review_reference='round2-legacy-fixture' WHERE id=$1", [requested.id]);
    }
    return requested;
  }
  const activeApp = await fixtureApp('Existing active application', 'active', true);
  await applications.grant(actors.owner.id, activeApp.id, actors.target.id, undefined);
  const lifecycleApp = await fixtureApp('HTTP lifecycle fixture', 'http-lifecycle');
  const queueApp = await fixtureApp('HTTP activation queue fixture', 'http-activation');
  const browserLifecycleApp = await fixtureApp('Browser owner lifecycle fixture', 'browser-lifecycle');
  const browserQueueApp = await fixtureApp('Browser activation queue fixture', 'browser-activation');
  const deniedQueueApp = await fixtureApp('No approved review fixture', 'no-review');
  for (const [name, actor] of Object.entries(actors)) tokens[name] = await mint(actor, 'accesslobby-web', Math.floor(Date.now() / 1000) - 5);
  const apiChild = start(['dist/main.js'], apiDirectory, {
    DATABASE_URL: database.href, OIDC_ISSUER: issuer, OIDC_API_AUDIENCE: 'accesslobby-api',
    ALLOWED_CLIENT_IDS: 'accesslobby-web,round2-peer', PORT: String(apiPort), GIT_SHA: 'operator-round2-fixture',
  });
  await ready(apiOrigin + '/health/ready', apiChild);
  const standalone = resolve(web, '.next/standalone/apps/web');
  cpSync(resolve(web, 'public'), resolve(standalone, 'public'), { recursive: true });
  cpSync(resolve(web, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
  const webChild = start([resolve(standalone, 'server.js')], root, {
    WEB_BASE_URL: origin, API_INTERNAL_URL: apiOrigin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'accesslobby-web',
    SESSION_SECRET: sealedKey.toString('base64url'), PUBLIC_REGISTRATION_ENABLED: 'false',
    NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(webPort), NEXT_TELEMETRY_DISABLED: '1',
  });
  await ready(origin + '/manifest.webmanifest', webChild);
  browser = await chromium.launch({ ...(process.env.UI_BROWSER_EXECUTABLE ? {
    executablePath: process.env.UI_BROWSER_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  } : {}) });
  const anonymousContext = await contextFor(), anonymousPage = await anonymousContext.newPage();
  const readerContext = await contextFor(tokens.reader), readerPage = await readerContext.newPage();
  const identityContext = await contextFor(tokens.identityOperator), identityPage = await identityContext.newPage();
  const ownerContext = await contextFor(tokens.owner), ownerPage = await ownerContext.newPage();
  const activationContext = await contextFor(tokens.appOperator), activationPage = await activationContext.newPage();
  const oldTargetContext = await contextFor(tokens.target), oldTargetPage = await oldTargetContext.newPage();
  for (const page of [anonymousPage, readerPage, identityPage, ownerPage, activationPage, oldTargetPage]) page.setDefaultTimeout(10000);

  await check('new controls require explicit current platform roles, never owner or token claims', async () => {
    await api('/v1/admin/people/' + actors.target.id, undefined, 401);
    await api('/v1/admin/people/' + actors.target.id, tokens.owner, 403);
    await api('/v1/admin/activation-jobs', tokens.owner, 403);
    await api('/v1/admin/people/' + actors.target.id, await mint(actors.identityOperator, 'round2-peer'), 403);
    const identity = await api('/v1/admin/access', tokens.identityOperator);
    assert.equal(identity.capabilities.managePeople, true);
    assert.equal(identity.capabilities.activateApplications, false);
    const activation = await api('/v1/admin/access', tokens.appOperator);
    assert.equal(activation.capabilities.activateApplications, true);
    assert.equal(activation.capabilities.managePeople, false);
    const reader = await api('/v1/admin/access', tokens.reader);
    assert.equal(reader.capabilities.managePeople, false);
    assert.equal(reader.capabilities.activateApplications, false);
    for (const value of [identity, activation, reader, await api('/v1/admin/people/' + actors.target.id, tokens.reader)]) privateValuesAbsent(value);
  });

  await check('suspend and resume invalidate old bearer, peer receipt and stale browser authority', async () => {
    await oldTargetPage.goto(origin + '/account');
    await oldTargetPage.getByRole('heading', { name: "You're signed in", exact: true }).waitFor();
    const peerToken = await mint(actors.target, activeApp.clientId, Math.floor(Date.now() / 1000) - 5);
    const receiptResult = await api('/v1/me', peerToken, 200, { headers: { 'x-accesslobby-session-receipt': '1' } });
    assert.equal(receiptResult.peerSession.contract, 'accesslobby.peer-session.v0.1');
    const receipt = receiptResult.peerSession.receipt; secrets.add(receipt);
    const receiptRequest = { method: 'POST', headers: { authorization: 'PeerSession ' + receipt, 'x-accesslobby-client-id': activeApp.clientId } };
    assert.equal((await api('/v1/peer-sessions/status', undefined, 200, receiptRequest)).active, true);
    const detail = await api('/v1/admin/people/' + actors.target.id, tokens.reader);
    const change = { status: 'suspended', reference: 'round2-http-suspend', expectedVersion: detail.person.statusVersion };
    await api('/v1/admin/people/' + actors.target.id + '/status', tokens.reader, 403, post(change));
    const self = await api('/v1/admin/people/' + actors.identityOperator.id, tokens.identityOperator);
    await api('/v1/admin/people/' + actors.identityOperator.id + '/status', tokens.identityOperator, 403,
      post({ ...change, expectedVersion: self.person.statusVersion }));
    const protectedPerson = await api('/v1/admin/people/' + actors.reviewer.id, tokens.identityOperator);
    assert.equal(protectedPerson.person.protectedOperator, true);
    await api('/v1/admin/people/' + actors.reviewer.id + '/status', tokens.identityOperator, 403,
      post({ ...change, expectedVersion: protectedPerson.person.statusVersion }));
    const suspended = await api('/v1/admin/people/' + actors.target.id + '/status', tokens.identityOperator, 200, post(change));
    assert.equal(suspended.person.status, 'suspended'); assert.equal(suspended.changed, true);
    const repeat = await api('/v1/admin/people/' + actors.target.id + '/status', tokens.identityOperator, 200, post(change));
    assert.equal(repeat.changed, false); assert.equal(repeat.person.statusVersion, suspended.person.statusVersion);
    await api('/v1/me', tokens.target, 403);
    await api('/v1/session/end', tokens.target, 403, { method: 'POST' });
    await api('/v1/peer-sessions/status', undefined, 401, receiptRequest);
    await api('/v1/admin/people/' + actors.target.id + '/status', tokens.identityOperator, 409,
      post({ status: 'active', reference: 'round2-stale-resume', expectedVersion: detail.person.statusVersion }));
    await api('/v1/admin/people/' + actors.target.id + '/status', tokens.identityOperator, 200,
      post({ status: 'active', reference: 'round2-http-resume', expectedVersion: suspended.person.statusVersion }));
    await api('/v1/me', tokens.target, 401);
    await api('/v1/session/end', tokens.target, 401, { method: 'POST' });
    await api('/v1/peer-sessions/status', undefined, 401, receiptRequest);
    await oldTargetPage.reload();
    await oldTargetPage.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();
    const fresh = await currentToken(actors.target); // Same issuer SID, freshly issued after the cutoff.
    assert.equal((await api('/v1/me', fresh)).person.id, actors.target.id);
    // The stale bearer must not revoke this currently valid, same-SID authentication.
    await api('/v1/session/end', tokens.target, 401, { method: 'POST' });
    await api('/v1/me', fresh);
    await api('/v1/session/end', fresh, 200, { method: 'POST' });
    await api('/v1/me', fresh, 401);
    const preserved = await pool.query("SELECT m.status AS membership_status,g.status AS grant_status,l.person_id FROM organization_memberships m JOIN application_grants g ON g.person_id=m.person_id JOIN iam_subject_links l ON l.person_id=m.person_id WHERE m.organization_id=$1 AND m.person_id=$2 AND g.application_id=$3", [organizationId, actors.target.id, activeApp.id]);
    assert.equal(preserved.rows[0].membership_status, 'active');
    assert.equal(preserved.rows[0].grant_status, 'active');
    assert.equal(preserved.rows[0].person_id, actors.target.id);
  });

  async function approve(application, reference) {
    const detail = await api('/v1/admin/applications/' + application.id, tokens.reviewer);
    await api('/v1/admin/applications/' + application.id + '/review', tokens.reviewer, 200,
      post({ decision: 'approved', reference, configurationHash: detail.application.configurationHash }));
    return (await api('/v1/admin/applications/' + application.id, tokens.reviewer)).application;
  }

  await check('owner lifecycle preserves IDs and refuses cross-owner, active and stale mutations', async () => {
    await approve(lifecycleApp, 'round2-lifecycle-old-approval');
    const original = (await api('/v1/applications/' + lifecycleApp.id, tokens.owner)).application;
    assert.equal(original.reviewDecision, 'approved');
    await api('/v1/applications/' + lifecycleApp.id, tokens.outsider, 404);
    const edit = editable(original, 'round2-http-edit', { name: 'Changed HTTP lifecycle request' });
    await api('/v1/applications/' + lifecycleApp.id, tokens.outsider, 404, { method: 'PATCH', body: JSON.stringify(edit) });
    await api('/v1/applications/' + lifecycleApp.id, tokens.owner, 400, { method: 'PATCH', body: JSON.stringify({ ...edit, clientId: 'take-over-client' }) });
    await api('/v1/applications/' + lifecycleApp.id, tokens.owner, 400, { method: 'PATCH', body: JSON.stringify({ ...edit, redirectUri: 'https://unrelated.example.test/callback' }) });
    const active = (await api('/v1/applications/' + activeApp.id, tokens.owner)).application;
    await api('/v1/applications/' + activeApp.id, tokens.owner, 409, { method: 'PATCH', body: JSON.stringify(editable(active, 'round2-refuse-active')) });
    await api('/v1/applications/' + lifecycleApp.id, tokens.owner, 200, { method: 'PATCH', body: JSON.stringify(edit) });
    const edited = (await api('/v1/applications/' + lifecycleApp.id, tokens.owner)).application;
    assert.equal(edited.id, original.id); assert.equal(edited.clientId, original.clientId);
    assert.equal(edited.name, edit.name); assert.equal(edited.originVerifiedAt, null); assert.equal(edited.reviewDecision, null);
    assert.notEqual(edited.configurationHash, original.configurationHash);
    const repeat = await api('/v1/applications/' + lifecycleApp.id, tokens.owner, 200, { method: 'PATCH', body: JSON.stringify(edit) });
    assert.equal(repeat.changed, false);
    await api('/v1/applications/' + lifecycleApp.id, tokens.owner, 409,
      { method: 'PATCH', body: JSON.stringify({ ...edit, reference: 'round2-stale-other-edit' }) });
    const cancelBody = { expectedConfigurationHash: edited.configurationHash, reference: 'round2-http-cancel' };
    const cancelled = await api('/v1/applications/' + lifecycleApp.id + '/cancel', tokens.owner, 200, post(cancelBody));
    assert.equal(cancelled.status, 'cancelled');
    assert.equal((await api('/v1/applications/' + lifecycleApp.id + '/cancel', tokens.owner, 200, post(cancelBody))).changed, false);
    await api('/v1/applications/' + lifecycleApp.id + '/verify-origin', tokens.owner, 409, { method: 'POST' });
    const reopen = await api('/v1/applications/' + lifecycleApp.id + '/resubmit', tokens.owner, 200,
      post({ expectedConfigurationHash: cancelled.configurationHash, reference: 'round2-http-resubmit' }));
    assert.equal(reopen.status, 'requested'); assert.notEqual(reopen.configurationHash, original.configurationHash);
    const final = (await api('/v1/applications/' + lifecycleApp.id, tokens.owner)).application;
    assert.equal(final.id, original.id); assert.equal(final.clientId, original.clientId);
    assert.equal(final.originVerifiedAt, null); assert.equal(final.reviewDecision, null);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [lifecycleApp.id])).rows[0].count, 1);
    privateValuesAbsent(final);
  });

  let queued;
  await check('activation jobs require current independent approval and never activate at enqueue', async () => {
    const reviewed = await approve(queueApp, 'round2-http-activation-review');
    const body = { configurationHash: reviewed.configurationHash, reviewReference: reviewed.review.reference };
    await api('/v1/admin/applications/' + queueApp.id + '/activation-jobs', tokens.owner, 403, post(body));
    await api('/v1/admin/applications/' + queueApp.id + '/activation-jobs', tokens.reviewer, 403, post(body));
    await api('/v1/admin/applications/' + queueApp.id + '/activation-jobs', tokens.appOperator, 409, post({ ...body, configurationHash: '0'.repeat(64) }));
    const noReview = (await api('/v1/admin/applications/' + deniedQueueApp.id, tokens.appOperator)).application;
    await api('/v1/admin/applications/' + deniedQueueApp.id + '/activation-jobs', tokens.appOperator, [403, 409],
      post({ configurationHash: noReview.configurationHash, reviewReference: 'round2-no-approval' }));
    queued = (await api('/v1/admin/applications/' + queueApp.id + '/activation-jobs', tokens.appOperator, 202, post(body))).job;
    assert.equal(queued.status, 'queued');
    const repeat = (await api('/v1/admin/applications/' + queueApp.id + '/activation-jobs', tokens.appOperator, 202, post(body))).job;
    assert.equal(repeat.id, queued.id);
    const visible = await api('/v1/admin/activation-jobs', tokens.reader);
    assert(visible.jobs.some(job => job.id === queued.id));
    privateValuesAbsent(visible);
    assert.equal((await api('/v1/admin/applications/' + queueApp.id, tokens.reader)).application.status, 'requested');
    await api('/v1/admin/activation-jobs/' + queued.id + '/retry', tokens.reader, 403, post({ expectedAttempt: queued.attempt }));
    await api('/v1/admin/activation-jobs/' + queued.id + '/retry', tokens.appOperator, 409, post({ expectedAttempt: Math.max(1, queued.attempt) }));
  });

  await check('revoked reviewer and edited requests cannot reuse an existing activation approval', async () => {
    const approved = await approve(deniedQueueApp, 'round2-revoked-reviewer');
    await manageOperatorRole(pool, actors.reviewer.id, 'revoke', 'application_reviewer', 'round2-revoke-reviewer');
    await api('/v1/admin/applications/' + deniedQueueApp.id + '/activation-jobs', tokens.appOperator, [403, 409],
      post({ configurationHash: approved.configurationHash, reviewReference: approved.review.reference }));
    const noJob = await api('/v1/admin/activation-jobs', tokens.reader);
    assert.equal(noJob.jobs.filter(job => job.applicationId === deniedQueueApp.id).length, 0);
    await manageOperatorRole(pool, actors.reviewer.id, 'grant', 'application_reviewer', 'round2-restore-reviewer');
    const original = (await api('/v1/applications/' + queueApp.id, tokens.owner)).application;
    await api('/v1/applications/' + queueApp.id, tokens.owner, 200,
      { method: 'PATCH', body: JSON.stringify(editable(original, 'round2-edit-queued-request', { name: 'Changed after activation was queued' })) });
    await api('/v1/admin/applications/' + queueApp.id + '/activation-jobs', tokens.appOperator, 409,
      post({ configurationHash: queued.configurationHash, reviewReference: queued.reviewReference }));
    const current = (await api('/v1/applications/' + queueApp.id, tokens.owner)).application;
    assert.equal(current.status, 'requested'); assert.equal(current.reviewDecision, null);
    assert.notEqual(current.configurationHash, queued.configurationHash);
  });

  await check('new protected pages deny anonymous users and render privately at narrow and wide widths', async () => {
    for (const path of ['/admin/people/' + actors.browserTarget.id, '/admin/activations',
      '/admin/activations/' + queued.id, '/apps/manage/' + browserLifecycleApp.id]) {
      await assertProtectedPage(anonymousPage, path, 'Sign in to continue');
    }
    await assertProtectedPage(ownerPage, '/admin/people/' + actors.browserTarget.id, 'Operator access required');
    for (const width of [360, 1440]) {
      for (const [page, path, heading] of [
        [identityPage, '/admin/people/' + actors.browserTarget.id, 'Person record'],
        [ownerPage, '/apps/manage/' + browserLifecycleApp.id, browserLifecycleApp.name],
        [activationPage, '/admin/activations', 'Activation jobs'],
        [activationPage, '/admin/activations/' + queued.id, 'Private activation'],
      ]) {
        await page.setViewportSize({ width, height: 900 });
        await assertProtectedPage(page, path, heading);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Round-2 page overflow at ' + width);
      }
      if (width >= 900) {
        await identityPage.getByRole('link', { name: 'Operator console', exact: true }).waitFor();
        await activationPage.getByRole('link', { name: 'Operator console', exact: true }).waitFor();
      }
      await identityPage.screenshot({ path: resolve(artifacts, 'person-' + width + '.png'), fullPage: true });
    }
    await readerPage.goto(origin + '/admin/people/' + actors.browserTarget.id);
    assert.equal(await readerPage.getByRole('button', { name: 'Suspend person', exact: true }).count(), 0);
  });

  await check('native person controls enforce confirmation, CSRF and stale-token refusal after re-enable', async () => {
    const before = await api('/v1/admin/people/' + actors.browserTarget.id, tokens.identityOperator);
    await csrf(identityContext, '/admin/people/action', { intent: 'change-status', personId: actors.browserTarget.id,
      status: 'suspended', reference: 'round2-cross-site-person', expectedVersion: before.person.statusVersion });
    assert.equal((await api('/v1/admin/people/' + actors.browserTarget.id, tokens.identityOperator)).person.status, 'active');
    const path = '/admin/people/' + actors.browserTarget.id;
    await identityPage.goto(origin + path);
    await identityPage.getByLabel('Change reference', { exact: true }).fill('round2-browser-suspend');
    await submitNative(identityPage, 'Suspend person', url => url.pathname === path && url.searchParams.has('notice'));
    assert.equal((await api('/v1/admin/people/' + actors.browserTarget.id, tokens.identityOperator)).person.status, 'suspended');
    await api('/v1/me', tokens.browserTarget, 403);
    await identityPage.goto(origin + path);
    await identityPage.getByLabel('Change reference', { exact: true }).fill('round2-browser-resume');
    await submitNative(identityPage, 'Re-enable person', url => url.pathname === path && url.searchParams.has('notice'));
    assert.equal((await api('/v1/admin/people/' + actors.browserTarget.id, tokens.identityOperator)).person.status, 'active');
    await api('/v1/me', tokens.browserTarget, 401);
    const fresh = await currentToken(actors.browserTarget);
    assert.equal((await api('/v1/me', fresh)).person.id, actors.browserTarget.id);
  });

  await check('native owner forms edit, cancel and resubmit without reusing earlier proof', async () => {
    const path = '/apps/manage/' + browserLifecycleApp.id;
    const before = (await api('/v1/applications/' + browserLifecycleApp.id, tokens.owner)).application;
    await csrf(ownerContext, '/apps/action', { intent: 'edit', applicationId: browserLifecycleApp.id });
    assert.equal((await api('/v1/applications/' + browserLifecycleApp.id, tokens.owner)).application.configurationHash, before.configurationHash);
    await ownerPage.goto(origin + path);
    await ownerPage.getByLabel('Application name', { exact: true }).fill('Edited by the native owner form');
    const save = ownerPage.getByRole('button', { name: 'Save request changes', exact: true });
    const editForm = ownerPage.locator('form').filter({ has: save });
    await editForm.locator('input[name="reference"]').fill('round2-browser-edit');
    await submitNative(ownerPage, 'Save request changes', url => url.pathname === path && url.searchParams.has('notice'));
    const edited = (await api('/v1/applications/' + browserLifecycleApp.id, tokens.owner)).application;
    assert.equal(edited.name, 'Edited by the native owner form'); assert.equal(edited.originVerifiedAt, null);
    assert.equal(edited.id, before.id); assert.equal(edited.clientId, before.clientId);
    await ownerPage.goto(origin + path);
    const cancel = ownerPage.getByRole('button', { name: 'Cancel request', exact: true });
    await ownerPage.locator('form').filter({ has: cancel }).locator('input[name="reference"]').fill('round2-browser-cancel');
    await submitNative(ownerPage, 'Cancel request', url => url.pathname === path && url.searchParams.has('notice'));
    assert.equal((await api('/v1/applications/' + browserLifecycleApp.id, tokens.owner)).application.status, 'cancelled');
    await ownerPage.goto(origin + path);
    const resubmit = ownerPage.getByRole('button', { name: 'Resubmit for review', exact: true });
    await ownerPage.locator('form').filter({ has: resubmit }).locator('input[name="reference"]').fill('round2-browser-resubmit');
    await submitNative(ownerPage, 'Resubmit for review', url => url.pathname === path && url.searchParams.has('notice'));
    const current = (await api('/v1/applications/' + browserLifecycleApp.id, tokens.owner)).application;
    assert.equal(current.status, 'requested'); assert.equal(current.originVerifiedAt, null);
    assert.equal(current.reviewDecision, null); assert.notEqual(current.configurationHash, before.configurationHash);
    privateValuesAbsent(await ownerPage.content());
  });

  await check('native activation queues exact reviewed configuration and displays pending private work', async () => {
    await approve(browserQueueApp, 'round2-browser-activation-review');
    await csrf(activationContext, '/admin/activations/action', { intent: 'enqueue', applicationId: browserQueueApp.id });
    const path = '/admin/applications/' + browserQueueApp.id;
    await activationPage.goto(origin + path);
    await submitNative(activationPage, 'Queue private activation', url => /^\/admin\/activations\/[0-9a-f-]{36}$/.test(url.pathname));
    await activationPage.getByRole('heading', { name: 'Private activation', exact: true }).waitFor();
    const jobId = new URL(activationPage.url()).pathname.split('/').at(-1);
    const job = (await api('/v1/admin/activation-jobs/' + jobId, tokens.reader)).job;
    assert.equal(job.status, 'queued'); assert.equal(job.applicationId, browserQueueApp.id);
    assert.equal((await api('/v1/admin/applications/' + browserQueueApp.id, tokens.reader)).application.status, 'requested');
    await activationPage.getByText('Queued', { exact: true }).first().waitFor();
    privateValuesAbsent(await activationPage.content());
    await activationPage.screenshot({ path: resolve(artifacts, 'activation-queued.png'), fullPage: true });
  });

  await check('current role revocation removes authority from existing operator browser sessions', async () => {
    await manageOperatorRole(pool, actors.appOperator.id, 'revoke', 'application_operator', 'round2-revoke-application-operator');
    await api('/v1/admin/activation-jobs', tokens.appOperator, 403);
    await assertProtectedPage(activationPage, '/admin/activations', 'Operator access required');
    await manageOperatorRole(pool, actors.identityOperator.id, 'revoke', 'identity_operator', 'round2-revoke-identity-operator');
    await api('/v1/admin/people/' + actors.browserTarget.id, tokens.identityOperator, 403);
    await assertProtectedPage(identityPage, '/admin/people/' + actors.browserTarget.id, 'Operator access required');
    privateValuesAbsent(await api('/v1/admin/audit', tokens.reader));
  });
  await check('round-2 browser routes have no hydration or runtime page errors', async () => {
    assert.deepEqual(browserErrors, []);
  });
} catch (error) {
  if (!checks.some(value => value.result === 'FAIL')) checks.push({ name: stage, result: 'FAIL', error: error?.name ?? 'Error' });
  console.error('FAIL round-2 qualification (' + (error?.name ?? 'Error') + '): ' + redact(error?.message ?? 'unknown'));
  process.exitCode = 1;
} finally {
  const cleanup = async (name, work) => {
    try { await work(); } catch {
      checks.push({ name: 'cleanup ' + name, result: 'FAIL', error: 'CleanupError' }); process.exitCode = 1;
    }
  };
  await cleanup('browser contexts', () => Promise.all(contexts.map(context => context.close().catch(() => {}))));
  await cleanup('browser', async () => { await browser?.close(); });
  for (const child of [...children].reverse()) await cleanup('fixture process', () => stop(child));
  await cleanup('issuer', async () => { if (issuerServer) await new Promise(resolve => issuerServer.close(resolve)); });
  await cleanup('schema pool', () => pool.end());
  await cleanup('isolated schema', async () => { if (schemaCreated) await adminDatabase.query('DROP SCHEMA ' + schema + ' CASCADE'); });
  await cleanup('admin pool', () => adminDatabase.end());
  writeFileSync(resolve(artifacts, 'report.json'), JSON.stringify({
    source, dirtyWorktree, observedAt: new Date().toISOString(),
    scope: 'synthetic OIDC and DNS fixtures; real isolated PostgreSQL, compiled API and production Next browser',
    privateWorkerRecovery: 'Covered separately by activation service tests; no live worker is run here',
    liveIam: 'NOT RUN', estate: 'NOT RUN', installedDevices: 'NOT RUN', staging: 'NOT RUN', production: 'NOT RUN',
    result: process.exitCode ? 'FAIL' : 'PASS', checks,
  }, null, 2) + '\n');
}
