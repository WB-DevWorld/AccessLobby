import assert from 'node:assert/strict';
import test from 'node:test';
import { publicRegistrationEnabled } from '../config.mjs';

test('registration requires an explicit true value', () => {
  assert.equal(publicRegistrationEnabled('true'), true);
  assert.equal(publicRegistrationEnabled(' TRUE '), true);
  assert.equal(publicRegistrationEnabled('false'), false);
  assert.equal(publicRegistrationEnabled('1'), false);
  assert.equal(publicRegistrationEnabled(undefined), false);
});
