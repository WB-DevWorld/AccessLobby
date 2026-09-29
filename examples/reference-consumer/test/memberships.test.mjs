import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMemberships, selectedMembership } from '../memberships.mjs';
import { mayViewPrivate } from '../policy.mjs';

const personId = '76257b81-2222-4444-aaaa-638fa68c529c';
const organization = { id: '19d98b15-3333-4444-bbbb-7dad53c3fc97', name: 'Example cooperative', role: 'member' };
const session = { personId, accessToken: 'server-only-token', selectedOrganizationId: organization.id };
const answer = (person = personId, organizations = [organization], status = 200) => ({
  ok: status === 200,
  status,
  json: async () => ({ contract: 'accesslobby.memberships.v0.1', person: { id: person }, organizations }),
});

test('self-scoped memberships are display context, never a local resource grant', async () => {
  const organizations = await loadMemberships('https://api.example.test', session, async (url, options) => {
    assert.equal(url, 'https://api.example.test/v1/my-organizations');
    assert.equal(options.headers.authorization, 'Bearer server-only-token');
    return answer();
  });
  assert.deepEqual(selectedMembership(session, organizations), organization);
  assert.equal(mayViewPrivate(personId, new Set()), false);
  assert.equal(mayViewPrivate(personId, new Set([personId])), true);
  assert.equal(selectedMembership(session, []), undefined); // Removal invalidates a chosen context.
});

test('reject mismatched person, malformed membership and unavailable API', async () => {
  await assert.rejects(loadMemberships('https://api.example.test', session, async () => answer('another-person')));
  await assert.rejects(loadMemberships('https://api.example.test', session, async () => answer(personId, [{ ...organization, role: 'owner', id: 'invalid' }])));
  await assert.rejects(loadMemberships('https://api.example.test', session, async () => answer(personId, [organization, organization])));
  await assert.rejects(loadMemberships('https://api.example.test', session, async () => answer(personId, [], 401)));
});
