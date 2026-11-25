import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateClaims } from '../src/auth.js';
import type { Config } from '../src/config.js';

const settings: Config = { databaseUrl: '', issuer: 'https://identity.example/realms/first-party',
  audience: 'accesslobby-api', allowedClients: ['accesslobby-web', 'poii'], port: 3001, version: 'test' };
test('requires issuer, subject and allowlisted client', () => {
  assert.deepEqual(validateClaims({ iss: settings.issuer, sub: 'subject', azp: 'poii' }, settings),
    { issuer: settings.issuer, subject: 'subject', client: 'poii' });
  for (const claim of [
    { iss: 'https://wrong', sub: 'subject', azp: 'poii' },
    { iss: settings.issuer, sub: '', azp: 'poii' },
    { iss: settings.issuer, sub: 'subject', azp: 'unknown' }
  ]) assert.throws(() => validateClaims(claim, settings));
});

test('only safe integer token issue times are exposed for lifecycle checks', () => {
  const base = { iss: settings.issuer, sub: 'subject', azp: 'poii' };
  assert.equal(validateClaims({ ...base, iat: 1795630000 }, settings).issuedAt, 1795630000);
  for (const iat of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '1795630000']) {
    assert.equal(validateClaims({ ...base, iat } as any, settings).issuedAt, undefined);
  }
});
