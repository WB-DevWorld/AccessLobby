import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { OrganizationInspectionStore } from '../src/organization-inspection.js';
import { OperatorError, OperatorStore, type OperatorRole } from '../src/operators.js';
import { OrganizationStore } from '../src/organizations.js';
import { manageOperatorRole } from '../src/manage-operator.js';

const live = { skip: !process.env.TEST_DATABASE_URL };
const rejected = (status: number, code: string) => (error: unknown) =>
  error instanceof OperatorError && error.status === status && error.code === code;
const personId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const invitationId = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fixture() {
  const database = await openIsolatedDatabase();
  const { pool } = database;
  const owner = '00000000-0000-4000-8000-000000000001';
  const actor = randomUUID();
  for (const person of [owner, actor]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
  const organization = await new OrganizationStore(pool).create(owner, 'Organization investigation fixture');
  const operators = new OperatorStore(pool);
  await manageOperatorRole(pool, actor, 'grant', 'support_reader', 'organization-inspection-fixture');
  return { ...database, owner, actor, organization, store: new OrganizationInspectionStore(pool, operators) };
}

test('organization inspection requires a current explicit read grant before record or cursor validation', live, async () => {
  const f = await fixture();
  try {
    for (const actor of [f.owner, randomUUID(), 'not-a-person', { personId: f.owner, roles: ['support_reader'] } as unknown as string]) {
      await assert.rejects(f.store.detail(actor, f.organization.id), rejected(403, 'operator_access_denied'));
      await assert.rejects(f.store.detail(actor, 'invalid-org'), rejected(403, 'operator_access_denied'));
      await assert.rejects(f.store.members(actor, f.organization.id, 'bad-cursor'), rejected(403, 'operator_access_denied'));
      await assert.rejects(f.store.invitations(actor, f.organization.id), rejected(403, 'operator_access_denied'));
      await assert.rejects(f.store.events(actor, f.organization.id), rejected(403, 'operator_access_denied'));
    }
    for (const id of ['invalid', null, [], randomUUID()]) {
      for (const read of [f.store.detail.bind(f.store), f.store.members.bind(f.store), f.store.invitations.bind(f.store), f.store.events.bind(f.store)]) {
        await assert.rejects(read(f.actor, id), rejected(404, 'organization_not_found'));
      }
    }
    for (const role of ['application_reviewer', 'identity_operator', 'application_operator'] as OperatorRole[]) {
      const actor = randomUUID();
      await f.pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [actor]);
      await manageOperatorRole(f.pool, actor, 'grant', role, `inspect-${role}`);
      assert.equal((await f.store.detail(actor, f.organization.id)).organization.id, f.organization.id);
    }
    await manageOperatorRole(f.pool, f.actor, 'revoke', 'support_reader', 'organization-inspection-revoked');
    await assert.rejects(f.store.members(f.actor, f.organization.id), rejected(403, 'operator_access_denied'));
    await manageOperatorRole(f.pool, f.actor, 'grant', 'support_reader', 'organization-inspection-restored');
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.actor]);
    await assert.rejects(f.store.detail(f.actor, f.organization.id), rejected(403, 'operator_access_denied'));
    await assert.rejects(f.store.invitations(f.actor, f.organization.id), rejected(403, 'operator_access_denied'));
    await assert.rejects(f.store.events(f.actor, f.organization.id), rejected(403, 'operator_access_denied'));
  } finally { await f.close(); }
});

test('organization member paging retains separate person and membership states and truthful aggregate counts', live, async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 30; i++) {
      await f.pool.query('INSERT INTO persons(id,status) VALUES($1,$2)', [personId(i), i === 1 ? 'suspended' : 'active']);
      await f.pool.query(`INSERT INTO organization_memberships(organization_id,person_id,role,status,joined_at,ended_at)
        VALUES($1,$2,$3,$4,'2026-01-02T03:04:05Z',$5)`, [f.organization.id, personId(i), i === 0 ? 'owner' : i === 1 ? 'administrator' : 'member',
        i === 2 ? 'left' : i === 3 ? 'removed' : 'active', i === 2 || i === 3 ? '2026-02-03T04:05:06Z' : null]);
    }
    const other = await new OrganizationStore(f.pool).create(f.actor, 'Other organization remains isolated');
    const first = await f.store.members(f.actor, f.organization.id.toUpperCase());
    const second = await f.store.members(f.actor, f.organization.id, first.nextCursor);
    assert.equal(first.members.length, 25); assert.equal(first.nextCursor, personId(23));
    assert.equal(second.members.length, 6); assert.equal(second.nextCursor, null);
    const rows = [...first.members, ...second.members];
    assert.deepEqual(rows.map(row => row.personId), [f.owner, ...Array.from({ length: 30 }, (_, i) => personId(i))]);
    assert.equal(rows.find(row => row.personId === personId(1))?.membershipStatus, 'active');
    assert.equal(rows.find(row => row.personId === personId(1))?.personStatus, 'suspended');
    assert.equal(rows.find(row => row.personId === personId(2))?.membershipStatus, 'left');
    assert.equal(rows.find(row => row.personId === personId(3))?.membershipStatus, 'removed');
    assert.equal(rows.find(row => row.personId === personId(2))?.endedAt, '2026-02-03T04:05:06.000Z');
    assert.equal(rows.find(row => row.personId === personId(4))?.endedAt, null);
    assert.deepEqual((await f.store.members(f.actor, other.id)).members.map(row => row.personId), [f.actor]);
    await f.pool.query("UPDATE organizations SET status='suspended' WHERE id=$1", [f.organization.id]);
    const { organization } = await f.store.detail(f.actor, f.organization.id);
    assert.equal(organization.status, 'suspended'); assert.equal(organization.createdByPersonId, f.owner);
    assert.equal(organization.activeMemberCount, 28); assert.equal(organization.activeOwnerCount, 2);
    assert.equal(organization.totalMembershipCount, 31); assert.equal(organization.totalInvitationCount, 0);
    assert.deepEqual(Object.keys(organization).sort(), ['activeMemberCount', 'activeOwnerCount', 'createdAt', 'createdByPersonId', 'id', 'name', 'status', 'totalInvitationCount', 'totalMembershipCount']);
    assert.equal((await f.store.members(f.actor, f.organization.id, personId(99))).members.length, 0);
  } finally { await f.close(); }
});

test('invitation paging preserves pending expiry, recorded decisions and revocation without exposing invitation credentials', live, async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 29; i++) {
      await f.pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [personId(i)]);
      const status = i === 0 || i > 3 ? 'pending' : i === 1 ? 'accepted' : i === 2 ? 'declined' : 'revoked';
      await f.pool.query(`INSERT INTO organization_invitations(id,organization_id,invited_person_id,invited_by,role,status,expires_at,created_at,decided_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,'2026-01-01T00:00:00Z',$8)`, [invitationId(i), f.organization.id, personId(i), f.owner,
        i % 2 ? 'administrator' : 'member', status, i === 0 || i === 3 ? '2020-01-01T00:00:00Z' : '2099-01-01T00:00:00Z',
        status === 'pending' ? null : '2026-01-02T00:00:00Z']);
    }
    const other = await new OrganizationStore(f.pool).create(f.actor, 'Invitation scope fixture');
    await f.pool.query(`INSERT INTO organization_invitations(id,organization_id,invited_person_id,invited_by,role,status,expires_at)
      VALUES($1,$2,$3,$4,'member','pending','2099-01-01T00:00:00Z')`, [randomUUID(), other.id, f.owner, f.actor]);
    const first = await f.store.invitations(f.actor, f.organization.id);
    const second = await f.store.invitations(f.actor, f.organization.id, first.nextCursor);
    assert.equal(first.invitations.length, 25); assert.equal(first.nextCursor, invitationId(24));
    assert.equal(second.nextCursor, null); assert.equal(second.invitations.length, 4);
    const rows = [...first.invitations, ...second.invitations];
    assert.deepEqual(rows.map(row => row.id), Array.from({ length: 29 }, (_, i) => invitationId(i)));
    assert.equal(rows[0]?.status, 'pending'); assert.equal(rows[0]?.pendingExpired, true); assert.equal(rows[0]?.decidedAt, null);
    assert.equal(rows[1]?.status, 'accepted'); assert.equal(rows[1]?.pendingExpired, false);
    assert.equal(rows[2]?.status, 'declined'); assert.equal(rows[3]?.status, 'revoked'); assert.equal(rows[3]?.pendingExpired, false);
    assert.equal(rows[4]?.pendingExpired, false); assert.equal(rows[3]?.decidedAt, '2026-01-02T00:00:00.000Z');
    assert.equal((await f.store.detail(f.actor, f.organization.id)).organization.totalInvitationCount, 29);
    assert.deepEqual(Object.keys(rows[0]!).sort(), ['createdAt', 'decidedAt', 'expiresAt', 'id', 'invitedByPersonId', 'pendingExpired', 'personId', 'role', 'status']);
  } finally { await f.close(); }
});

test('organization event paging is newest-first, scoped and safely labels unknown stored event types', live, async () => {
  const f = await fixture();
  try {
    const other = await new OrganizationStore(f.pool).create(f.actor, 'Other history');
    const ids: string[] = [];
    for (let i = 0; i < 31; i++) {
      const event = await f.pool.query<{ id: string }>(`INSERT INTO organization_events(organization_id,actor_person_id,target_person_id,action,occurred_at)
        VALUES($1,$2,$3,$4,'2026-01-01T00:00:00Z') RETURNING id`, [f.organization.id, f.owner, i % 2 ? f.owner : null,
        i === 30 ? 'private-provider-subject-canary@example.test' : i % 2 ? 'invitation.revoked' : 'membership.removed']);
      ids.push(event.rows[0]!.id);
    }
    const first = await f.store.events(f.actor, f.organization.id);
    const second = await f.store.events(f.actor, f.organization.id, first.nextCursor);
    assert.equal(first.events.length, 25); assert.equal(second.events.length, 7); assert.equal(second.nextCursor, null);
    const rows = [...first.events, ...second.events];
    assert.deepEqual(rows.slice(0, 31).map(row => row.id), [...ids].reverse());
    assert.equal(rows[0]?.action, 'organization.event'); assert.equal(rows[0]?.targetPersonId, null);
    assert.equal(rows[1]?.action, 'invitation.revoked'); assert.equal(rows[1]?.targetPersonId, f.owner);
    assert.equal(rows.at(-1)?.action, 'organization.created');
    assert.equal(JSON.stringify(rows).includes('private-provider-subject-canary'), false);
    assert.equal((await f.store.events(f.actor, other.id)).events.length, 1);
    assert.equal((await f.store.events(f.actor, f.organization.id, '1')).events.length, 0);
    assert.deepEqual(Object.keys(rows[0]!).sort(), ['action', 'actorPersonId', 'id', 'occurredAt', 'targetPersonId']);
  } finally { await f.close(); }
});

test('inspection cursor inputs are bounded and parameterized and every inspection remains read-only', live, async () => {
  const f = await fixture();
  try {
    await f.pool.query("INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES('https://iam-private.example.test','never-expose-this-subject',$1)", [f.owner]);
    const snapshot = async () => (await f.pool.query(`SELECT
      (SELECT row_to_json(o) FROM organizations o WHERE id=$1) AS organization,
      (SELECT json_agg(m ORDER BY m.person_id) FROM organization_memberships m WHERE organization_id=$1) AS members,
      (SELECT json_agg(i ORDER BY i.id) FROM organization_invitations i WHERE organization_id=$1) AS invitations,
      (SELECT json_agg(e ORDER BY e.id) FROM organization_events e WHERE organization_id=$1) AS events,
      (SELECT count(*) FROM operator_audit_events) AS operator_events`, [f.organization.id])).rows[0];
    const before = await snapshot();
    for (const after of [null, [], ['value'], 1, 'not-a-uuid', "'; SELECT pg_sleep(1);--", 'x'.repeat(1024)]) {
      await assert.rejects(f.store.members(f.actor, f.organization.id, after), rejected(400, 'invalid_admin_cursor'));
      await assert.rejects(f.store.invitations(f.actor, f.organization.id, after), rejected(400, 'invalid_admin_cursor'));
    }
    for (const after of [null, [], 1, '0', '-1', '01', '1.0', '9223372036854775808', '9'.repeat(1000), '1;SELECT 1', randomUUID()]) {
      await assert.rejects(f.store.events(f.actor, f.organization.id, after), rejected(400, 'invalid_admin_cursor'));
    }
    const read = await Promise.all([f.store.detail(f.actor, f.organization.id), f.store.members(f.actor, f.organization.id, ''),
      f.store.invitations(f.actor, f.organization.id, ''), f.store.events(f.actor, f.organization.id, '')]);
    assert(!JSON.stringify(read).includes('never-expose-this-subject'));
    assert(!JSON.stringify(read).includes('iam-private.example.test'));
    assert.deepEqual(await snapshot(), before);
  } finally { await f.close(); }
});
