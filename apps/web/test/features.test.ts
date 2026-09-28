import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicRegistrationEnabled } from '../lib/features';

test('public registration is enabled only by an explicit true value', () => {
  assert.equal(isPublicRegistrationEnabled('true'), true);
  assert.equal(isPublicRegistrationEnabled(' TRUE '), true);
  assert.equal(isPublicRegistrationEnabled('false'), false);
  assert.equal(isPublicRegistrationEnabled('1'), false);
  assert.equal(isPublicRegistrationEnabled(undefined), false);
});
