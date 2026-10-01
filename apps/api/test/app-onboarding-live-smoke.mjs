/** CI only: real disposable IAM + PostgreSQL + API; DNS/review are explicit fixtures. */
import assert from 'node:assert/strict';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ApplicationStore } from '../dist/applications.js';
import { provisionApp, reconcileClient } from '../dist/provision-app.js';
import { suspendRegistry, disableIamClient } from '../dist/suspend-app.js';
import { loadAppEntry, AppEntryError } from '../../../examples/reference-consumer/app-entry.mjs';
import { mayViewPrivate } from '../../../examples/reference-consumer/policy.mjs';
import { qualifyEnbenPeer } from './enben-live-peer.mjs';
import { withScopedClientToken } from '../../../infra/scripts/private-client-token.mjs';

const databaseUrl = 'postgres://accesslobby:test-only-password@127.0.0.1:5432/accesslobby_iam_lifecycle';
if (process.env.CI !== 'true' || process.env.IAM_LIFECYCLE_DATABASE_URL !== databaseUrl || !process.env.IAM_SMOKE_TOKEN) {
  throw new Error('This test requires its dedicated disposable CI database and IAM token');
}
const base = 'http://127.0.0.1:8080';
const issuer = 'http://localhost:8080/realms/accesslobby-first-party';
const apiOrigin = 'http://127.0.0.1:13001';
const adminToken = process.env.IAM_SMOKE_TOKEN;
const adminPath = `${base}/admin/realms/accesslobby-first-party`;
const pool = new Pool({ connectionString: databaseUrl });
const keys = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`));
const proofs = new Map();
const apps = new ApplicationStore(pool, ['accesslobby-web'], async host => proofs.get(host) ?? []);
const options = { issuer, base, token: adminToken, lookupTxt: async host => proofs.get(host) ?? [] };
const password = randomBytes(24).toString('base64url');
const users = [];
let browser, server;
let serverExited;

async function admin(path, init = {}) {
  const response = await fetch(`${adminPath}${path}`, { ...init, headers: {
    authorization: `Bearer ${adminToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}),
  }, signal: AbortSignal.timeout(8000) });
  assert.ok(response.ok, `Disposable IAM operation failed (${response.status})`);
  return response;
}

async function login(clientId, redirectUri, username) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const auth = new URL(`${issuer}/protocol/openid-connect/auth`);
  auth.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid profile email', state, nonce, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    let callback;
    // Capture IAM's actual redirect before Chromium follows it. Routing only the
    // destination does not intercept a redirect chain's later requests.
    await context.route(url => url.origin === new URL(issuer).origin && url.pathname.endsWith('/login-actions/authenticate'), async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch({ maxRedirects: 0, timeout: 8000 });
      const location = response.headers().location;
      if (location) {
        const next = new URL(location, issuer);
        if (next.origin === new URL(redirectUri).origin && next.pathname === new URL(redirectUri).pathname) {
          assert.ok([302, 303].includes(response.status()), 'IAM callback must be a redirect');
          callback = next;
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>CI callback captured</p>' });
        }
      }
      return route.fulfill({ response });
    });
    await page.goto(auth.href);
    await page.locator('input[name="username"]').fill(username);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('#kc-login').click();
    assert.ok(callback, 'IAM must redirect to the exact registered callback');
    assert.equal(callback.searchParams.get('state'), state);
    assert.ok(callback.searchParams.get('code'), 'Authorization code required');
    const exchange = await fetch(`${issuer}/protocol/openid-connect/token`, { method: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
        redirect_uri: redirectUri, code: callback.searchParams.get('code'), code_verifier: verifier }),
      signal: AbortSignal.timeout(8000) });
    assert.equal(exchange.status, 200, 'Code + PKCE exchange must succeed');
    const tokens = await exchange.json();
    assert.equal(typeof tokens.access_token, 'string');
    const { payload } = await jwtVerify(tokens.id_token, keys, { issuer, audience: clientId, algorithms: ['RS256'] });
    assert.equal(payload.nonce, nonce);
    return tokens.access_token;
  } finally { await context.close(); }
}

async function api(path, accessToken, status, body, method = 'GET') {
  const response = await fetch(`${apiOrigin}${path}`, { method, headers: {
    authorization: `Bearer ${accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000) });
  assert.equal(response.status, status, `${method} ${path.split('/').slice(0, 3).join('/')} status`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}

async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) server.kill('SIGTERM');
  if (serverExited) {
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    try { await serverExited; } finally { clearTimeout(timer); }
  }
}

try {
  browser = await chromium.launch();
  server = spawn(process.execPath, ['apps/api/dist/main.js'], { cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: 'test',
    DATABASE_URL: databaseUrl, OIDC_ISSUER: issuer, OIDC_API_AUDIENCE: 'accesslobby-api',
    ALLOWED_CLIENT_IDS: 'accesslobby-web', PORT: '13001', GIT_SHA: 'ci-onboarding-fixture',
  }, stdio: ['ignore', 'ignore', 'pipe'] });
  // Failure output is deliberately categorical; never dump token-bearing HTTP bodies.
  server.stderr.on('data', () => {});
  serverExited = once(server, 'exit');
  server.on('error', () => {});
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null) throw new Error('Disposable API exited before readiness');
    try { ready = (await fetch(`${apiOrigin}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Disposable API must become ready');

  await withScopedClientToken({ base, issuer, adminToken }, async token => {
    const forbidden = await fetch(`${adminPath}/users`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(forbidden.status, 403, 'Scoped provisioner must not read or manage human users');
    const clientId = `ci-scoped-client-${randomUUID()}`;
    const desired = { clientId, enabled: true, protocol: 'openid-connect', publicClient: true,
      standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false, redirectUris: ['https://ci-scope.example.test/callback'],
      webOrigins: ['https://ci-scope.example.test'], attributes: {
        'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': 'https://ci-scope.example.test/',
      }, protocolMappers: [{ name: 'accesslobby-api-audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
        config: { 'included.client.audience': 'accesslobby-api', 'access.token.claim': 'true', 'id.token.claim': 'false' } }],
    };
    try { await reconcileClient(base, 'accesslobby-first-party', token, desired); }
    finally {
      const clients = await (await admin(`/clients?clientId=${clientId}`)).json();
      for (const client of clients.filter(value => value.clientId === clientId)) await admin(`/clients/${client.id}`, { method: 'DELETE' });
    }
  });
  const leftover = await (await admin('/clients')).json();
  assert.equal(leftover.some(client => client.clientId.startsWith('accesslobby-private-provision-')), false);
  console.info('SCOPED_CLIENT_PROVISIONER_PASS create-read-only no-human-access temporary-client-cleanup');

  for (let index = 0; index < 2; index++) {
    const username = `ci-onboarding-${randomUUID()}`;
    const created = await admin('/users', { method: 'POST', body: JSON.stringify({ username, enabled: true,
      email: `${username}@example.test`, emailVerified: true, firstName: 'CI', lastName: 'Fixture',
      credentials: [{ type: 'password', value: password, temporary: false }], requiredActions: [],
    }) });
    const id = created.headers.get('location')?.split('/').at(-1);
    assert.ok(id, 'Disposable user creation must return a location');
    users.push({ username, id });
  }
  const webTokens = await Promise.all(users.map(user => login('accesslobby-web', 'http://localhost:3000/auth/callback', user.username)));
  const people = await Promise.all(webTokens.map(token => api('/v1/me', token, 200)));
  const [owner, visitor] = people.map(result => result.person.id);
  assert.notEqual(owner, visitor, 'Two humans must resolve to distinct durable people');
  assert.equal((await api('/v1/me', webTokens[0], 200)).person.id, owner);
  console.info('APP_ONBOARDING_PASS real-IAM-code-PKCE nonce JWKS stable-two-person-identity');

  const fixtures = [];
  for (const admission of ['authenticated_open', 'grant_required']) {
    const clientId = `ci-${admission}-${randomUUID()}`;
    const origin = `https://ci-${admission.replaceAll('_', '-')}.example.test`;
    const requested = await api('/v1/applications', webTokens[0], 201, { clientId, name: `CI ${admission}`,
      redirectUri: `${origin}/callback`, logoutUri: `${origin}/`, backchannelLogoutUri: `${origin}/backchannel-logout`,
      visibility: admission === 'authenticated_open' ? 'discoverable' : 'hidden', admission,
    }, 'POST');
    assert.equal(requested.status, 'requested');
    assert.equal(await apps.allowedClient(clientId), false);
    await assert.rejects(provisionApp(pool, requested.id, '--activate-first-party', 'ci-review-fixture', options), /Current DNS origin proof/);
    assert.equal((await (await admin(`/clients?clientId=${clientId}`)).json()).length, 0);
    const plan = await provisionApp(pool, requested.id, '--plan', undefined, options);
    assert.equal(plan.state, 'plan-only');
    await assert.rejects(apps.verifyOrigin(visitor, requested.id), error => error.code === 'application_not_found');
    await assert.rejects(apps.verifyOrigin(owner, requested.id), error => error.code === 'origin_proof_missing');
    proofs.set(requested.originVerificationHost, [[requested.originVerificationValue]]);
    await apps.verifyOrigin(owner, requested.id);
    proofs.delete(requested.originVerificationHost);
    await assert.rejects(provisionApp(pool, requested.id, '--activate-first-party', 'ci-review-fixture', options), /Current DNS origin proof/);
    proofs.set(requested.originVerificationHost, [[requested.originVerificationValue]]);
    await assert.rejects(provisionApp(pool, requested.id, '--activate-first-party', undefined, options), /review reference/);
    await provisionApp(pool, requested.id, '--activate-first-party', 'ci-review-fixture', options);
    await reconcileClient(base, 'accesslobby-first-party', adminToken, plan.client);
    await assert.rejects(reconcileClient(base, 'accesslobby-first-party', adminToken,
      { ...plan.client, redirectUris: [`${origin}/unapproved`] }), /differs from approved configuration/);
    const tokens = await Promise.all(users.map(user => login(clientId, `${origin}/callback`, user.username)));
    fixtures.push({ ...requested, redirectUri: `${origin}/callback`, tokens });
  }
  console.info('APP_ONBOARDING_PASS requested-denied DNS-fixture-recheck review-fixture exact-live-IAM-readback retry conflict');

  const [open, restricted] = fixtures;
  await qualifyEnbenPeer({ browser, issuer, apiOrigin, application: open, users, password });
  for (const [index, token] of open.tokens.entries()) {
    assert.equal((await api('/v1/me', token, 200)).person.id, people[index].person.id);
    const entry = await api('/v1/application-entry', token, 200);
    assert.equal(entry.applicationId, open.id);
    assert.equal(entry.clientId, open.clientId);
    assert.equal(entry.admitted, true);
  }
  assert.equal(Number((await pool.query('SELECT count(*) FROM application_grants WHERE application_id = $1', [open.id])).rows[0].count), 0);
  assert.equal(mayViewPrivate(visitor, new Set()), false, 'App entry must not grant peer-local resource permission');
  const organization = await api('/v1/organizations', webTokens[0], 201, { name: 'CI admission boundary' }, 'POST');
  const invitation = await api(`/v1/organizations/${organization.id}/invitations`, webTokens[0], 201,
    { personId: visitor, role: 'administrator' }, 'POST');
  await api(`/v1/invitations/${invitation.id}/respond`, webTokens[1], 201, { decision: 'accept' }, 'POST');
  const memberships = await api('/v1/my-organizations', restricted.tokens[1], 200);
  assert.ok(memberships.organizations.some(item => item.id === organization.id && item.role === 'administrator'));
  // Even an administrator in the owner's organization needs the independent app grant.
  const denied = await api('/v1/application-entry', restricted.tokens[1], 403);
  assert.equal(denied.error, 'application_entry_denied');
  assert.equal((await api(`/v1/applications/${restricted.id}/grants`, webTokens[1], 404, { personId: visitor }, 'POST')).error, 'application_not_found');
  assert.equal((await api(`/v1/applications/${restricted.id}/grants`, restricted.tokens[0], 403, { personId: visitor }, 'POST')).error, 'first_party_only');
  assert.ok(!(await api('/v1/applications/visible', webTokens[1], 200)).applications.some(item => item.id === restricted.id));
  await api(`/v1/applications/${restricted.id}/grants`, webTokens[0], 201, { personId: visitor }, 'POST');
  assert.ok((await api('/v1/applications/visible', webTokens[1], 200)).applications.some(item => item.id === restricted.id));
  assert.equal(await loadAppEntry(apiOrigin, { accessToken: restricted.tokens[1] }, restricted.clientId), restricted.id);
  await pool.query("UPDATE application_grants SET expires_at = now() - interval '1 second' WHERE application_id = $1", [restricted.id]);
  assert.equal((await api('/v1/application-entry', restricted.tokens[1], 403)).error, 'application_entry_denied');
  await api(`/v1/applications/${restricted.id}/grants`, webTokens[0], 201, { personId: visitor }, 'POST');
  await api(`/v1/applications/${restricted.id}/grants/${visitor}`, webTokens[0], 200, undefined, 'DELETE');
  await assert.rejects(loadAppEntry(apiOrigin, { accessToken: restricted.tokens[1] }, restricted.clientId),
    error => error instanceof AppEntryError && error.status === 403);
  assert.ok(!(await api('/v1/applications/visible', webTokens[1], 200)).applications.some(item => item.id === restricted.id));
  assert.equal(mayViewPrivate(visitor, new Set([visitor])), true, 'Independent local policy remains intact after app revoke');
  await pool.query("UPDATE persons SET status = 'suspended' WHERE id = $1", [visitor]);
  assert.equal((await api('/v1/application-entry', open.tokens[1], 403)).error, 'identity_suspended');
  await pool.query("UPDATE persons SET status = 'active' WHERE id = $1", [visitor]);
  console.info('APP_ONBOARDING_PASS open-two-people no-grant-list restricted-deny grant expiry revoke hidden-visibility owner-boundary peer-mutation-denied suspended-person membership-and-peer-policy-separation');

  await suspendRegistry(pool, open.id, 'ci-suspension-fixture');
  await api('/v1/application-entry', open.tokens[0], 401); // Already issued, valid IAM token is refused by registry.
  const legacyOverride = new ApplicationStore(pool, [open.clientId]);
  assert.equal(await legacyOverride.allowedClient(open.clientId), false);
  await assert.rejects(disableIamClient(base, 'accesslobby-first-party', adminToken, open.clientId,
    async () => { throw new Error('CI IAM transport outage'); }), /CI IAM transport outage/);
  await api('/v1/application-entry', open.tokens[0], 401);
  const client = (await (await admin(`/clients?clientId=${open.clientId}`)).json())[0];
  assert.equal((await (await admin(`/clients/${client.id}`)).json()).enabled, true);
  await suspendRegistry(pool, open.id, 'ci-suspension-fixture');
  assert.equal(await disableIamClient(base, 'accesslobby-first-party', adminToken, open.clientId), 'disabled');
  assert.equal(await disableIamClient(base, 'accesslobby-first-party', adminToken, open.clientId), 'disabled');
  assert.equal((await (await admin(`/clients/${client.id}`)).json()).enabled, false);
  await api('/v1/application-entry', open.tokens[0], 401);
  console.info('APP_ONBOARDING_PASS registry-first old-token-denied legacy-no-bypass IAM-outage-denied disable-readback retry');

  await stopServer();
  await assert.rejects(loadAppEntry(apiOrigin, { accessToken: restricted.tokens[1] }, restricted.clientId),
    error => error instanceof AppEntryError && error.status === 503);
  console.info('APP_ONBOARDING_LIVE_SMOKE_PASS entry-transport-outage-fails-closed');
} finally {
  await browser?.close();
  await stopServer();
  await pool.end();
  // Fixtures live only in this job's disposable realm/database; no staging cleanup is performed.
}
