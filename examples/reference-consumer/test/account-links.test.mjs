import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { AccountLinks } from '../account-links.mjs';

test('existing account keeps its local ID after explicit dual-auth link', () => {
  const links = new AccountLinks();
  links.link('https://issuer', 'subject-1', 'person-1', 'legacy-user-1');
  assert.equal(links.find('https://issuer', 'subject-1', 'person-1'), 'legacy-user-1');
  assert.equal(links.join('https://issuer', 'subject-1', 'person-1'), 'legacy-user-1');
  assert.throws(() => links.link('https://issuer', 'subject-2', 'person-2', 'legacy-user-1'));
  assert.throws(() => links.link('https://issuer', 'subject-1', 'person-1', 'legacy-user-2'));
  assert.throws(() => links.find('https://issuer', 'subject-1', 'person-2'));
});

test('new peer user receives an independent local ID', () => {
  const links = new AccountLinks();
  const created = links.join('https://issuer', 'new-subject', 'new-person');
  assert.equal(links.find('https://issuer', 'new-subject', 'new-person'), created);
  assert.notEqual(created, 'new-person');
});
