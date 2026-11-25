import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAdminReview } from '../lib/admin-action';
import { adminContract, type AdminAccess } from '../lib/admin-model';

const origin = 'https://accesslobby.example.test';
const id = '18b72d01-8ac8-4afe-b75b-779c2ec09745';
const access: AdminAccess = { contract: adminContract, roles: ['application_reviewer'], capabilities: { read: true, reviewApplications: true } };
const fields = { intent: 'review', applicationId: id, decision: 'approved', reference: 'review-1234', configurationHash: 'a'.repeat(64) };
function request(body: string | URLSearchParams = new URLSearchParams(fields), from = origin, contentType = 'application/x-www-form-urlencoded') {
  return new Request(`${origin}/admin/action`, { method: 'POST', headers: { origin: from, 'content-type': contentType }, body });
}

test('review actions reject cross-origin, denied and read-only access before a write', async () => {
  let reads = 0, writes = 0;
  const dependencies = { getAccess: async () => { reads++; return { state: 'ready' as const, access }; }, api: async () => { writes++; return Response.json({}); } };
  assert.equal((await handleAdminReview(request(undefined, 'https://evil.test'), origin, dependencies)).status, 403);
  assert.equal(reads, 0); assert.equal(writes, 0);
  const forbidden = await handleAdminReview(request(), origin, { ...dependencies, getAccess: async () => ({ state: 'forbidden' }) });
  assert.equal(forbidden.status, 403);
  const reader = { ...access, roles: ['support_reader'] as AdminAccess['roles'], capabilities: { read: true as const, reviewApplications: false } };
  assert.equal((await handleAdminReview(request(), origin, { ...dependencies, getAccess: async () => ({ state: 'ready', access: reader }) })).status, 403);
  assert.equal(writes, 0);
  const signedOut = await handleAdminReview(request(), origin, { ...dependencies, getAccess: async () => ({ state: 'signed-out' }) });
  assert.equal(signedOut.headers.get('location'), `${origin}/auth/login`);
  assert.match(signedOut.headers.get('cache-control')!, /no-store/);
});

test('review actions enforce bounded exact fields and never forward claimed authority or return paths', async () => {
  let writes = 0;
  const dependencies = { getAccess: async () => ({ state: 'ready' as const, access }), api: async () => { writes++; return Response.json({}); } };
  const duplicate = new URLSearchParams(fields); duplicate.append('decision', 'rejected');
  const role = new URLSearchParams({ ...fields, role: 'administrator' });
  const returnPath = new URLSearchParams({ ...fields, returnTo: 'https://evil.test' });
  for (const body of [duplicate, role, returnPath, new URLSearchParams({ ...fields, applicationId: '../../realm' }),
    new URLSearchParams({ ...fields, reference: 'contains spaces' }), new URLSearchParams({ ...fields, configurationHash: 'secret' }), 'x'.repeat(4097)]) {
    assert.equal((await handleAdminReview(request(body), origin, dependencies)).status, 400);
  }
  assert.equal((await handleAdminReview(request(JSON.stringify(fields), origin, 'application/json'), origin, dependencies)).status, 400);
  assert.equal(writes, 0);
});

test('authorized review forwards the exact immutable decision and distinguishes approval from activation', async () => {
  const calls: unknown[] = [];
  const response = await handleAdminReview(request(), origin, {
    getAccess: async () => ({ state: 'ready', access }),
    api: async (path, init) => { calls.push({ path, ...init }); return Response.json({ contract: adminContract, decision: 'approved', applicationId: id }); },
  });
  assert.deepEqual(calls, [{ path: `/v1/admin/applications/${id}/review`, method: 'POST', body: { decision: 'approved', reference: 'review-1234', configurationHash: 'a'.repeat(64) } }]);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${origin}/admin/applications/${id}?notice=approved`);
  assert.match(response.headers.get('cache-control')!, /private, no-store/);
});

test('revocation, stale configuration and uncertain writes cannot produce a success notice', async () => {
  const deps = { getAccess: async () => ({ state: 'ready' as const, access }) };
  const revoked = await handleAdminReview(request(), origin, { ...deps, api: async () => Response.json({ error: 'operator_access_denied' }, { status: 403 }) });
  assert.equal(revoked.status, 403);
  const stale = await handleAdminReview(request(), origin, { ...deps, api: async () => Response.json({ error: 'stale_application_review' }, { status: 409 }) });
  assert.equal(stale.headers.get('location'), `${origin}/admin/applications/${id}?notice=stale_application_review`);
  const unknown = await handleAdminReview(request(), origin, { ...deps, api: async () => Response.json({ error: 'private-provider-subject' }, { status: 500 }) });
  assert.equal(unknown.headers.get('location'), `${origin}/admin/applications/${id}?notice=unavailable`);
  const outage = await handleAdminReview(request(), origin, { ...deps, api: async () => { throw new Error('private network details'); } });
  assert.equal(outage.headers.get('location'), `${origin}/admin/applications/${id}?notice=unavailable`);
  const mismatched = await handleAdminReview(request(), origin, { ...deps, api: async () => Response.json({ contract: adminContract, applicationId: id, decision: 'rejected' }) });
  assert.equal(mismatched.headers.get('location'), `${origin}/admin/applications/${id}?notice=unavailable`);
});
