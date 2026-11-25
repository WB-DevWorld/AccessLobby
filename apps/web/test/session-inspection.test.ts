import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adminContract, type AdminAccess } from '../lib/admin-model';
import { parseSessionInspection } from '../lib/session-inspection-model';
import { handleSessionEnd } from '../lib/session-inspection-action';

const person = '18b72d01-8ac8-4afe-b75b-779c2ec09745', handle = '58b72d01-8ac8-4afe-b75b-779c2ec09745', origin = 'https://accesslobby.example.test';
const access: AdminAccess = { contract: adminContract, roles: ['identity_operator'], capabilities: { read: true, reviewApplications: false, managePeople: true, activateApplications: false } };
const fields = { intent: 'end-association', handle, expectedState: 'a'.repeat(64), reference: 'session-review-1234' };
const request = (body = new URLSearchParams(fields), from = origin) => new Request(`${origin}/admin/people/${person}/sessions/action`, {
  method: 'POST', headers: { origin: from, 'content-type': 'application/x-www-form-urlencoded' }, body,
});

test('session inspection parser retains bounded facts without private provider or capability values', () => {
  const item = { handle, clientId: 'fixture-app', applicationName: null, createdAt: '2026-11-25T20:00:00Z', expiresAt: '2026-11-25T20:05:00Z', receiptCount: 2, expectedState: fields.expectedState };
  const parsed = parseSessionInspection({ contract: adminContract, person: { id: person, protectedOperator: false }, sessions: [{ ...item, sid: 'private', receipt: 'private' }], nextCursor: null });
  assert.deepEqual(parsed?.sessions, [item]);
  assert(!JSON.stringify(parsed).includes('private'));
  assert.equal(parseSessionInspection({ contract: adminContract, person: { id: person, protectedOperator: false }, sessions: Array(26).fill(item), nextCursor: null }), null);
  assert.equal(parseSessionInspection({ contract: adminContract, person: { id: person, protectedOperator: false }, sessions: [{ ...item, expectedState: 'raw-session' }], nextCursor: null }), null);
});

test('association actions reject origin, revoked/reader authority and injected fields before a write', async () => {
  let writes = 0; const dependencies = { getAccess: async () => ({ state: 'ready' as const, access }), api: async () => { writes++; return Response.json({}); } };
  assert.equal((await handleSessionEnd(request(undefined, 'https://other.example'), origin, person, dependencies)).status, 403);
  assert.equal((await handleSessionEnd(request(), origin, person, { ...dependencies, getAccess: async () => ({ state: 'forbidden' }) })).status, 403);
  const reader = { ...access, roles: ['support_reader'] as AdminAccess['roles'], capabilities: { ...access.capabilities, managePeople: false } };
  assert.equal((await handleSessionEnd(request(), origin, person, { ...dependencies, getAccess: async () => ({ state: 'ready', access: reader }) })).status, 403);
  const duplicate = new URLSearchParams(fields); duplicate.append('handle', handle);
  for (const body of [duplicate, new URLSearchParams({ ...fields, sid: 'private' }), new URLSearchParams({ ...fields, personId: person }),
    new URLSearchParams({ ...fields, returnTo: 'https://other.example' }), new URLSearchParams({ ...fields, reference: 'a'.repeat(4097) })]) {
    assert.equal((await handleSessionEnd(request(body), origin, person, dependencies)).status, 400);
  }
  assert.equal(writes, 0);
});

test('association actions use a fixed person-owned route and keep stale/uncertain results distinct', async () => {
  const writes: unknown[] = [];
  const dependencies = { getAccess: async () => ({ state: 'ready' as const, access }), api: async (path: string, init: unknown) => {
    writes.push({ path, init }); return Response.json({ contract: adminContract, personId: person, handle, ended: true, changed: true });
  } };
  const response = await handleSessionEnd(request(), origin, person, dependencies);
  assert.deepEqual(writes, [{ path: `/v1/admin/people/${person}/sessions/${handle}/end`, init: { method: 'POST', body: { expectedState: fields.expectedState, reference: fields.reference } } }]);
  assert.equal(response.headers.get('location'), `${origin}/admin/people/${person}/sessions?notice=ended`);
  assert.match(response.headers.get('cache-control')!, /no-store/);
  const stale = await handleSessionEnd(request(), origin, person, { ...dependencies, api: async () => Response.json({ error: 'app_session_snapshot_changed' }, { status: 409 }) });
  assert.match(stale.headers.get('location')!, /notice=app_session_snapshot_changed$/);
  const uncertain = await handleSessionEnd(request(), origin, person, { ...dependencies, api: async () => { throw new Error('unavailable'); } });
  assert.match(uncertain.headers.get('location')!, /notice=unavailable$/);
});
