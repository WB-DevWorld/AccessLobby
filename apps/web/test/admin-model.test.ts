import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminContract, adminListPath, adminNextHref, applicationState, parseAdminAccess, parseAdminApplication,
  parseAdminApplications, parseAdminAudit, parseAdminOrganizations, parseAdminPeople,
} from '../lib/admin-model';

const id = '18b72d01-8ac8-4afe-b75b-779c2ec09745';
const owner = 'c76d5f6b-f8f6-413b-b06b-19bfc95ff187';
const date = '2026-11-25T19:00:00.000Z';
const app = { id, clientId: 'test-app', name: 'Example app', ownerPersonId: owner, status: 'requested', trustClass: 'unreviewed', platform: 'web',
  originVerifiedAt: date, reviewDecision: null };

test('operator authority must come from a consistent current operator response', () => {
  assert.equal(parseAdminAccess({ contract: adminContract, roles: ['support_reader'], capabilities: { read: true, reviewApplications: false } })?.capabilities.reviewApplications, false);
  assert.equal(parseAdminAccess({ contract: adminContract, roles: ['application_reviewer'], capabilities: { read: true, reviewApplications: true } })?.capabilities.reviewApplications, true);
  for (const roles of [[], ['owner'], ['administrator'], ['support_reader', 'support_reader']]) {
    assert.equal(parseAdminAccess({ contract: adminContract, roles, capabilities: { read: true, reviewApplications: false } }), null);
  }
  assert.equal(parseAdminAccess({ contract: adminContract, roles: ['support_reader'], capabilities: { read: true, reviewApplications: true } }), null);
  assert.equal(parseAdminAccess({ roles: ['application_reviewer'], capabilities: { read: true, reviewApplications: true } }), null);
});

test('directory parsing is bounded and exposes only the public operator fields', () => {
  const response = { contract: adminContract, people: [{ id, status: 'active', createdAt: date, organizationCount: 2, applicationCount: 1,
    subject: 'private-provider', accessToken: 'must-not-propagate' }], nextCursor: null };
  const parsed = parseAdminPeople(response);
  assert.equal(parsed?.items.length, 1);
  assert.equal('subject' in parsed!.items[0], false);
  assert.equal('accessToken' in parsed!.items[0], false);
  assert.equal(parseAdminPeople({ ...response, people: Array(26).fill(response.people[0]) }), null);
  assert.equal(parseAdminPeople({ ...response, people: [{ ...response.people[0], organizationCount: -1 }] }), null);
  assert.equal(parseAdminPeople({ ...response, people: [{ ...response.people[0], status: 'administrator' }] }), null);
  assert.equal(parseAdminOrganizations({ contract: adminContract, organizations: [{ id, name: 'Example', status: 'active', createdAt: date, memberCount: 2, ownerCount: 1 }], nextCursor: null })?.items[0].name, 'Example');
  assert.equal(parseAdminOrganizations({ contract: adminContract, organizations: [{ id, name: '', status: 'active', createdAt: date, memberCount: 2, ownerCount: 1 }], nextCursor: null }), null);
  assert.equal(parseAdminAudit({ contract: adminContract, events: [{ id: '4', actorPersonId: null, action: 'operator.role_granted', targetType: 'person', targetId: owner, reference: 'review-1234', occurredAt: date }], nextCursor: '4' })?.items[0].actorPersonId, null);
});

test('application details require a matching contract and complete review data', () => {
  assert.equal(parseAdminApplications({ contract: adminContract, applications: [app], nextCursor: null })?.items[0].status, 'requested');
  const detail = { contract: adminContract, application: { ...app, redirectUri: 'https://example.test/callback', logoutUri: 'https://example.test/',
    backchannelLogoutUri: null, visibility: 'hidden', admission: 'grant_required', originVerifiedHost: 'example.test', configurationHash: 'a'.repeat(64),
    review: { decision: 'approved', reference: 'review-1234', reviewerPersonId: id, reviewedAt: date, configurationHash: 'b'.repeat(64) } } };
  const parsed = parseAdminApplication(detail);
  assert.equal(parsed?.review?.configurationHash, 'b'.repeat(64));
  assert.notEqual(parsed?.review?.configurationHash, parsed?.configurationHash);
  assert.equal(parseAdminApplication({ ...detail, application: { ...detail.application, review: { ...detail.application.review, configurationHash: 'bad' } } }), null);
  assert.equal(parseAdminApplication({ ...detail, contract: 'wrong-contract' }), null);
  assert.equal(applicationState({ status: 'requested', reviewDecision: 'approved' }), 'Approved · awaiting private activation');
  assert.equal(applicationState({ status: 'active', reviewDecision: null }), 'Active');
});

test('directory filters and pagination remain on fixed operator paths', () => {
  assert.equal(adminListPath('people', '18b7', undefined), '/v1/admin/people?q=18b7');
  assert.equal(adminListPath('people', 'Jane', undefined), null);
  assert.equal(adminListPath('people', '18', undefined), null);
  assert.equal(adminListPath('organizations', ['duplicate'], undefined), null);
  assert.equal(adminListPath('applications', 'a'.repeat(121), undefined), null);
  assert.equal(adminListPath('people', undefined, '//evil.test'), null);
  assert.equal(adminListPath('audit', undefined, '-1'), null);
  assert.equal(adminNextHref('applications', 'https://evil.test?a=b', id), `/admin/applications?q=https%3A%2F%2Fevil.test%3Fa%3Db&after=${id}`);
  assert.equal(adminNextHref('audit', undefined, '14'), '/admin/audit?after=14');
});
