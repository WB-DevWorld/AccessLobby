import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountResolutionError, resolveAccountLanding } from '../lib/account-landing';

const personId = 'b81b1db0-98b3-4e61-9922-e1bedfefba11';
const orgId = 'a5421903-4e88-4be0-8ca7-605d26578741';
const identity = { contract: 'accesslobby.identity.v0.1', person: { id: personId, status: 'active' } };
const personal = { person: { id: personId }, contexts: [{ type: 'personal' }], invitations: [] };

function service(me: unknown = identity, contexts: unknown = personal, status = 200) {
  const called: string[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    assert.equal(init.headers && (init.headers as Record<string, string>).authorization, 'Bearer token');
    called.push(url);
    return Response.json(url.endsWith('/v1/me') ? me : contexts,
      { status: url.endsWith('/v1/me') ? status : 200 });
  }) as typeof fetch;
  return { called, fetcher };
}

test('post-authentication resolves the person and routes by live account relationships', async () => {
  const only = service();
  assert.equal(await resolveAccountLanding('token', 'http://api', only.fetcher), '/account');
  assert.deepEqual(only.called, ['http://api/v1/me', 'http://api/v1/contexts']);

  const org = service(identity, { ...personal, contexts: [...personal.contexts,
    { type: 'organization', id: orgId, name: 'Example cooperative', role: 'member' }] });
  assert.equal(await resolveAccountLanding('token', 'http://api', org.fetcher), '/contexts');

  const invite = service(identity, { ...personal, invitations: [{ id: orgId, organizationId: orgId,
    organizationName: 'Example cooperative', role: 'administrator', expiresAt: '2026-10-01T00:00:00Z' }] });
  assert.equal(await resolveAccountLanding('token', 'http://api', invite.fetcher), '/contexts');
});

test('post-authentication refuses a restricted, mismatched, or unavailable identity/context', async () => {
  const forbidden = service(identity, personal, 403);
  await assert.rejects(resolveAccountLanding('token', 'http://api', forbidden.fetcher),
    (error: unknown) => error instanceof AccountResolutionError && error.code === 'account_restricted');
  assert.deepEqual(forbidden.called, ['http://api/v1/me']);

  const mismatched = service(identity, { ...personal, person: { id: orgId } });
  await assert.rejects(resolveAccountLanding('token', 'http://api', mismatched.fetcher),
    (error: unknown) => error instanceof AccountResolutionError && error.code === 'account_unavailable');

  const malformed = service(identity, { ...personal, contexts: [{ type: 'personal' },
    { type: 'organization', id: orgId, name: 'Example', role: 'superadmin' }] });
  await assert.rejects(resolveAccountLanding('token', 'http://api', malformed.fetcher), AccountResolutionError);

  const suspended = service({ ...identity, person: { id: personId, status: 'suspended' } });
  await assert.rejects(resolveAccountLanding('token', 'http://api', suspended.fetcher), AccountResolutionError);
  assert.deepEqual(suspended.called, ['http://api/v1/me']);

  const offline = (async () => { throw new Error('network offline'); }) as typeof fetch;
  await assert.rejects(resolveAccountLanding('token', 'http://api', offline), AccountResolutionError);
});
