import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatIdentityStatus,
  parseCurrentPersonResponse,
} from '../lib/current-identity-model';

test('parses the current person response without inventing extra fields', () => {
  assert.deepEqual(
    parseCurrentPersonResponse({ person: { id: ' person_123 ', status: 'active', ignored: true } }),
    { id: 'person_123', status: 'active' },
  );
});

test('rejects missing or malformed identity responses', () => {
  assert.equal(parseCurrentPersonResponse(null), null);
  assert.equal(parseCurrentPersonResponse({}), null);
  assert.equal(parseCurrentPersonResponse({ person: { id: '', status: 'active' } }), null);
  assert.equal(parseCurrentPersonResponse({ person: { id: 'person_123', status: 12 } }), null);
});

test('formats lifecycle status for display', () => {
  assert.equal(formatIdentityStatus('pending_review'), 'Pending Review');
  assert.equal(formatIdentityStatus('active'), 'Active');
});
