import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApplicationSuspension } from '../lib/application-suspension-action';
import { applicationSuspensionContract, parseApplicationSuspensionDetail } from '../lib/application-suspension-model';
import { adminContract, type AdminAccess } from '../lib/admin-model';

const id = '18b72d01-8ac8-4afe-b75b-779c2ec09745', origin = 'https://accesslobby.example.test', clientId = 'suspension-fixture';
const access: AdminAccess = { contract: adminContract, roles: ['application_operator'], capabilities: {
  read: true, reviewApplications: false, managePeople: false, activateApplications: true,
} };
const fields = { intent: 'suspend', expectedStatus: 'active', expectedVersion: '0', confirmationClientId: clientId, reference: 'issue:76-fixture' };
const app = { id, clientId, name: 'Fixture application', status: 'active', trustClass: 'first_party', version: '0', suspendedAt: null, suspensionReference: null };
const completed = { contract: applicationSuspensionContract, application: { ...app, status: 'suspended', version: '1',
  suspendedAt: '2026-11-25T19:00:00Z', suspensionReference: fields.reference }, canSuspend: false, changed: true };
function request(body: BodyInit = new URLSearchParams(fields), from = origin) {
  return new Request(origin + `/admin/applications/${id}/suspension/action`, { method: 'POST', headers: {
    origin: from, 'content-type': 'application/x-www-form-urlencoded',
  }, body });
}
const dependencies = { getAccess: async () => ({ state: 'ready' as const, access }), api: async () => Response.json(completed) };

test('suspension parser retains only bounded registry metadata and truthfully derives eligibility', () => {
  assert.deepEqual(parseApplicationSuspensionDetail({ contract: applicationSuspensionContract,
    application: { ...app, token: 'private-canary', suspended_by: id }, canSuspend: true }), { application: app, canSuspend: true });
  for (const override of [{ version: '00' }, { version: 1 }, { status: 'deleted' }, { trustClass: 'unknown' },
    { name: 'x'.repeat(121) }, { suspendedAt: 'not-a-date' }, { suspensionReference: 'unsafe free text' }]) {
    assert.equal(parseApplicationSuspensionDetail({ contract: applicationSuspensionContract, application: { ...app, ...override }, canSuspend: true }), null);
  }
  assert.deepEqual(parseApplicationSuspensionDetail({ contract: applicationSuspensionContract, application: app, canSuspend: false }), { application: app, canSuspend: false });
  assert.equal(parseApplicationSuspensionDetail({ contract: applicationSuspensionContract, application: { ...app, clientId: 'accesslobby-web' }, canSuspend: true }), null);
  assert.equal(parseApplicationSuspensionDetail({ contract: 'unexpected', application: app, canSuspend: true }), null);
});

test('suspension action rejects cross-origin, absent and revoked capability before forwarding', async () => {
  let reads = 0, writes = 0;
  const counted = { getAccess: async () => { reads++; return { state: 'ready' as const, access }; }, api: async () => { writes++; return Response.json(completed); } };
  assert.equal((await handleApplicationSuspension(request(undefined, 'https://other.example'), origin, id, counted)).status, 403);
  assert.equal(reads, 0);
  const readOnly: AdminAccess = { ...access, roles: ['application_reviewer'], capabilities: { ...access.capabilities, activateApplications: false } };
  assert.equal((await handleApplicationSuspension(request(), origin, id, { ...counted, getAccess: async () => ({ state: 'ready', access: readOnly }) })).status, 403);
  assert.equal((await handleApplicationSuspension(request(), origin, id, { ...counted, getAccess: async () => ({ state: 'forbidden' }) })).status, 403);
  assert.equal(writes, 0);
  assert.equal((await handleApplicationSuspension(request(), origin, id, { ...counted, getAccess: async () => ({ state: 'signed-out' }) })).headers.get('location'), origin + '/auth/login');
});

test('native form rejects duplicates, extra authority/return fields, invalid versions and oversized bodies', async () => {
  let writes = 0;
  const duplicate = new URLSearchParams(fields); duplicate.append('confirmationClientId', 'substituted-client');
  const deps = { ...dependencies, api: async () => { writes++; return Response.json(completed); } };
  for (const body of [duplicate, new URLSearchParams({ ...fields, returnTo: 'https://evil.example' }),
    new URLSearchParams({ ...fields, role: 'application_operator' }), new URLSearchParams({ ...fields, expectedVersion: '-1' }),
    new URLSearchParams({ ...fields, expectedStatus: 'suspended' }), new URLSearchParams({ ...fields, reference: 'x'.repeat(4097) }),
    new URLSearchParams({ ...fields, confirmationClientId: 'unsafe client' })]) {
    assert.equal((await handleApplicationSuspension(request(body), origin, id, deps)).status, 400);
  }
  assert.equal(writes, 0);
});

test('suspension action forwards exact target/version/reference and distinguishes successful retry', async () => {
  const calls: unknown[] = [];
  const response = await handleApplicationSuspension(request(), origin, id, { ...dependencies, api: async (path, init) => {
    calls.push({ path, init }); return Response.json(completed);
  } });
  assert.equal(response.status, 303); assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.equal(response.headers.get('location'), origin + `/admin/applications/${id}/suspension?notice=suspended`);
  assert.deepEqual(calls, [{ path: `/v1/admin/applications/${id}/suspension`, init: { method: 'POST', body: {
    expectedStatus: 'active', expectedVersion: '0', confirmationClientId: clientId, reference: fields.reference,
  } } }]);
  const retried = await handleApplicationSuspension(request(), origin, id, { ...dependencies, api: async () => Response.json({ ...completed, changed: false }) });
  assert.match(retried.headers.get('location')!, /notice=unchanged$/);
});

test('stale, protected and revoked results remain explicit and unknown errors never expose service text', async () => {
  for (const [status, error] of [[409, 'stale_application_suspension'], [409, 'suspension_confirmation_mismatch'], [403, 'protected_application']] as const) {
    const result = await handleApplicationSuspension(request(), origin, id, { ...dependencies, api: async () => Response.json({ error }, { status }) });
    assert.match(result.headers.get('location')!, new RegExp(`notice=${error}$`));
  }
  assert.equal((await handleApplicationSuspension(request(), origin, id, { ...dependencies, api: async () => Response.json({ error: 'operator_access_denied' }, { status: 403 }) })).status, 403);
  const unknown = await handleApplicationSuspension(request(), origin, id, { ...dependencies, api: async () => Response.json({ error: 'private-service-canary' }, { status: 500 }) });
  assert.match(unknown.headers.get('location')!, /notice=unavailable$/);
  assert(!unknown.headers.get('location')!.includes('canary'));
});

test('success requires the current suspended target, exact resulting version and original reference', async () => {
  for (const override of [{ status: 'active' }, { version: '3' }, { id: '1d75e22b-cadb-4192-955a-bbd79b226156' },
    { clientId: 'another-client' }, { suspensionReference: 'issue:76-other-command' }]) {
    const result = await handleApplicationSuspension(request(), origin, id, { ...dependencies,
      api: async () => Response.json({ ...completed, application: { ...completed.application, ...override } }) });
    assert.match(result.headers.get('location')!, /notice=unavailable$/);
  }
  const lost = await handleApplicationSuspension(request(), origin, id, { ...dependencies, api: async () => { throw new Error('private-error-canary'); } });
  assert.match(lost.headers.get('location')!, /notice=unavailable$/);
});
