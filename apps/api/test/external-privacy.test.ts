import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditExternalPrivacy, type ExternalExposure } from '../src/external-privacy.js';

const exposure = (suffix: string): ExternalExposure => {
  const clientId = 'external-' + suffix, subject = 'alx_' + suffix.repeat(43), apiAudience = 'external-api-pilot';
  return { clientId, subject, apiAudience, idToken: { sub: subject, iss: 'https://issuer.example', aud: clientId },
    accessToken: { sub: subject, aud: apiAudience, scope: 'openid' }, userInfo: { sub: subject } };
};
test('privacy gate checks all surfaces and permits only independent minimal identities', () => {
  const a = exposure('a'), b = exposure('b');
  assert.equal(auditExternalPrivacy([a, b], ['internal-person-identifier']).passed, true);
  assert.equal(auditExternalPrivacy([a], []).passed, false);
  b.accessToken.sub = a.subject;
  b.userInfo.sub = a.subject;
  b.idToken.sid = a.idToken.sid = 'shared-session-identifier';
  b.userInfo.email = 'private@example.test';
  a.accessToken.organization = { person: 'prefix-internal-person-identifier-suffix' };
  a.accessToken.aud = ['external-api-pilot', 'accesslobby-api'];
  const audit = auditExternalPrivacy([a, b], ['internal-person-identifier']);
  assert.equal(audit.passed, false);
  for (const code of ['cross_client_identifier', 'undeclared_claim', 'internal_identifier_exposed', 'unexpected_audience', 'subject_contract_mismatch']) {
    assert(audit.findings.some(f => f.code === code));
  }
  const report = JSON.stringify(audit);
  for (const secret of [a.subject, 'shared-session-identifier', 'private@example.test', 'internal-person-identifier']) assert(!report.includes(secret));
});
