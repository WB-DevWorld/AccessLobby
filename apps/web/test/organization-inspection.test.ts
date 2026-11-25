import assert from 'node:assert/strict';
import test from 'node:test';
import { adminContract } from '../lib/admin-model';
import { loadOrganizationInspection } from '../lib/organization-inspection-data';
import { organizationEventLabels, organizationInspectionHref, organizationInspectionPath, organizationSection, organizationDetailPath,
  parseOrganizationEvents, parseOrganizationInspection, parseOrganizationInvitations, parseOrganizationMembers } from '../lib/organization-inspection';

const id = '31111111-0000-4000-8000-000000000001';
const personId = '21111111-0000-4000-8000-000000000001';
const other = '41111111-0000-4000-8000-000000000001';
const at = '2026-01-02T03:04:05.000Z';
const organization = { id, name: 'Stored organization name', status: 'suspended', createdByPersonId: personId, createdAt: at,
  activeMemberCount: 2, activeOwnerCount: 1, totalMembershipCount: 4, totalInvitationCount: 1 };
const member = { personId, personStatus: 'suspended', role: 'administrator', membershipStatus: 'active', joinedAt: at, endedAt: null };
const invitation = { id: other, personId, invitedByPersonId: personId, role: 'member', status: 'pending', expiresAt: at, createdAt: at, decidedAt: null, pendingExpired: true };
const event = { id: '91', actorPersonId: personId, targetPersonId: null, action: 'organization.event', occurredAt: at };
const envelope = (key: 'members' | 'invitations' | 'events', rows: unknown[], nextCursor: string | null = null) =>
  ({ contract: adminContract, organizationId: id, [key]: rows, nextCursor });

test('organization inspection parses only stored metadata and rejects invented statuses and malformed counts', () => {
  assert.deepEqual(parseOrganizationInspection({ contract: adminContract, organization: { ...organization,
    legalVerification: true, profileEmail: 'private@example.test', providerSubject: 'private-subject' } }), organization);
  for (const replacement of [{ id: '../other' }, { createdByPersonId: 'not-uuid' }, { status: 'legally_verified' }, { activeMemberCount: -1 },
    { activeOwnerCount: 3 }, { activeMemberCount: 5 }, { totalMembershipCount: 1.2 }, { totalInvitationCount: Number.MAX_SAFE_INTEGER + 1 },
    { createdAt: '2026-02-31T03:04:05.000Z' }, { name: 'bad\nname' }, { name: 'x'.repeat(121) }]) {
    assert.equal(parseOrganizationInspection({ contract: adminContract, organization: { ...organization, ...replacement } }), null);
  }
  assert.equal(parseOrganizationInspection({ contract: 'another-contract', organization }), null);
});

test('member inspection preserves separate status facts without exposing extra identity claims', () => {
  const parsed = parseOrganizationMembers(envelope('members', [{ ...member, email: 'private@example.test', iamSubject: 'private-subject' }]), id);
  assert.deepEqual(parsed?.items, [member]);
  assert.equal(parsed?.items[0]?.personStatus, 'suspended'); assert.equal(parsed?.items[0]?.membershipStatus, 'active');
  for (const replacement of [{ role: 'realm_admin' }, { membershipStatus: 'suspended' }, { personStatus: 'removed' }, { endedAt: 'invalid' }, { joinedAt: null }]) {
    assert.equal(parseOrganizationMembers(envelope('members', [{ ...member, ...replacement }]), id), null);
  }
  assert.equal(parseOrganizationMembers({ ...envelope('members', [member]), organizationId: other }, id), null);
});

test('invitation inspection keeps expiry distinct from recorded decisions and strips invitation secrets', () => {
  assert.deepEqual(parseOrganizationInvitations(envelope('invitations', [{ ...invitation, invitationToken: 'private-token', acceptanceUrl: 'https://private.example/secret' }]), id)?.items, [invitation]);
  const revoked = { ...invitation, status: 'revoked', pendingExpired: false, decidedAt: at };
  assert.equal(parseOrganizationInvitations(envelope('invitations', [revoked]), id)?.items[0]?.status, 'revoked');
  for (const replacement of [{ status: 'expired' }, { role: 'owner' }, { status: 'accepted', pendingExpired: true }, { pendingExpired: 'true' },
    { expiresAt: 'today' }, { invitedByPersonId: '../../users' }, { decidedAt: 0 }]) {
    assert.equal(parseOrganizationInvitations(envelope('invitations', [{ ...invitation, ...replacement }]), id), null);
  }
});

test('organization history accepts only safe labels and valid bounded event identifiers', () => {
  assert.deepEqual(parseOrganizationEvents(envelope('events', [{ ...event, token: 'private-token', details: 'private notes' }]), id)?.items, [event]);
  assert.equal(organizationEventLabels['organization.event'], 'Other recorded event');
  for (const replacement of [{ id: '9223372036854775808' }, { id: '0' }, { id: '01' }, { action: 'provider-secret@example.test' },
    { action: 'toString' }, { targetPersonId: 'email@example.test' }, { actorPersonId: null }, { occurredAt: 'invalid' }]) {
    assert.equal(parseOrganizationEvents(envelope('events', [{ ...event, ...replacement }]), id), null);
  }
});

test('inspection pages enforce their organization, maximum size and truthful continuation row', () => {
  const members = Array.from({ length: 25 }, (_, i) => ({ ...member, personId: `21111111-0000-4000-8000-${String(i).padStart(12, '0')}` }));
  const last = members.at(-1)!.personId;
  assert.equal(parseOrganizationMembers(envelope('members', members, last), id)?.nextCursor, last);
  assert.equal(parseOrganizationMembers(envelope('members', [...members, member]), id), null);
  assert.equal(parseOrganizationMembers(envelope('members', members, other), id), null);
  assert.equal(parseOrganizationMembers(envelope('members', [], last), id), null);
  assert.equal(parseOrganizationMembers(envelope('members', [member], personId), id), null);
  assert.equal(parseOrganizationMembers({ ...envelope('members', []), contract: 'unknown' }, id), null);
  assert.equal(parseOrganizationMembers({ ...envelope('members', []), nextCursor: 'https://evil.example/' }, id), null);
  assert.deepEqual(parseOrganizationMembers(envelope('members', []), id)?.items, []);
});

test('native inspection links stay on fixed console paths and reject malformed, repeated and cross-origin input', () => {
  assert.equal(organizationDetailPath(id.toUpperCase()), `/v1/admin/organizations/${id}`);
  assert.equal(organizationSection(undefined), 'members'); assert.equal(organizationSection('events'), 'events');
  assert.equal(organizationInspectionPath(id, 'members', personId), `/v1/admin/organizations/${id}/members?after=${personId}`);
  assert.equal(organizationInspectionHref(id, 'invitations', other), `/admin/organizations/${id}?section=invitations&after=${other}`);
  assert.equal(organizationInspectionHref(id, 'events', '9223372036854775807'), `/admin/organizations/${id}?section=events&after=9223372036854775807`);
  assert.equal(organizationInspectionHref(id, 'members'), `/admin/organizations/${id}?section=members`);
  for (const section of [null, [], ['members', 'events'], '../audit', 'https://evil.example/']) {
    assert.equal(organizationSection(section), null);
    assert.equal(organizationInspectionHref(id, section), null);
  }
  for (const after of [null, [], [personId], 'https://evil.example/', '../../people', '', '9223372036854775808']) {
    assert.equal(organizationInspectionPath(id, 'members', after), null);
    assert.equal(organizationInspectionPath(id, 'events', after), null);
  }
  assert.equal(organizationDetailPath('//evil.example'), null);
  assert.equal(organizationInspectionPath('../people', 'members'), null);
});

test('inspection transport distinguishes unknown records, access loss and unavailable data without reflecting errors', async () => {
  const paths: string[] = [];
  const loaded = await loadOrganizationInspection(id, 'detail', undefined, parseOrganizationInspection, async path => {
    paths.push(path); return Response.json({ contract: adminContract, organization });
  });
  assert.deepEqual(loaded, { state: 'ready', data: organization });
  assert.deepEqual(paths, [`/v1/admin/organizations/${id}`]);
  for (const [code, state] of [[401, 'signed-out'], [403, 'forbidden'], [404, 'not-found'], [400, 'invalid-query'], [500, 'unavailable']] as const) {
    assert.deepEqual(await loadOrganizationInspection(id, 'members', undefined, value => parseOrganizationMembers(value, id),
      async () => Response.json({ error: 'secret-not-to-reflect' }, { status: code })), { state });
  }
  assert.deepEqual(await loadOrganizationInspection(id, 'detail', undefined, parseOrganizationInspection,
    async () => Response.json({ contract: 'invalid', organization })), { state: 'unavailable' });
  assert.deepEqual(await loadOrganizationInspection(id, 'detail', undefined, parseOrganizationInspection,
    async () => { throw new Error('private transport details'); }), { state: 'unavailable' });
  let calls = 0;
  for (const [org, section, after] of [['../audit', 'detail', undefined], [id, 'members', [personId]], [id, 'events', '0'], [id, 'detail', personId]] as const) {
    assert.deepEqual(await loadOrganizationInspection(org, section, after, () => organization,
      async () => { calls++; return Response.json(organization); }), { state: 'invalid-query' });
  }
  assert.equal(calls, 0);
});
