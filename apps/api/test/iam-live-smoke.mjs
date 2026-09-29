/** CI only: exercise the private client helpers against disposable Keycloak. */
import assert from 'node:assert/strict';
import { representation, reconcileClient } from '../dist/provision-app.js';
import { disableIamClient } from '../dist/suspend-app.js';

const token = process.env.IAM_SMOKE_TOKEN;
if (!token || process.env.CI !== 'true') throw new Error('CI-only IAM token required');
const base = 'http://127.0.0.1:8080';
const realm = 'accesslobby-first-party';
const clientId = 'ci-onboarded';
const wanted = representation({ client_id: clientId, name: 'CI onboarding',
  redirect_uri: 'https://ci.example.test/callback', logout_uri: 'https://ci.example.test/',
  backchannel_logout_uri: 'https://ci.example.test/backchannel-logout' });

await reconcileClient(base, realm, token, wanted);
await reconcileClient(base, realm, token, wanted); // Existing exact client is an idempotent retry.
const different = representation({ client_id: clientId, name: 'CI onboarding',
  redirect_uri: 'https://ci.example.test/callback', logout_uri: 'https://ci.example.test/',
  backchannel_logout_uri: 'https://ci.example.test/another-logout' });
await assert.rejects(reconcileClient(base, realm, token, different), /differs from approved configuration/);
assert.equal(await disableIamClient(base, realm, token, clientId), 'disabled');
assert.equal(await disableIamClient(base, realm, token, clientId), 'disabled');
await assert.rejects(reconcileClient(base, realm, token, wanted), /differs from approved configuration/);
console.info('Disposable Keycloak client: exact registration, retry, mismatch and disable verified');
