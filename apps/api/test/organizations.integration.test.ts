import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pool } from 'pg';
import { OrganizationStore, OrganizationError } from '../src/organizations.js';

test('personal identity, membership invitation, role transfer and isolation', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const store = new OrganizationStore(pool);
  const owner = crypto.randomUUID();
  const member = crypto.randomUUID();
  const outsider = crypto.randomUUID();
  const forbidden = (code: string) => (error: unknown) => error instanceof OrganizationError && error.code === code;
  try {
    for (const id of [owner, member, outsider]) await pool.query("INSERT INTO persons(id, status) VALUES ($1, 'active')", [id]);
    assert.deepEqual((await store.list(owner)).contexts, [{ type: 'personal' }]);
    const org = await store.create(owner, 'Example cooperative');
    const other = await store.create(outsider, 'Different organization');
    assert.equal(org.role, 'owner');
    assert.equal((await store.list(owner)).contexts.length, 2);
    assert.equal((await store.list(member)).contexts.length, 1);
    await assert.rejects(store.detail(outsider, org.id), forbidden('organization_not_found'));
    await assert.rejects(store.invite(outsider, org.id, member, 'member'), forbidden('organization_not_found'));
    await assert.rejects(store.leaveOrRemove(owner, org.id, owner), forbidden('last_owner'));
    await assert.rejects(store.invite(owner, org.id, crypto.randomUUID(), 'member'), forbidden('person_not_found'));
    const invite = await store.invite(owner, org.id, member, 'member');
    await assert.rejects(store.invite(owner, org.id, member, 'member'), forbidden('invitation_pending'));
    assert.equal((await store.list(member)).invitations[0]?.id, invite.id);
    await assert.rejects(store.respond(outsider, invite.id, true), forbidden('invitation_not_found'));
    await store.respond(member, invite.id, true);
    await assert.rejects(store.respond(member, invite.id, true), forbidden('invitation_not_found'));
    assert.equal((await store.list(member)).contexts.length, 2);
    await assert.rejects(store.invite(member, org.id, outsider, 'member'), forbidden('membership_permission_denied'));
    await assert.rejects(store.changeRole(member, org.id, member, 'owner'), forbidden('membership_permission_denied'));
    await assert.rejects(store.detail(member, other.id), forbidden('organization_not_found'));
    await store.changeRole(owner, org.id, member, 'owner');
    await store.leaveOrRemove(owner, org.id, owner);
    assert.equal((await store.list(owner)).contexts.length, 1);
    assert.equal((await store.detail(member, org.id)).members.length, 1);
    await assert.rejects(store.leaveOrRemove(member, org.id, member), forbidden('last_owner'));
    const audit = await pool.query<{ action: string }>('SELECT action FROM organization_events WHERE organization_id = $1 ORDER BY id', [org.id]);
    assert.deepEqual(audit.rows.map(row => row.action), [
      'organization.created', 'invitation.created', 'invitation.accepted', 'membership.role.owner', 'membership.left'
    ]);
  } finally { await pool.end(); }
});

test('invitation lifecycle, administrator limits and rejoining after removal', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const store = new OrganizationStore(pool);
  const [owner, admin, member] = Array.from({ length: 3 }, () => crypto.randomUUID()) as [string, string, string];
  const forbidden = (code: string) => (error: unknown) => error instanceof OrganizationError && error.code === code;
  try {
    for (const id of [owner, admin, member]) await pool.query("INSERT INTO persons(id, status) VALUES ($1, 'active')", [id]);
    const org = await store.create(owner, 'Example team');
    const first = await store.invite(owner, org.id, admin, 'administrator');
    await store.respond(admin, first.id, false);
    const second = await store.invite(owner, org.id, admin, 'administrator');
    await store.respond(admin, second.id, true);
    await assert.rejects(store.invite(admin, org.id, member, 'administrator'), forbidden('membership_permission_denied'));
    const revoked = await store.invite(admin, org.id, member, 'member');
    await store.revoke(admin, org.id, revoked.id);
    await assert.rejects(store.respond(member, revoked.id, true), forbidden('invitation_not_found'));
    const expired = await store.invite(owner, org.id, member, 'member');
    await pool.query("UPDATE organization_invitations SET expires_at = now() - interval '1 second' WHERE id = $1", [expired.id]);
    await assert.rejects(store.respond(member, expired.id, true), forbidden('invitation_not_found'));
    const renewed = await store.invite(admin, org.id, member, 'member');
    await store.respond(member, renewed.id, true);
    await assert.rejects(store.leaveOrRemove(admin, org.id, owner), forbidden('membership_permission_denied'));
    await store.leaveOrRemove(admin, org.id, member);
    assert.equal((await store.list(member)).contexts.length, 1);
    const rejoin = await store.invite(owner, org.id, member, 'member');
    await store.respond(member, rejoin.id, true);
    assert.equal((await store.list(member)).contexts.length, 2);
  } finally { await pool.end(); }
});
