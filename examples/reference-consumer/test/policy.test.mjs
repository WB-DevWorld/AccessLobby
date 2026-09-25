import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mayViewPrivate } from '../policy.mjs';

test('valid authentication does not imply this consumer grants resource access', () => {
  const grants = new Set(['explicitly-granted-person']);
  assert.equal(mayViewPrivate('another-authenticated-person', grants), false);
  assert.equal(mayViewPrivate('explicitly-granted-person', grants), true);
});
