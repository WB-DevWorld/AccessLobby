import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operatorRoles, withScopedClientToken } from './private-client-token.mjs';

const clientUuid = '11111111-1111-4111-8111-111111111111';
const accountUuid = '22222222-2222-4222-8222-222222222222';
function fixture(mode = 'pass') {
  const calls = []; let name, created = false;
  const fetcher = async (url, init = {}) => {
    const path = new URL(url).pathname; calls.push([path, init.method ?? 'GET']);
    assert.equal(init.redirect, 'error');
    if (path.endsWith('/clients') && init.method === 'POST') {
      const rep = JSON.parse(init.body); name = rep.clientId; created = true;
      assert.equal(rep.fullScopeAllowed, false);
      assert.equal(rep.publicClient, false);
      for (const field of ['standardFlowEnabled', 'implicitFlowEnabled', 'directAccessGrantsEnabled']) assert.equal(rep[field], false);
      assert.equal(rep.attributes['access.token.lifespan'], '90');
      if (mode === 'lost_creation') throw new Error('Lost creation response');
      return new Response(null, { status: 201, headers: { location: `http://iam:8080/admin/realms/accesslobby-first-party/clients/${clientUuid}` } });
    }
    if (path.endsWith('/clients') && new URL(url).searchParams.get('clientId') === 'realm-management') return Response.json([{ id: 'management' }]);
    if (path.endsWith('/clients')) return Response.json(created ? [{ id: clientUuid, clientId: name }] : []);
    if (path.includes('/roles/')) return Response.json({ id: path.split('/').at(-1), name: path.split('/').at(-1) });
    if (path.endsWith('/service-account-user')) return Response.json({ id: accountUuid });
    if (path.includes('/role-mappings/') || path.includes('/scope-mappings/')) {
      assert.equal(init.method, 'POST');
      assert.deepEqual(JSON.parse(init.body).map(role => role.name).sort(), [...operatorRoles].sort());
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/client-secret')) return Response.json({ value: 'private-secret' });
    if (path.endsWith('/token')) {
      assert.equal(init.body.get('grant_type'), 'client_credentials');
      assert.equal(init.body.get('client_secret'), 'private-secret');
      if (mode === 'mint_failure') return new Response(null, { status: 403 });
      return Response.json({ access_token: 'scoped-token', expires_in: mode === 'long_lived' ? 3600 : 90,
        ...(mode === 'refresh' ? { refresh_token: 'unexpected-refresh' } : {}) });
    }
    if (path.endsWith(`/clients/${clientUuid}`) && init.method === 'DELETE') return new Response(null, { status: mode === 'cleanup_failure' ? 503 : 204 });
    throw new Error(`Unexpected operator request ${path}`);
  };
  const verifyToken = async raw => {
    assert.equal(raw, 'scoped-token');
    return { azp: name, sub: accountUuid, resource_access: { 'realm-management': {
      roles: [...operatorRoles, ...(mode === 'broad_roles' ? ['manage-users'] : [])],
    } } };
  };
  return { calls, options: { base: 'http://iam:8080', issuer: 'https://iam.example.test/realms/accesslobby-first-party',
    adminToken: 'bootstrap-only', fetcher, verifyToken } };
}

test('scoped creation/read token reaches callback and its temporary client is removed', async () => {
  const f = fixture();
  const result = await withScopedClientToken(f.options, async token => { assert.equal(token, 'scoped-token'); return 'activated'; });
  assert.equal(result, 'activated');
  assert.deepEqual(f.calls.at(-1), [`/admin/realms/accesslobby-first-party/clients/${clientUuid}`, 'DELETE']);
});

for (const mode of ['lost_creation', 'mint_failure', 'long_lived', 'refresh', 'broad_roles']) {
  test(`${mode} never activates and cleans only the temporary client`, async () => {
    const f = fixture(mode); let used = false;
    await assert.rejects(withScopedClientToken(f.options, async () => { used = true; }));
    assert.equal(used, false);
    assert.deepEqual(f.calls.at(-1), [`/admin/realms/accesslobby-first-party/clients/${clientUuid}`, 'DELETE']);
  });
}

test('failed provisioning still removes the scoped credential', async () => {
  const f = fixture();
  await assert.rejects(withScopedClientToken(f.options, async () => { throw new Error('DNS proof missing'); }), /DNS proof missing/);
  assert.equal(f.calls.at(-1)[1], 'DELETE');
});

test('cleanup failure cannot report a successful completed operator pass', async () => {
  const f = fixture('cleanup_failure');
  await assert.rejects(withScopedClientToken(f.options, async () => 'activated'), /cleanup failed/);
});

test('public or changed IAM endpoints are refused before credential transport', async () => {
  for (const base of ['https://iam.example.test', 'http://iam:8080/path', 'http://iam:8080/?x=1']) {
    const f = fixture();
    await assert.rejects(withScopedClientToken({ ...f.options, base }, async () => {}), /Protected internal/);
    assert.equal(f.calls.length, 0);
  }
});
