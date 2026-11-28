import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationGrantsContract, applicationGrantsHref, grantExpiry, handleApplicationGrantAction, parseApplicationGrants } from '../lib/application-grants';
import { applicationLifecycleContract } from '../lib/application-lifecycle';

const origin = 'https://accesslobby.example.test';
const applicationId = '18b72d01-8ac8-4afe-b75b-779c2ec09745';
const personId = 'c76d5f6b-f8f6-413b-b06b-19bfc95ff187';
const ownerId = '65a241a1-c81b-47ea-af18-20e4a434d2f8';
const future = '2099-01-01T18:30:00Z';
const canonicalFuture = '2099-01-01T18:30:00.000Z';
const application = { id: applicationId, clientId: 'restricted-example', name: 'Restricted example',
  status: 'active', trustClass: 'first_party', admission: 'grant_required' };
const active = { personId, personStatus: 'active', status: 'active', grantedAt: '2026-11-28T12:00:00.000Z',
  grantedByPersonId: ownerId, expiresAt: null, revokedAt: null, expired: false };
const envelope = (grants: unknown[] = [active], nextCursor: string | null = null) => ({ contract: applicationGrantsContract, application, grants, nextCursor });
const fields = { intent: 'grant', applicationId, personId, grantView: 'detail', expiresAt: future };
function request(value: URLSearchParams | string = new URLSearchParams(fields), from = origin, contentType = 'application/x-www-form-urlencoded') {
  return new Request(`${origin}/apps/action`, { method: 'POST', headers: { origin: from, 'content-type': contentType }, body: value });
}
function success(intent = 'grant', expiry: string | null = canonicalFuture) {
  return Response.json({ applicationId, personId, status: intent === 'grant' ? 'active' : 'revoked', ...(intent === 'grant' ? { expiresAt: expiry } : {}) });
}

test('grant expiry requires a real future UTC calendar instant, supports no expiry and imposes no artificial year cap', () => {
  const now = Date.UTC(2026, 10, 28, 12);
  assert.equal(grantExpiry(undefined, now), undefined);
  assert.equal(grantExpiry('', now), undefined);
  assert.equal(grantExpiry('2027-01-01T18:30:00Z', now), '2027-01-01T18:30:00.000Z');
  assert.equal(grantExpiry('2028-02-29T18:30:00.125Z', now), '2028-02-29T18:30:00.125Z');
  assert.equal(grantExpiry('9999-12-31T23:59:59Z', now), '9999-12-31T23:59:59.000Z');
  for (const expiry of [null, [], 0, '2027-02-30T18:30:00Z', '2027-02-29T18:30:00Z', '2027-01-01T24:00:00Z',
    '2027-01-01T18:30:60Z', '2027-01-01T18:30:00+00:00', '2027-01-01T18:30:00', '2027-01-01T18:30:00.123456Z',
    '2026-11-28T12:00:00Z', '2026-11-28T11:59:59Z', ' ', 'tomorrow']) assert.equal(grantExpiry(expiry, now), false);
});

test('grant DTOs retain stored status separately from expiry/person status and strip undeclared private fields', () => {
  const expired = { ...active, expiresAt: '2026-11-27T12:00:00.000Z', expired: true, personStatus: 'suspended',
    subject: 'never-display-provider-subject', accessToken: 'never-display-token', sessionId: 'never-display-sid' };
  const parsed = parseApplicationGrants({ ...envelope([expired]), application: { ...application, secret: 'never-display-secret' } }, applicationId);
  assert.ok(parsed); assert.equal(parsed.grants[0]?.status, 'active'); assert.equal(parsed.grants[0]?.expired, true);
  assert.equal(parsed.grants[0]?.personStatus, 'suspended'); assert.equal(JSON.stringify(parsed).includes('never-display'), false);
  assert.deepEqual(Object.keys(parsed.grants[0]!).sort(), ['expired', 'expiresAt', 'grantedAt', 'grantedByPersonId', 'personId', 'personStatus', 'revokedAt', 'status']);
  assert.ok(parseApplicationGrants(envelope([{ ...active, status: 'revoked', revokedAt: '2026-11-28T12:10:00Z' }]), applicationId));
  const historical = parseApplicationGrants(envelope([{ ...active, status: 'revoked', revokedAt: null }]), applicationId);
  assert.equal(historical?.grants[0]?.status, 'revoked'); assert.equal(historical?.grants[0]?.revokedAt, null);
  for (const replacement of [{ expired: true }, { status: 'owner' }, { status: 'revoked', expiresAt: '2026-11-27T12:00:00Z', expired: true },
    { personStatus: 'administrator' }, { grantedAt: '2027-02-30T12:00:00Z' }, { grantedByPersonId: 'raw-provider-subject' }]) {
    assert.equal(parseApplicationGrants(envelope([{ ...active, ...replacement }]), applicationId), null);
  }
  for (const app of [{ ...application, id: ownerId }, { ...application, status: 'suspended' },
    { ...application, trustClass: 'external' }, { ...application, admission: 'authenticated_open' }]) {
    assert.equal(parseApplicationGrants({ ...envelope(), application: app }, applicationId), null);
  }
  assert.equal(parseApplicationGrants({ ...envelope(), contract: 'foreign-contract' }, applicationId), null);
});

test('grant results are bounded and pagination links bind only the selected app and valid opaque person IDs', () => {
  const grants = Array.from({ length: 25 }, (_, index) => ({ ...active, personId: `11111111-0000-4000-8000-${String(index).padStart(12, '0')}` }));
  const last = grants.at(-1)!.personId;
  assert.equal(parseApplicationGrants(envelope(grants, last), applicationId)?.nextCursor, last);
  assert.equal(parseApplicationGrants(envelope([...grants, { ...active, personId: ownerId }]), applicationId), null);
  assert.equal(parseApplicationGrants(envelope([active, active]), applicationId), null);
  assert.equal(parseApplicationGrants(envelope([active], personId), applicationId), null);
  assert.equal(parseApplicationGrants(envelope(grants, personId), applicationId), null);
  const href = applicationGrantsHref(applicationId.toUpperCase(), personId.toUpperCase(), ownerId.toUpperCase());
  assert.equal(href, `/apps/manage/${applicationId}/grants?after=${personId}&personId=${ownerId}`);
  assert.equal(applicationGrantsHref(applicationId), `/apps/manage/${applicationId}/grants`);
  for (const [app, after, person] of [['../../realm', undefined, undefined], [applicationId, 'raw-sid', undefined],
    [applicationId, undefined, 'https://evil.example'], [applicationId, [personId], undefined]]) {
    assert.equal(applicationGrantsHref(app, after, person), null);
  }
});

test('native grant/revoke actions deny CSRF and signed-out or unavailable sessions before any write', async () => {
  let reads = 0, writes = 0;
  const dependencies = { hasSession: async () => { reads++; return true; }, api: async () => { writes++; return success(); } };
  assert.equal((await handleApplicationGrantAction(request(undefined, 'https://evil.example'), origin, dependencies)).status, 403);
  assert.equal(reads, 0); assert.equal(writes, 0);
  assert.equal((await handleApplicationGrantAction(new Request(`${origin}/apps/action`), origin, dependencies)).status, 405);
  assert.equal(reads, 0);
  const signedOut = await handleApplicationGrantAction(request(), origin, { ...dependencies, hasSession: async () => false });
  assert.equal(signedOut.status, 303); assert.equal(signedOut.headers.get('location'), `${origin}/auth/login`);
  assert.match(signedOut.headers.get('cache-control')!, /private, no-store/);
  const unavailable = await handleApplicationGrantAction(request(), origin, { ...dependencies, hasSession: async () => { throw new Error('private-store-details'); } });
  assert.equal(unavailable.status, 503); assert.equal(writes, 0);
});

test('grant forms reject duplicate fields, claimed authority, unsafe paths and oversized/malformed native bodies', async () => {
  let writes = 0;
  const dependencies = { hasSession: async () => true, api: async () => { writes++; return success(); } };
  const duplicate = new URLSearchParams(fields); duplicate.append('personId', ownerId);
  for (const body of [duplicate, new URLSearchParams({ ...fields, ownerPersonId: ownerId }), new URLSearchParams({ ...fields, role: 'administrator' }),
    new URLSearchParams({ ...fields, returnTo: 'https://evil.example' }), new URLSearchParams({ ...fields, applicationId: '../../realm' }),
    new URLSearchParams({ ...fields, personId: 'provider-subject' }), new URLSearchParams({ ...fields, grantView: 'https://evil.example' }), 'x'.repeat(32769)]) {
    assert.equal((await handleApplicationGrantAction(request(body), origin, dependencies)).status, 400);
  }
  assert.equal((await handleApplicationGrantAction(request(JSON.stringify(fields), origin, 'application/json'), origin, dependencies)).status, 400);
  const invalidExpiry = await handleApplicationGrantAction(request(new URLSearchParams({ ...fields, expiresAt: '2099-02-30T18:30:00Z' })), origin, dependencies);
  assert.equal(invalidExpiry.headers.get('location'), `${origin}/apps/manage/${applicationId}/grants?notice=invalid_expiry`);
  assert.equal(writes, 0);
});

test('future and indefinite grants forward exact UTC intent; revocation uses only its fixed person-bound DELETE path', async () => {
  const calls: Array<{ path: string; init: unknown }> = [];
  const commands: Array<Record<string, string>> = [fields, { ...fields, expiresAt: '' }, { intent: 'revoke', applicationId, personId, grantView: 'detail' }];
  for (const command of commands) {
    const result = await handleApplicationGrantAction(request(new URLSearchParams({ ...command, applicationId: applicationId.toUpperCase(), personId: personId.toUpperCase() })), origin, {
      hasSession: async () => true,
      api: async (path, init) => { calls.push({ path, init }); return success(command.intent, command.intent === 'grant' && command.expiresAt ? canonicalFuture : null); },
    });
    assert.equal(result.status, 303);
    assert.equal(result.headers.get('location'), `${origin}/apps/manage/${applicationId}/grants?notice=${command.intent === 'grant' ? 'granted' : 'revoked'}`);
    assert.match(result.headers.get('cache-control')!, /private, no-store/);
  }
  assert.deepEqual(calls, [
    { path: `/v1/applications/${applicationId}/grants`, init: { method: 'POST', body: { personId, expiresAt: canonicalFuture } } },
    { path: `/v1/applications/${applicationId}/grants`, init: { method: 'POST', body: { personId } } },
    { path: `/v1/applications/${applicationId}/grants/${personId}`, init: { method: 'DELETE' } },
  ]);
});

test('expired authority, mismatched replies and uncertain writes cannot claim grant/revoke success or reflect private errors', async () => {
  for (const upstream of [Response.json({ applicationId: ownerId, personId, status: 'active', expiresAt: canonicalFuture }),
    Response.json({ applicationId, personId: ownerId, status: 'active', expiresAt: canonicalFuture }),
    Response.json({ applicationId, personId, status: 'revoked', expiresAt: canonicalFuture }),
    Response.json({ applicationId, personId, status: 'active', expiresAt: null }),
    Response.json({ error: 'private-provider-subject' }, { status: 503 }), new Response('not-json', { status: 200 })]) {
    const response = await handleApplicationGrantAction(request(), origin, { hasSession: async () => true, api: async () => upstream });
    assert.equal(response.headers.get('location'), `${origin}/apps/manage/${applicationId}/grants?notice=identity_unavailable`);
  }
  const denied = await handleApplicationGrantAction(request(), origin, { hasSession: async () => true, api: async () => new Response(null, { status: 403 }) });
  assert.equal(denied.status, 403);
  const expired = await handleApplicationGrantAction(request(), origin, { hasSession: async () => true, api: async () => new Response(null, { status: 401 }) });
  assert.equal(expired.headers.get('location'), `${origin}/auth/login`);
  const outage = await handleApplicationGrantAction(request(), origin, { hasSession: async () => true, api: async () => { throw new Error('private transport'); } });
  assert.equal(outage.headers.get('location'), `${origin}/apps/manage/${applicationId}/grants?notice=identity_unavailable`);
  const unknownRevoke = await handleApplicationGrantAction(request(new URLSearchParams({ intent: 'revoke', applicationId, personId })), origin,
    { hasSession: async () => true, api: async () => Response.json({ applicationId, personId, status: 'active' }) });
  assert.equal(unknownRevoke.headers.get('location'), `${origin}/apps/manage?notice=identity_unavailable`);
});

test('ordinary native request/DNS/lifecycle forms still delegate through their established handler after the grant enhancement', async () => {
  const calls: Array<{ path: string; init: unknown }> = [];
  const requestFields = { intent: 'request', name: 'New app', clientId: 'new-app', platform: 'web', redirectUri: 'https://app.example.test/callback',
    logoutUri: 'https://app.example.test/', backchannelLogoutUri: '', visibility: 'hidden', admission: 'grant_required' };
  const entries: Array<Record<string, string>> = [requestFields, { intent: 'verify', applicationId },
    { intent: 'cancel', applicationId, expectedConfigurationHash: 'a'.repeat(64), reference: 'change-1234' }];
  for (const entry of entries) {
    const response = await handleApplicationGrantAction(request(new URLSearchParams(entry)), origin, { hasSession: async () => true,
      api: async (path, init) => { calls.push({ path, init }); return entry.intent === 'cancel' ? Response.json({ contract: applicationLifecycleContract,
        applicationId, status: 'cancelled', configurationHash: 'b'.repeat(64), changed: true }) : Response.json({ id: applicationId }); } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), entry.intent === 'cancel' ? `${origin}/apps/manage/${applicationId}?notice=cancelled` : `${origin}/apps/manage?notice=${entry.intent === 'request' ? 'requested' : 'verified'}`);
  }
  assert.deepEqual(calls.map(call => [call.path, (call.init as { method: string }).method]), [
    ['/v1/applications', 'POST'], [`/v1/applications/${applicationId}/verify-origin`, 'POST'], [`/v1/applications/${applicationId}/cancel`, 'POST'],
  ]);
  assert.deepEqual((calls[0]!.init as { body: object }).body, { name: 'New app', clientId: 'new-app', platform: 'web',
    redirectUri: requestFields.redirectUri, logoutUri: requestFields.logoutUri, backchannelLogoutUri: '', visibility: 'hidden', admission: 'grant_required' });
});
