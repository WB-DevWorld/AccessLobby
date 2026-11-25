import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApplicationAction } from '../lib/application-lifecycle-action';
import { applicationLifecycleContract, parseApplicationLifecycle, ownerApplicationState } from '../lib/application-lifecycle';

const origin = 'https://accesslobby.example.test';
const id = '18b72d01-8ac8-4afe-b75b-779c2ec09745';
const personId = 'c76d5f6b-f8f6-413b-b06b-19bfc95ff187';
const fields = { name: 'Lifecycle example', platform: 'web', redirectUri: 'https://example.test/callback', logoutUri: 'https://example.test/',
  backchannelLogoutUri: '', visibility: 'hidden', admission: 'grant_required' };
const command = { intent: 'edit', applicationId: id, expectedConfigurationHash: 'a'.repeat(64), reference: 'change-1234', ...fields };
const application = { id, clientId: 'lifecycle-example', ...fields, backchannelLogoutUri: null,
  status: 'cancelled', trustClass: 'unreviewed', configurationHash: 'b'.repeat(64), reviewDecision: null,
  originVerificationHost: '_accesslobby-verify.example.test', originVerificationValue: 'accesslobby-verify=proof', originVerifiedAt: null };
function request(value: URLSearchParams | string = new URLSearchParams(command), from = origin, contentType = 'application/x-www-form-urlencoded') {
  return new Request(origin + '/apps/action', { method: 'POST', headers: { origin: from, 'content-type': contentType }, body: value });
}
function success(status = 'requested') { return Response.json({ contract: applicationLifecycleContract, applicationId: id, status, configurationHash: 'b'.repeat(64), changed: true }); }

test('owner detail parser checks the versioned contract and strips undeclared identity/credential fields', () => {
  const parsed = parseApplicationLifecycle({ contract: applicationLifecycleContract, application: { ...application, subject: 'private-subject', accessToken: 'private-token' } });
  assert.equal(parsed?.status, 'cancelled'); assert.equal(parsed?.clientId, application.clientId);
  assert.equal('subject' in parsed!, false); assert.equal('accessToken' in parsed!, false);
  for (const replacement of [{ id: 'invalid' }, { status: 'deleted' }, { configurationHash: 'invalid' }, { platform: 'native' }, { reviewDecision: 'automatically-approved' }, { originVerifiedAt: 'bad-date' }]) {
    assert.equal(parseApplicationLifecycle({ contract: applicationLifecycleContract, application: { ...application, ...replacement } }), null);
  }
  assert.equal(parseApplicationLifecycle({ contract: 'wrong', application }), null);
  assert.equal(ownerApplicationState('cancelled'), 'Cancelled');
});

test('owner actions deny cross-origin and signed-out requests before making writes', async () => {
  let reads = 0, writes = 0;
  const deps = { hasSession: async () => { reads++; return true; }, api: async () => { writes++; return success(); } };
  assert.equal((await handleApplicationAction(request(undefined, 'https://other.example.test'), origin, deps)).status, 403);
  assert.equal(reads, 0); assert.equal(writes, 0);
  const signedOut = await handleApplicationAction(request(), origin, { ...deps, hasSession: async () => false });
  assert.equal(signedOut.status, 303); assert.equal(signedOut.headers.get('location'), origin + '/auth/login');
  assert.match(signedOut.headers.get('cache-control')!, /no-store/); assert.equal(writes, 0);
});

test('owner mutations bound streamed form bytes and reject duplicates, claimed authority and unsafe return paths', async () => {
  let writes = 0;
  const deps = { hasSession: async () => true, api: async () => { writes++; return success(); } };
  const duplicate = new URLSearchParams(command); duplicate.append('intent', 'cancel');
  const variants = [duplicate, new URLSearchParams({ ...command, ownerPersonId: personId }), new URLSearchParams({ ...command, clientId: 'change-client-id' }),
    new URLSearchParams({ ...command, role: 'administrator' }), new URLSearchParams({ ...command, returnTo: 'https://evil.example/' }),
    new URLSearchParams({ ...command, expectedConfigurationHash: 'bad-hash' }), new URLSearchParams({ ...command, reference: 'contains spaces' }),
    new URLSearchParams({ ...command, applicationId: '../../realm' }), 'x'.repeat(32769)];
  for (const value of variants) assert.equal((await handleApplicationAction(request(value), origin, deps)).status, 400);
  assert.equal((await handleApplicationAction(request(JSON.stringify(command), origin, 'application/json'), origin, deps)).status, 400);
  assert.equal(writes, 0);
});

test('authorized edit, cancellation and resubmission forward exact snapshots and use fixed owner destinations', async () => {
  const calls: Array<{ path: string; init: unknown }> = [];
  for (const intent of ['edit', 'cancel', 'resubmit']) {
    const body = intent === 'edit' ? { ...command, intent } : { intent, applicationId: id, expectedConfigurationHash: command.expectedConfigurationHash, reference: command.reference };
    const response = await handleApplicationAction(request(new URLSearchParams(body)), origin, { hasSession: async () => true,
      api: async (path, init) => { calls.push({ path, init }); return success(intent === 'cancel' ? 'cancelled' : 'requested'); } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `${origin}/apps/manage/${id}?notice=${intent === 'edit' ? 'edited' : intent === 'cancel' ? 'cancelled' : 'resubmitted'}`);
    assert.match(response.headers.get('cache-control')!, /private, no-store/);
  }
  assert.deepEqual(calls[0], { path: `/v1/applications/${id}`, init: { method: 'PATCH', body: {
    expectedConfigurationHash: command.expectedConfigurationHash, reference: command.reference, ...fields } } });
  assert.deepEqual(calls[1], { path: `/v1/applications/${id}/cancel`, init: { method: 'POST', body: {
    expectedConfigurationHash: command.expectedConfigurationHash, reference: command.reference } } });
  assert.equal(calls[2].path, `/v1/applications/${id}/resubmit`);
});

test('stale, revoked, malformed success and uncertain writes cannot produce a successful mutation notice', async () => {
  for (const api of [async () => Response.json({ error: 'stale_application_mutation' }, { status: 409 }),
    async () => Response.json({ error: 'Bearer-secret-must-not-reflect' }, { status: 503 }),
    async () => Response.json({ status: 'requested' }), async () => { throw new Error('private transport detail'); }]) {
    const response = await handleApplicationAction(request(), origin, { hasSession: async () => true, api });
    assert.equal(response.status, 303);
    assert(!response.headers.get('location')!.includes('notice=edited'));
    assert(!response.headers.get('location')!.includes('Bearer'));
  }
  const denied = await handleApplicationAction(request(), origin, { hasSession: async () => true, api: async () => new Response(null, { status: 403 }) });
  assert.equal(denied.status, 403);
  const expired = await handleApplicationAction(request(), origin, { hasSession: async () => true, api: async () => new Response(null, { status: 401 }) });
  assert.equal(expired.headers.get('location'), origin + '/auth/login');
});

test('an old exact mutation replay reports no new change even if the current application is now active', async () => {
  const cancel = { intent: 'cancel', applicationId: id, expectedConfigurationHash: command.expectedConfigurationHash, reference: 'original-cancel' };
  const response = await handleApplicationAction(request(new URLSearchParams(cancel)), origin, {
    hasSession: async () => true,
    api: async () => Response.json({ contract: applicationLifecycleContract, applicationId: id, status: 'active',
      configurationHash: 'c'.repeat(64), changed: false }),
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${origin}/apps/manage/${id}?notice=unchanged`);
  assert(!response.headers.get('location')!.includes('notice=cancelled'));
  const inconsistent = await handleApplicationAction(request(new URLSearchParams(cancel)), origin, {
    hasSession: async () => true,
    api: async () => Response.json({ contract: applicationLifecycleContract, applicationId: id, status: 'active',
      configurationHash: 'c'.repeat(64), changed: true }),
  });
  assert.equal(inconsistent.headers.get('location'), `${origin}/apps/manage/${id}?notice=identity_unavailable`);
});

test('legacy request, DNS verification, grant and revoke actions retain their established transport', async () => {
  const calls: Array<{ path: string; init: unknown }> = [];
  const deps = { hasSession: async () => true, api: async (path: string, init: { method: string; body?: object }) => { calls.push({ path, init }); return Response.json({ id }); } };
  const entries: Array<Record<string, string>> = [{ intent: 'request', clientId: 'new-app', ...fields }, { intent: 'verify', applicationId: id },
    { intent: 'grant', applicationId: id, personId }, { intent: 'revoke', applicationId: id, personId }];
  for (const entry of entries) {
    const response = await handleApplicationAction(request(new URLSearchParams(entry)), origin, deps);
    assert.equal(response.status, 303); assert(response.headers.get('location')!.startsWith(origin + '/apps/manage?notice='));
  }
  assert.deepEqual(calls, [
    { path: '/v1/applications', init: { method: 'POST', body: { name: fields.name, clientId: 'new-app', platform: 'web', redirectUri: fields.redirectUri,
      logoutUri: fields.logoutUri, backchannelLogoutUri: '', visibility: fields.visibility, admission: fields.admission } } },
    { path: `/v1/applications/${id}/verify-origin`, init: { method: 'POST' } },
    { path: `/v1/applications/${id}/grants`, init: { method: 'POST', body: { personId } } },
    { path: `/v1/applications/${id}/grants/${personId}`, init: { method: 'DELETE' } },
  ]);
});
