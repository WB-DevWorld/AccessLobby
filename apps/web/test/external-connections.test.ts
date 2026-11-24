import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionAction, connectionReturnPath, externalConnectionContract, externalConnectionPolicy, parseConnectionReview, parseConnections } from '../lib/external-connections';
import { isExternalConnectionPreviewEnabled } from '../lib/features';
const id = 'aa000000-0000-4000-8000-000000000001';
const reviewed = { contract: externalConnectionContract, applicationId: id, name: 'Reviewed store', origin: 'https://store.example.test',
  fingerprint: 'a'.repeat(64), policyVersion: externalConnectionPolicy, scopes: ['openid'], state: 'not-granted', activationAllowed: false, iamProvisioned: false };
test('external preview requires explicit enablement and a complete inactive reviewed configuration', () => {
  for (const flag of [undefined, '', 'false', 'TRUE', '1']) assert.equal(isExternalConnectionPreviewEnabled(flag), false);
  assert.equal(isExternalConnectionPreviewEnabled('true'), true);
  assert.deepEqual(parseConnectionReview(reviewed, id)?.scopes, ['openid']);
  for (const patch of [{ contract: 'accesslobby.external-preview.v0.1' }, { fingerprint: undefined }, { scopes: ['openid', 'email'] },
    { activationAllowed: true }, { iamProvisioned: true }, { origin: 'https://store.example.test/path' },
    { origin: 'javascript:alert(1)' }, { origin: 'https://user@store.example.test' }, { state: 'active' }]) {
    assert.equal(parseConnectionReview({ ...reviewed, ...patch }, id), null);
  }
  assert.equal(parseConnectionReview(reviewed, 'aa000000-0000-4000-8000-000000000002'), null);
});
test('approval posts only a bounded reviewed context; person and resource claims cannot select another actor or expand scopes', () => {
  const form = new FormData();
  form.set('applicationId', id); form.set('intent', 'grant'); form.set('fingerprint', reviewed.fingerprint);
  form.set('policyVersion', externalConnectionPolicy);
  assert.equal(connectionAction(form), null); // Explicit approval required, including without JS.
  form.set('approval', 'openid'); form.set('personId', 'attacker'); form.set('scopes', 'email profile organizations'); form.set('role', 'administrator');
  assert.deepEqual(connectionAction(form), { path: `/v1/preview/external-consents/${id}`, method: 'POST', notice: 'granted',
    body: { fingerprint: reviewed.fingerprint, policyVersion: externalConnectionPolicy, scopes: ['openid'] } });
  form.set('intent', 'withdraw'); form.delete('fingerprint'); form.delete('approval');
  assert.deepEqual(connectionAction(form), { path: `/v1/preview/external-consents/${id}`, method: 'DELETE', notice: 'withdrawn' });
  form.set('applicationId', '../other'); assert.equal(connectionAction(form), null);
});
test('withdrawal list accepts unavailable previous approvals but never interprets them as current access', () => {
  const row = { applicationId: id, name: 'Previously reviewed store', origin: 'https://old.example.test', state: 'granted',
    reviewAvailable: false, consentCurrent: false, activationAllowed: false };
  const body = { contract: externalConnectionContract, consents: [row], activationAllowed: false };
  assert.deepEqual(parseConnections(body), [{ ...row, activationAllowed: undefined }].map(({ activationAllowed, ...rest }) => rest));
  assert.equal(parseConnections({ ...body, activationAllowed: true }), null);
  assert.equal(parseConnections({ ...body, consents: [{ ...row, origin: 'http://old.example.test' }] }), null);
});

test('review continuation accepts only exact private preview paths and is bound to feature enablement', () => {
  assert.equal(connectionReturnPath('/connections/' + id, true), '/connections/' + id);
  assert.equal(connectionReturnPath('/connections', true), '/connections');
  for (const path of ['https://foreign.test', '//foreign.test', '/connections?next=evil', '/connections/' + id + '?x=1', '/connections/action', '/account', '/connections/%2f..', '/connections/' + id + '#fragment']) {
    assert.equal(connectionReturnPath(path, true), null);
  }
  assert.equal(connectionReturnPath('/connections/' + id, false), null);
});
