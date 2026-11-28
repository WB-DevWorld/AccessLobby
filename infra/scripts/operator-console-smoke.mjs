#!/usr/bin/env node
/** Joined local qualification: real PostgreSQL, Nest API and production Next UI,
 * with an explicitly synthetic loopback OIDC issuer. This is not live-IAM,
 * staging, device or production acceptance. Never retain tokens or subjects. */
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
import { runOperatorWorkerSmoke } from './operator-console-worker-smoke.mjs';
import { runOperatorRound4Smoke } from './operator-round4-smoke.mjs';
import { runApplicationGrantsSmoke } from './application-grants-smoke.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const web = resolve(root, 'apps/web');
const apiDirectory = resolve(root, 'apps/api');
const requireApi = createRequire(resolve(apiDirectory, 'package.json'));
const { Pool } = requireApi('pg');
const { EncryptJWT, SignJWT, generateKeyPair, exportJWK } = await import(pathToFileURL(requireApi.resolve('jose')).href);
const { migrationFiles } = await import(pathToFileURL(resolve(apiDirectory, 'dist/migration-files.js')).href);
const { manageOperatorRole } = await import(pathToFileURL(resolve(apiDirectory, 'dist/manage-operator.js')).href);
const { ApplicationStore } = await import(pathToFileURL(resolve(apiDirectory, 'dist/applications.js')).href);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for the isolated operator smoke');
const schema = `aladmin_${randomBytes(8).toString('hex')}`;
if (!/^aladmin_[a-f0-9]{16}$/.test(schema)) throw new Error('Invalid isolated schema');
const database = new URL(process.env.TEST_DATABASE_URL);
database.searchParams.set('options', `-c search_path=${schema}`);
const adminDatabase = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
const pool = new Pool({ connectionString: database.href, max: 5 });
const artifacts = resolve(root, 'artifacts/operator-console');
mkdirSync(artifacts, { recursive: true });
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirtyWorktree = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
const checks = [], children = [], contexts = [];
let issuerServer, browser, schemaCreated = false;
const key = randomBytes(32);
const actors = Object.fromEntries(['reviewer', 'reader', 'owner', 'suspended', 'fullOperator'].map(name => [name, {
  id: randomUUID(), subject: `private-subject-canary-${name}-${randomUUID()}`, sid: randomUUID(),
}]));
let issuer, apiOrigin, origin, app, selfApp, browserApp, reviewerToken, readerToken, ownerToken, operatorToken, workerSummary, roundFourSummary, grantsSummary;
const appName = 'Independent console review fixture';

async function freePort() {
  const listener = createServer();
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}
function start(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-12000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-12000); });
  child.on('error', () => {});
  child.output = () => output;
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null || child.signalCode) throw new Error('Fixture process exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
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
  try { await work(); checks.push({ name, result: 'PASS' }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, result: 'FAIL', error: error?.name ?? 'Error' }); throw error; }
}
async function api(path, token, options = {}) {
  return fetch(`${apiOrigin}${path}`, { ...options, headers: {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers,
  }, signal: AbortSignal.timeout(5000) });
}
async function json(path, token, status = 200, options) {
  const response = await api(path, token, options);
  assert.equal(response.status, status, `Unexpected status for ${path}`);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  return response.json();
}
function noPrivateValues(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const actor of Object.values(actors)) {
    assert(!text.includes(actor.subject), 'Provider subject reached console output');
    assert(!text.includes(actor.sid), 'IAM session identifier reached console output');
  }
  for (const token of [reviewerToken, readerToken, ownerToken, operatorToken]) if (token) assert(!text.includes(token), 'Bearer reached console output');
}
async function contextFor(token, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...options }); contexts.push(context);
  if (token) {
    const encrypted = await new EncryptJWT({ accessToken: token }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt().setExpirationTime('15m').encrypt(key);
    await context.addCookies([{ name: 'al-session', value: encrypted, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  }
  return context;
}

try {
  await adminDatabase.query(`CREATE SCHEMA ${schema}`); schemaCreated = true;
  for (const migration of migrationFiles) await pool.query(readFileSync(resolve(apiDirectory, 'migrations', migration), 'utf8'));
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'operator-fixture', alg: 'RS256', use: 'sig' };
  issuerServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/realms/accesslobby-first-party/.well-known/openid-configuration') return res.end(JSON.stringify({
      issuer, jwks_uri: `${issuer}/certs`, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`, end_session_endpoint: `${issuer}/logout`,
    }));
    if (req.url === '/realms/accesslobby-first-party/certs') return res.end(JSON.stringify({ keys: [jwk] }));
    res.statusCode = 404; res.end(JSON.stringify({ error: 'synthetic_endpoint_only' }));
  });
  issuerServer.listen(0, '127.0.0.1'); await once(issuerServer, 'listening');
  issuer = `http://127.0.0.1:${issuerServer.address().port}/realms/accesslobby-first-party`;
  const apiPort = await freePort(), webPort = await freePort();
  apiOrigin = `http://127.0.0.1:${apiPort}`; origin = `http://127.0.0.1:${webPort}`;
  const mint = async (actor, client = 'accesslobby-web', extra = {}) => new SignJWT({
    azp: client, sid: actor.sid, realm_access: { roles: ['admin', 'application_reviewer'] }, ...extra,
  }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setSubject(actor.subject)
    .setAudience('accesslobby-api').setIssuedAt().setExpirationTime('15m').sign(privateKey);
  for (const [name, actor] of Object.entries(actors)) {
    await pool.query('INSERT INTO persons(id,status) VALUES($1,$2)', [actor.id, name === 'suspended' ? 'suspended' : 'active']);
    await pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3)', [issuer, actor.subject, actor.id]);
  }
  const organizationId = randomUUID();
  await pool.query("INSERT INTO organizations(id,name,created_by) VALUES($1,'Console inspection organization',$2)", [organizationId, actors.owner.id]);
  await pool.query("INSERT INTO organization_memberships(organization_id,person_id,role,status) VALUES($1,$2,'owner','active')", [organizationId, actors.owner.id]);
  await manageOperatorRole(pool, actors.reviewer.id, 'grant', 'application_reviewer', 'console-fixture-reviewer');
  await manageOperatorRole(pool, actors.reader.id, 'grant', 'support_reader', 'console-fixture-reader');
  for (const role of ['identity_operator', 'application_reviewer', 'application_operator']) {
    await manageOperatorRole(pool, actors.fullOperator.id, 'grant', role, 'operator-worker-fixture-grant');
  }
  const applications = new ApplicationStore(pool, []);
  async function fixtureApp(owner, name, suffix) {
    const requested = await applications.request(owner, { clientId: `console-${suffix}-${randomUUID()}`, name,
      redirectUri: 'https://console-fixture.example.test/callback', logoutUri: 'https://console-fixture.example.test/',
      visibility: 'hidden', admission: 'grant_required' });
    // This explicitly synthetic prior-DNS fixture does not claim real DNS proof.
    await pool.query("UPDATE applications SET origin_verified_at=now(), origin_verified_host='_accesslobby-verify.console-fixture.example.test' WHERE id=$1", [requested.id]);
    return requested;
  }
  app = await fixtureApp(actors.owner.id, appName, 'http');
  selfApp = await fixtureApp(actors.reviewer.id, 'Self review must be refused', 'self');
  browserApp = await fixtureApp(actors.owner.id, 'Browser application review fixture', 'browser');
  reviewerToken = await mint(actors.reviewer); readerToken = await mint(actors.reader); ownerToken = await mint(actors.owner);
  operatorToken = await mint(actors.fullOperator);
  const apiChild = start(process.execPath, ['dist/main.js'], apiDirectory, { DATABASE_URL: database.href,
    OIDC_ISSUER: issuer, OIDC_API_AUDIENCE: 'accesslobby-api', ALLOWED_CLIENT_IDS: 'accesslobby-web,console-peer', PORT: String(apiPort), GIT_SHA: 'operator-console-fixture' });
  await ready(`${apiOrigin}/health/ready`, apiChild);
  await check('real API rejects absent, expired and tampered authentication', async () => {
    await json('/v1/admin/access', undefined, 401);
    const expired = await new SignJWT({ azp: 'accesslobby-web', sid: actors.reviewer.sid }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
      .setIssuer(issuer).setSubject(actors.reviewer.subject).setAudience('accesslobby-api').setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey);
    await json('/v1/admin/access', expired, 401);
    const pieces = reviewerToken.split('.'); pieces[2] = (pieces[2][0] === 'A' ? 'B' : 'A') + pieces[2].slice(1);
    await json('/v1/admin/access', pieces.join('.'), 401);
  });
  await check('organization/app ownership and token roles confer no platform authority', async () => {
    for (const path of ['/v1/admin/access', '/v1/admin/people', '/v1/admin/organizations', '/v1/admin/audit', '/v1/admin/applications', `/v1/admin/applications/${app.id}`]) {
      await json(path, ownerToken, 403);
    }
    await json(`/v1/admin/applications/${app.id}/review`, ownerToken, 403, { method: 'POST', body: JSON.stringify({ decision: 'approved' }) });
    await json('/v1/admin/access', await mint(actors.reviewer, 'console-peer'), 403);
    await json('/v1/admin/access', await mint(actors.suspended), 403);
  });
  await check('durable operator roles allow bounded inspection without provider/session disclosure', async () => {
    const access = await json('/v1/admin/access', reviewerToken);
    assert.equal(access.capabilities.reviewApplications, true);
    const readAccess = await json('/v1/admin/access', readerToken);
    assert.equal(readAccess.capabilities.reviewApplications, false);
    for (const path of ['/v1/admin/people', '/v1/admin/organizations', '/v1/admin/audit', '/v1/admin/applications', `/v1/admin/applications/${app.id}`]) noPrivateValues(await json(path, reviewerToken));
    const people = await json(`/v1/admin/people?q=${actors.owner.id}`, reviewerToken);
    assert.equal(people.people.length, 1); assert.equal(people.people[0].id, actors.owner.id);
    await json('/v1/admin/people?after=invalid', reviewerToken, 400);
    await json('/v1/admin/people?q=not-an-id', reviewerToken, 400);
    await json(`/v1/admin/applications/${randomUUID()}`, reviewerToken, 404);
    await json('/v1/admin/applications/not-an-id', reviewerToken, 404);
  });
  await check('independent review pins configuration and cannot activate a client', async () => {
    const detail = await json(`/v1/admin/applications/${app.id}`, reviewerToken);
    const body = { decision: 'approved', reference: 'console-http-review', configurationHash: detail.application.configurationHash };
    await json(`/v1/admin/applications/${app.id}/review`, readerToken, 403, { method: 'POST', body: JSON.stringify(body) });
    await json(`/v1/admin/applications/${app.id}/review`, reviewerToken, 400, { method: 'POST', body: JSON.stringify({ ...body, decision: 'activate' }) });
    await json(`/v1/admin/applications/${app.id}/review`, reviewerToken, 409, { method: 'POST', body: JSON.stringify({ ...body, configurationHash: '0'.repeat(64) }) });
    const own = await json(`/v1/admin/applications/${selfApp.id}`, reviewerToken);
    await json(`/v1/admin/applications/${selfApp.id}/review`, reviewerToken, 403, { method: 'POST', body: JSON.stringify({ ...body, configurationHash: own.application.configurationHash }) });
    await json(`/v1/admin/applications/${app.id}/review`, reviewerToken, 200, { method: 'POST', body: JSON.stringify(body) });
    await json(`/v1/admin/applications/${app.id}/review`, reviewerToken, 200, { method: 'POST', body: JSON.stringify(body) });
    const after = await json(`/v1/admin/applications/${app.id}`, reviewerToken);
    assert.equal(after.application.status, 'requested'); assert.equal(after.application.review.decision, 'approved');
    const count = await pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [app.id]);
    assert.equal(count.rows[0].count, 1);
    assert.equal((await api(`/v1/admin/applications/${app.id}/activate`, reviewerToken, { method: 'POST' })).status, 404);
  });
  await check('ended browser session cannot reuse an otherwise valid operator token', async () => {
    const session = { ...actors.reviewer, sid: randomUUID() };
    const endedToken = await mint(session);
    await json('/v1/admin/access', endedToken);
    await pool.query("INSERT INTO revoked_oidc_sessions(issuer,sid,expires_at) VALUES($1,$2,now()+interval '1 hour')", [issuer, session.sid]);
    await json('/v1/admin/access', endedToken, 401);
  });

  const standalone = resolve(web, '.next/standalone/apps/web');
  cpSync(resolve(web, 'public'), resolve(standalone, 'public'), { recursive: true });
  cpSync(resolve(web, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
  const webChild = start(process.execPath, [resolve(standalone, 'server.js')], root, { WEB_BASE_URL: origin, API_INTERNAL_URL: apiOrigin,
    OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'accesslobby-web', SESSION_SECRET: key.toString('base64url'), PUBLIC_REGISTRATION_ENABLED: 'false',
    NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(webPort), NEXT_TELEMETRY_DISABLED: '1' });
  await ready(`${origin}/manifest.webmanifest`, webChild);
  browser = await chromium.launch({ ...(process.env.UI_BROWSER_EXECUTABLE ? { executablePath: process.env.UI_BROWSER_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}) });
  const anonymous = await contextFor(); const anonymousPage = await anonymous.newPage();
  const routes = ['/admin', '/admin/people', '/admin/organizations', '/admin/applications', `/admin/applications/${browserApp.id}`, '/admin/audit'];
  await check('production console never discloses directory data without a session', async () => {
    for (const path of routes) {
      const response = await anonymousPage.goto(origin + path);
      assert.match(response.headers()['cache-control'] ?? '', /no-store/);
      await anonymousPage.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();
      noPrivateValues(await anonymousPage.content());
      assert(!(await anonymousPage.content()).includes(actors.owner.id));
    }
  });
  const ownerContext = await contextFor(ownerToken), ownerPage = await ownerContext.newPage();
  await check('production console denies an ordinary organization owner', async () => {
    await ownerPage.goto(`${origin}/admin/people`);
    await ownerPage.getByRole('heading', { name: /operator access|access restricted|access required|access denied/i }).waitFor();
    assert(!(await ownerPage.content()).includes(actors.reader.id));
  });
  const reviewerContext = await contextFor(reviewerToken), page = await reviewerContext.newPage(); page.setDefaultTimeout(10000);
  await check('operator console renders actual directory and reviewed app on narrow and wide screens', async () => {
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of routes) {
        await page.goto(origin + path);
        await page.locator('main h1, header h1').first().waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Console overflow at ${width}`);
        noPrivateValues(await page.content());
      }
      await page.goto(`${origin}/admin/applications/${app.id}`);
      await page.getByText('console-http-review', { exact: true }).waitFor();
      await page.screenshot({ path: resolve(artifacts, `review-${width}.png`), fullPage: true });
    }
    await page.goto(`${origin}/admin/people?q=${actors.owner.id}`);
    await page.getByText(actors.owner.id, { exact: true }).waitFor();
    assert.equal(await page.getByText(actors.reader.id, { exact: true }).count(), 0);
  });
  await check('native browser review is CSRF protected and recorded without activation', async () => {
    const detail = await json(`/v1/admin/applications/${browserApp.id}`, reviewerToken);
    const form = { applicationId: browserApp.id, decision: 'approved', reference: 'console-browser-review', configurationHash: detail.application.configurationHash };
    const before = await pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [browserApp.id]);
    const rejected = await reviewerContext.request.post(`${origin}/admin/action`, { form, headers: { origin: 'https://unrelated.example.test' }, maxRedirects: 0 });
    assert.equal(rejected.status(), 403);
    const unchanged = await pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [browserApp.id]);
    assert.equal(unchanged.rows[0].count, before.rows[0].count);
    await page.goto(`${origin}/admin/applications/${browserApp.id}`);
    await page.getByLabel(/review reference/i).fill('console-browser-review');
    await page.getByRole('button', { name: /approve/i }).click();
    const confirmation = page.getByRole('dialog');
    if (await confirmation.count()) await confirmation.getByRole('button', { name: 'Confirm change', exact: true }).click();
    await page.waitForURL('**/admin/applications/*?notice=*');
    await page.getByText('console-browser-review', { exact: true }).waitFor();
    const after = await json(`/v1/admin/applications/${browserApp.id}`, reviewerToken);
    assert.equal(after.application.review.decision, 'approved'); assert.equal(after.application.status, 'requested');
    noPrivateValues(await page.content());
  });
  workerSummary = await runOperatorWorkerSmoke({
    browser, origin, reviewerToken: operatorToken, ordinaryToken: ownerToken, organizationId, sessionKey: key,
    revokeReviewer: async () => {
      for (const role of ['identity_operator', 'application_reviewer', 'application_operator']) {
        await manageOperatorRole(pool, actors.fullOperator.id, 'revoke', role, 'operator-worker-fixture-revoke');
      }
    },
    restoreReviewer: async () => {
      for (const role of ['identity_operator', 'application_reviewer', 'application_operator']) {
        await manageOperatorRole(pool, actors.fullOperator.id, 'grant', role, 'operator-worker-fixture-restore');
      }
    },
    mintExpiredToken: async () => new SignJWT({ azp: 'accesslobby-web', sid: actors.fullOperator.sid })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setSubject(actors.fullOperator.subject)
      .setAudience('accesslobby-api').setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey),
    check, noPrivateValues,
  });

  roundFourSummary = await runOperatorRound4Smoke({ browser, pool, issuer, apiOrigin, origin, mint, contextFor, check, noPrivateValues });
  grantsSummary = await runApplicationGrantsSmoke({ browser, pool, issuer, apiOrigin, origin, mint, contextFor, check, noPrivateValues });

  await check('reader cannot submit reviews and operator revocation takes effect with the same bearer', async () => {
    const readerContext = await contextFor(readerToken), readerPage = await readerContext.newPage();
    await readerPage.goto(`${origin}/admin/applications/${selfApp.id}`);
    assert.equal(await readerPage.getByRole('button', { name: /approve/i }).count(), 0);
    await manageOperatorRole(pool, actors.reviewer.id, 'revoke', 'application_reviewer', 'console-fixture-revoke');
    await json('/v1/admin/access', reviewerToken, 403);
    await json('/v1/admin/people', reviewerToken, 403);
    await page.goto(`${origin}/admin/people`);
    await page.getByRole('heading', { name: /operator access|access restricted|access required|access denied/i }).waitFor();
    assert(!(await page.content()).includes(actors.owner.id));
  });
} catch (error) {
  if (!checks.some(check => check.result === 'FAIL')) checks.push({ name: 'fixture setup or cleanup', result: 'FAIL', error: error?.name ?? 'Error' });
  // Test diagnostics carry no response body, token, cookie, subject or session.
  console.error(`FAIL operator console qualification (${error?.name ?? 'Error'}): ${String(error?.message ?? 'unknown').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted-token]')}`);
  process.exitCode = 1;
} finally {
  await Promise.all(contexts.map(context => context.close().catch(() => {})));
  await browser?.close().catch(() => {});
  for (const child of [...children].reverse()) await stop(child);
  if (issuerServer) await new Promise(resolve => issuerServer.close(resolve));
  await pool.end();
  if (schemaCreated) await adminDatabase.query(`DROP SCHEMA ${schema} CASCADE`);
  await adminDatabase.end();
  writeFileSync(resolve(artifacts, 'report.json'), JSON.stringify({
    source, dirtyWorktree, observedAt: new Date().toISOString(),
    scope: 'synthetic OIDC issuer; real isolated PostgreSQL, compiled API and production Next browser',
    liveIam: 'NOT RUN', staging: 'NOT RUN', production: 'NOT RUN',
    result: process.exitCode ? 'FAIL' : 'PASS', checks, ...(workerSummary ? { workerSummary } : {}),
    ...(roundFourSummary ? { roundFourSummary } : {}),
    ...(grantsSummary ? { grantsSummary } : {}),
  }, null, 2) + '\n');
}
