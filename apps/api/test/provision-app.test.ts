import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { ApplicationStore } from '../src/applications.js';
import { proofValue } from '../src/origin-proof.js';
import { matchesClient, provisionApp, reconcileClient, representation } from '../src/provision-app.js';

const row = { id: 'id', client_id: 'my-app', name: 'My app',
  redirect_uri: 'https://app.example.test/callback', logout_uri: 'https://app.example.test/',
  backchannel_logout_uri: 'https://app.example.test/backchannel-logout',
  status: 'requested', trust_class: 'unreviewed', owner_active: true,
  origin_challenge: 'challenge', origin_verified_at: null, origin_verified_host: null };

test('client readback must retain exact PKCE, callback and API audience', () => {
  const desired = representation(row);
  assert.equal(matchesClient(desired, desired, desired.protocolMappers), true);
  assert.equal(matchesClient({ ...desired, redirectUris: ['https://evil.example.test/callback'] }, desired, desired.protocolMappers), false);
  assert.equal(matchesClient({ ...desired, attributes: { ...desired.attributes, 'pkce.code.challenge.method': 'plain' } }, desired, desired.protocolMappers), false);
  assert.equal(matchesClient(desired, desired, []), false);
  assert.equal(matchesClient({ ...desired, directAccessGrantsEnabled: true }, desired, desired.protocolMappers), false);
  assert.equal(desired.attributes['backchannel.logout.url'], 'https://app.example.test/backchannel-logout');
  assert.equal(desired.attributes['backchannel.logout.session.required'], 'true');
  assert.equal(matchesClient({ ...desired, attributes: { ...desired.attributes, 'backchannel.logout.url': 'https://evil.example.test/logout' } }, desired, desired.protocolMappers), false);
  assert.equal(matchesClient({ ...desired, attributes: { ...desired.attributes, 'backchannel.logout.session.required': 'false' } }, desired, desired.protocolMappers), false);
});

test('stored backchannel must stay on the callback origin', () => {
  assert.throws(() => representation({ ...row, backchannel_logout_uri: 'https://elsewhere.example.test/logout' }),
    /Stored backchannel origin mismatch/);
  const without = representation({ ...row, backchannel_logout_uri: null });
  assert.equal(without.attributes['backchannel.logout.url'], undefined);
  assert.equal(matchesClient({ ...without, attributes: { ...without.attributes, 'backchannel.logout.url': 'https://unexpected.example.test/logout' } },
    without, without.protocolMappers), false);
});

test('private reconciler creates once and reads back exact client before accepting it', async () => {
  const wanted = representation(row);
  const base = 'http://iam:8080/admin/realms/accesslobby-first-party/clients';
  let finds = 0, creates = 0;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.headers && (init.headers as Record<string, string>).authorization, 'Bearer scoped-token');
    if (String(url) === `${base}?clientId=my-app`) return Response.json(finds++ ? [{ id: 'kc-id', clientId: 'my-app' }] : []);
    if (String(url) === base && init?.method === 'POST') {
      creates++;
      assert.deepEqual(JSON.parse(String(init.body)), wanted);
      return new Response(null, { status: 201 });
    }
    if (String(url) === `${base}/kc-id`) return Response.json({ ...wanted, id: 'kc-id' });
    if (String(url) === `${base}/kc-id/protocol-mappers/models`) return Response.json(wanted.protocolMappers);
    throw new Error(`Unexpected IAM URL ${url}`);
  }) as typeof fetch;
  await reconcileClient('http://iam:8080', 'accesslobby-first-party', 'scoped-token', wanted, fakeFetch);
  assert.equal(creates, 1);
  await reconcileClient('http://iam:8080', 'accesslobby-first-party', 'scoped-token', wanted, fakeFetch);
  assert.equal(creates, 1); // Retry reads the already registered client.
});

test('private reconciler rejects a conflicting existing client', async () => {
  const wanted = representation(row);
  let mutation = false;
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') mutation = true;
    if (String(url).endsWith('?clientId=my-app')) return Response.json([{ id: 'kc-id', clientId: 'my-app' }]);
    if (String(url).endsWith('/kc-id')) return Response.json({ ...wanted, id: 'kc-id',
      attributes: { ...wanted.attributes, 'backchannel.logout.url': 'https://elsewhere.example.test/logout' } });
    if (String(url).endsWith('/kc-id/protocol-mappers/models')) return Response.json(wanted.protocolMappers);
    throw new Error(`Unexpected IAM URL ${url}`);
  }) as typeof fetch;
  await assert.rejects(reconcileClient('http://iam:8080', 'accesslobby-first-party', 'scoped-token', wanted, fakeFetch),
    /differs from approved configuration/);
  assert.equal(mutation, false);
});

test('private activation joins DNS proof, IAM readback and registry admission',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const owner = randomUUID();
    const clientId = `activation-${randomUUID()}`;
    let challenge = '', published = true, iamCalls = 0, mismatch = true;
    let registered: ReturnType<typeof representation> | undefined;
    const lookupTxt = async (host: string) => {
      assert.equal(host, '_accesslobby-verify.activation.example.test');
      return published ? [[proofValue(challenge)]] : [];
    };
    const apps = new ApplicationStore(pool, [], lookupTxt);
    const base = 'http://iam:8080/admin/realms/accesslobby-first-party/clients';
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      iamCalls++;
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer scoped-token');
      if (String(url) === `${base}?clientId=${encodeURIComponent(clientId)}`) {
        return Response.json(registered ? [{ id: 'kc-id', clientId }] : []);
      }
      if (String(url) === base && init?.method === 'POST') {
        registered = JSON.parse(String(init.body)) as ReturnType<typeof representation>;
        return new Response(null, { status: 201 });
      }
      if (String(url) === `${base}/kc-id`) return Response.json({ ...registered, id: 'kc-id',
        redirectUris: mismatch ? ['https://wrong.example.test/callback'] : registered?.redirectUris });
      if (String(url) === `${base}/kc-id/protocol-mappers/models`) return Response.json(registered?.protocolMappers);
      throw new Error(`Unexpected IAM URL ${url}`);
    }) as typeof fetch;
    const options = { issuer: 'https://iam.example.test/realms/accesslobby-first-party',
      token: 'scoped-token', base: 'http://iam:8080', lookupTxt, fetcher: fakeFetch };
    try {
      await pool.query("INSERT INTO persons(id,status) VALUES ($1,'active')", [owner]);
      const app = await apps.request(owner, { clientId, name: 'Activation test',
        redirectUri: 'https://activation.example.test/callback', logoutUri: 'https://activation.example.test/',
        visibility: 'discoverable', admission: 'authenticated_open' });
      challenge = app.originVerificationValue.slice('accesslobby-verify='.length);
      const plan = await provisionApp(pool, app.id, '--plan', undefined, options);
      assert.equal(plan.state, 'plan-only');
      assert.equal(plan.client.clientId, clientId);
      assert.equal(await apps.allowedClient(clientId), false);
      await apps.verifyOrigin(owner, app.id);
      published = false;
      await assert.rejects(provisionApp(pool, app.id, '--activate-first-party', 'review-1234', options),
        /Current DNS origin proof required/);
      assert.equal(iamCalls, 0);
      published = true;
      await assert.rejects(provisionApp(pool, app.id, '--activate-first-party', 'review-1234', options),
        /differs from approved configuration/);
      assert.equal(await apps.allowedClient(clientId), false);
      mismatch = false;
      assert.deepEqual(await provisionApp(pool, app.id, '--activate-first-party', 'review-1234', options),
        { applicationId: app.id, status: 'active', clientId });
      assert.equal(await apps.allowedClient(clientId), true);
      const state = await pool.query('SELECT status, trust_class, review_reference FROM applications WHERE id = $1', [app.id]);
      assert.deepEqual(state.rows[0], { status: 'active', trust_class: 'first_party', review_reference: 'review-1234' });
      const events = await pool.query<{ action: string }>(
        'SELECT action FROM application_events WHERE application_id = $1 ORDER BY id', [app.id]);
      assert.deepEqual(events.rows.map(item => item.action),
        ['application.requested', 'application.origin_verified', 'application.activated']);
      await assert.rejects(provisionApp(pool, app.id, '--activate-first-party', 'review-1234', options),
        /Only requested applications/);
    } finally { await pool.end(); }
  });
