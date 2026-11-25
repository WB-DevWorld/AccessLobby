import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handlePersonStatusChange } from '../lib/person-controls-action';
import { parseAdminPersonDetail } from '../lib/person-controls-model';
import { adminContract, type AdminAccess } from '../lib/admin-model';

const id = '18b72d01-8ac8-4afe-b75b-779c2ec09745', origin = 'https://accesslobby.example.test';
const access: AdminAccess = { contract: adminContract, roles: ['identity_operator'],
  capabilities: { read: true, reviewApplications: false, managePeople: true, activateApplications: false } };
const fields = { intent: 'change-status', personId: id, status: 'suspended', reference: 'person-review-1234', expectedVersion: '0' };
function request(fieldsBody = new URLSearchParams(fields), from = origin) {
  return new Request(origin + '/admin/people/action', { method: 'POST', headers: { origin: from, 'content-type': 'application/x-www-form-urlencoded' }, body: fieldsBody });
}

test('person detail parsing exposes a bounded current record without provider or cutoff data', () => {
  const person = { id, status: 'active', createdAt: '2026-11-25T19:00:00Z', organizationCount: 1, applicationCount: 2, protectedOperator: false, statusVersion: '0' };
  assert.deepEqual(parseAdminPersonDetail({ contract: adminContract, person: { ...person, subject: 'private', session_not_before: 999 } }), person);
  for (const override of [{ statusVersion: '-1' }, { statusVersion: 0 }, { protectedOperator: 'false' }, { status: 'deleted' }, { organizationCount: -1 }]) {
    assert.equal(parseAdminPersonDetail({ contract: adminContract, person: { ...person, ...override } }), null);
  }
  assert.equal(parseAdminPersonDetail({ contract: 'other', person }), null);
});

test('person status actions reject origin, reader and revoked authority before forwarding data', async () => {
  let reads = 0, writes = 0;
  const dependencies = { getAccess: async () => { reads++; return { state: 'ready' as const, access }; }, api: async () => { writes++; return Response.json({}); } };
  assert.equal((await handlePersonStatusChange(request(undefined, 'https://other.example'), origin, dependencies)).status, 403);
  assert.equal(reads, 0);
  assert.equal((await handlePersonStatusChange(request(), origin, { ...dependencies, getAccess: async () => ({ state: 'forbidden' }) })).status, 403);
  const reader: AdminAccess = { ...access, roles: ['support_reader'], capabilities: { ...access.capabilities, managePeople: false } };
  assert.equal((await handlePersonStatusChange(request(), origin, { ...dependencies, getAccess: async () => ({ state: 'ready', access: reader }) })).status, 403);
  assert.equal(writes, 0);
  const response = await handlePersonStatusChange(request(), origin, { ...dependencies, getAccess: async () => ({ state: 'signed-out' }) });
  assert.equal(response.headers.get('location'), origin + '/auth/login');
});

test('person status form refuses duplicate authority/return fields, invalid versions and oversized bodies', async () => {
  let writes = 0; const dependencies = { getAccess: async () => ({ state: 'ready' as const, access }), api: async () => { writes++; return Response.json({}); } };
  const duplicate = new URLSearchParams(fields); duplicate.append('status', 'active');
  for (const body of [duplicate, new URLSearchParams({ ...fields, role: 'identity_operator' }), new URLSearchParams({ ...fields, returnTo: 'https://other.example' }),
    new URLSearchParams({ ...fields, expectedVersion: '00' }), new URLSearchParams({ ...fields, reference: 'x'.repeat(4097) })]) {
    assert.equal((await handlePersonStatusChange(request(body), origin, dependencies)).status, 400);
  }
  assert.equal(writes, 0);
});

test('person status form forwards only the intended mutation and reports stale or uncertain outcomes truthfully', async () => {
  const writes: unknown[] = [];
  const dependencies = { getAccess: async () => ({ state: 'ready' as const, access }), api: async (path: string, init: unknown) => {
    writes.push({ path, init }); return Response.json({ contract: adminContract, person: { id, status: 'suspended', statusVersion: '1' }, changed: true });
  } };
  const result = await handlePersonStatusChange(request(), origin, dependencies);
  assert.equal(result.headers.get('location'), origin + `/admin/people/${id}?notice=suspended`);
  assert.deepEqual(writes, [{ path: `/v1/admin/people/${id}/status`, init: { method: 'POST', body: { status: 'suspended', reference: fields.reference, expectedVersion: '0' } } }]);
  assert.match(result.headers.get('cache-control')!, /no-store/);
  const stale = await handlePersonStatusChange(request(), origin, { ...dependencies, api: async () => Response.json({ error: 'stale_person_change' }, { status: 409 }) });
  assert.match(stale.headers.get('location')!, /notice=stale_person_change$/);
  const unknown = await handlePersonStatusChange(request(), origin, { ...dependencies, api: async () => { throw new Error('unavailable'); } });
  assert.match(unknown.headers.get('location')!, /notice=unavailable$/);
});
