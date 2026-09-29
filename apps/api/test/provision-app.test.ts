import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesClient, representation } from '../src/provision-app.js';

test('client readback must retain exact PKCE, callback and API audience', () => {
  const desired = representation({ id: 'id', client_id: 'my-app', name: 'My app',
    redirect_uri: 'https://app.example.test/callback', logout_uri: 'https://app.example.test/',
    status: 'requested', trust_class: 'unreviewed', owner_active: true });
  assert.equal(matchesClient(desired, desired, desired.protocolMappers), true);
  assert.equal(matchesClient({ ...desired, redirectUris: ['https://evil.example.test/callback'] }, desired, desired.protocolMappers), false);
  assert.equal(matchesClient({ ...desired, attributes: { ...desired.attributes, 'pkce.code.challenge.method': 'plain' } }, desired, desired.protocolMappers), false);
  assert.equal(matchesClient(desired, desired, []), false);
  assert.equal(matchesClient({ ...desired, directAccessGrantsEnabled: true }, desired, desired.protocolMappers), false);
});
