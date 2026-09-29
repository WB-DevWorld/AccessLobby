import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesClient, reconcileClient, representation } from '../src/provision-app.js';

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
