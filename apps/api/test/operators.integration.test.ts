import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import { OrganizationStore } from '../src/organizations.js';

const live = { skip: !process.env.TEST_DATABASE_URL };
const rejected = (status: number, code: string) => (error: unknown) =>
  error instanceof OperatorError && error.status === status && error.code === code;

test('platform authority is explicit, current, least-privilege and independent of organization ownership', live, async () => {
  const { pool, close } = await openIsolatedDatabase();
  const store = new OperatorStore(pool);
  const [reader, reviewer, owner] = [randomUUID(), randomUUID(), randomUUID()];
  try {
    for (const person of [reader, reviewer, owner]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
    await new OrganizationStore(pool).create(owner!, 'Organization owner is not a platform operator');
    for (const person of [reader!, reviewer!, owner!, randomUUID()]) {
      await assert.rejects(store.access(person), rejected(403, 'operator_access_denied'));
      await assert.rejects(store.people(person), rejected(403, 'operator_access_denied'));
      await assert.rejects(store.organizations(person), rejected(403, 'operator_access_denied'));
      await assert.rejects(store.audit(person), rejected(403, 'operator_access_denied'));
    }
    await manageOperatorRole(pool, reader, 'grant', 'support_reader', 'owner-reviewed-101');
    assert.deepEqual(await store.access(reader!), { contract: 'accesslobby.admin.v0.1', roles: ['support_reader'],
      capabilities: { read: true, reviewApplications: false, managePeople: false, activateApplications: false } });
    await assert.rejects(store.require(reader!, 'review'), rejected(403, 'operator_access_denied'));
    await manageOperatorRole(pool, reviewer, 'grant', 'application_reviewer', 'owner-reviewed-102');
    assert.deepEqual(await store.require(reviewer!, 'review'), ['application_reviewer']);
    assert.equal((await store.people(reviewer!)).people.length, 3);
    await manageOperatorRole(pool, reader, 'revoke', 'support_reader', 'owner-reviewed-103');
    await assert.rejects(store.access(reader!), rejected(403, 'operator_access_denied'));
    await pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [reviewer]);
    await assert.rejects(store.require(reviewer!, 'review'), rejected(403, 'operator_access_denied'));
    await assert.rejects(store.people(reviewer!), rejected(403, 'operator_access_denied'));
    await assert.rejects(manageOperatorRole(pool, reviewer, 'grant', 'support_reader', 'owner-reviewed-104'),
      rejected(404, 'active_operator_person_required'));
    // A suspended person can be offboarded without temporarily reactivating them.
    assert.equal((await manageOperatorRole(pool, reviewer, 'revoke', 'application_reviewer', 'owner-reviewed-105')).changed, true);
    await pool.query("UPDATE persons SET status='active' WHERE id=$1", [reviewer]);
    await assert.rejects(store.access(reviewer!), rejected(403, 'operator_access_denied'));
    const events = await pool.query('SELECT actor_person_id, action, target_id, reference FROM operator_audit_events ORDER BY id');
    assert.deepEqual(events.rows.map(row => row.action), ['operator.role.support_reader.granted',
      'operator.role.application_reviewer.granted', 'operator.role.support_reader.revoked', 'operator.role.application_reviewer.revoked']);
    assert.ok(events.rows.every(row => row.actor_person_id === null));
    assert.equal(events.rows[0].target_id, reader);
    assert.equal(events.rows[0].reference, 'owner-reviewed-101');
  } finally { await close(); }
});

test('directory searches are bounded, parameterized and paginated without exposing provider information', live, async () => {
  const { pool, close } = await openIsolatedDatabase();
  const store = new OperatorStore(pool);
  const operator = randomUUID();
  const people = Array.from({ length: 30 }, (_, i) => `11111111-0000-4000-8000-${String(i).padStart(12, '0')}`);
  const organizations = Array.from({ length: 30 }, (_, i) => `22222222-0000-4000-8000-${String(i).padStart(12, '0')}`);
  try {
    await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [operator]);
    await manageOperatorRole(pool, operator, 'grant', 'support_reader', 'directory-review-1');
    for (const person of people) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
    await pool.query("INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES('https://private-issuer.invalid','never-return-this-provider-subject',$1)", [people[0]]);
    for (let i = 0; i < organizations.length; i++) {
      await pool.query("INSERT INTO organizations(id,name,created_by) VALUES($1,$2,$3)",
        [organizations[i], i === 0 ? 'CETECH 100%_tools\\Ghana' : `CETECH team ${i}`, people[0]]);
      await pool.query("INSERT INTO organization_memberships(organization_id,person_id,role,status) VALUES($1,$2,'owner','active')",
        [organizations[i], people[0]]);
    }
    await pool.query("INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,visibility,admission,origin_challenge) VALUES($1,'directory-app','Directory app',$2,'https://directory.invalid/callback','https://directory.invalid/','hidden','grant_required','proof')", [randomUUID(), people[0]]);
    const first = await store.people(operator, '1111');
    assert.equal(first.people.length, 25);
    assert.equal(first.nextCursor, people[24]);
    const second = await store.people(operator, '1111', first.nextCursor);
    assert.deepEqual([...first.people, ...second.people].map(p => p.id), people);
    assert.equal(second.nextCursor, null);
    const exact = await store.people(operator, people[0]!.toUpperCase());
    assert.equal(exact.people[0]?.organizationCount, 30);
    assert.equal(exact.people[0]?.applicationCount, 1);
    assert.equal(exact.people.length, 1);
    assert.deepEqual(Object.keys(exact.people[0]!).sort(), ['applicationCount', 'createdAt', 'id', 'organizationCount', 'status']);
    assert.equal(JSON.stringify(exact).includes('never-return-this-provider-subject'), false);
    const orgFirst = await store.organizations(operator, 'cEtEcH');
    const orgNext = await store.organizations(operator, 'cetech', orgFirst.nextCursor);
    assert.deepEqual([...orgFirst.organizations, ...orgNext.organizations].map(o => o.id), organizations);
    assert.equal(orgFirst.organizations[0]?.memberCount, 1);
    assert.equal(orgFirst.organizations[0]?.ownerCount, 1);
    assert.equal(orgNext.nextCursor, null);
    assert.deepEqual((await store.organizations(operator, '%_')).organizations.map(o => o.id), [organizations[0]]);
    assert.deepEqual((await store.organizations(operator, '\\')).organizations.map(o => o.id), [organizations[0]]);
    assert.equal((await store.organizations(operator, "' OR 1=1 --")).organizations.length, 0);
    assert.equal((await store.organizations(operator, organizations[5])).organizations[0]?.id, organizations[5]);
    await pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [people[0]]);
    const current = await store.organizations(operator, organizations[0]);
    assert.equal(current.organizations[0]?.memberCount, 0);
    assert.equal(current.organizations[0]?.ownerCount, 0);
    for (const q of ['%', 'abc', "' OR 1=1", [], null, 'a'.repeat(121), '1111\n']) {
      await assert.rejects(store.people(operator, q), rejected(400, 'invalid_admin_search'));
    }
    for (const q of [[], null, 'x'.repeat(121), '\u0000']) {
      await assert.rejects(store.organizations(operator, q), rejected(400, 'invalid_admin_search'));
    }
    for (const after of ['not-an-id', [], null, '0; SELECT 1']) {
      await assert.rejects(store.people(operator, '', after), rejected(400, 'invalid_admin_cursor'));
      await assert.rejects(store.organizations(operator, '', after), rejected(400, 'invalid_admin_cursor'));
    }
  } finally { await close(); }
});

test('protected role changes are idempotent under concurrency and fail atomically if audit recording fails', live, async () => {
  const { pool, close } = await openIsolatedDatabase();
  const actor = randomUUID(), target = randomUUID();
  try {
    for (const person of [actor, target]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
    const changes = await Promise.all(Array.from({ length: 8 }, () =>
      manageOperatorRole(pool, actor, 'grant', 'application_reviewer', 'bootstrap-duplicate')));
    assert.equal(changes.filter(c => c.changed).length, 1);
    assert.equal((await pool.query('SELECT * FROM operator_audit_events')).rowCount, 1);
    await pool.query("ALTER TABLE operator_audit_events ADD CONSTRAINT reject_test_grant CHECK(action <> 'operator.role.support_reader.granted') NOT VALID");
    await assert.rejects(manageOperatorRole(pool, target, 'grant', 'support_reader', 'atomic-audit-1'));
    assert.equal((await pool.query('SELECT * FROM platform_operator_roles WHERE person_id=$1', [target])).rowCount, 0);
    await pool.query('ALTER TABLE operator_audit_events DROP CONSTRAINT reject_test_grant');
    const invalid: unknown[][] = [
      [target, 'grant', 'owner', 'reference-123'], [target, 'grant', 'support_reader', 'abc'],
      [target, 'grant', 'support_reader', 'contains spaces'], [target, 'promote', 'support_reader', 'reference-123'],
      ['not-a-person', 'grant', 'support_reader', 'reference-123'],
    ];
    for (const args of invalid) await assert.rejects(manageOperatorRole(pool, args[0], args[1], args[2], args[3]),
      rejected(400, 'invalid_operator_role_change'));
    await assert.rejects(manageOperatorRole(pool, randomUUID(), 'grant', 'support_reader', 'reference-123'),
      rejected(404, 'active_operator_person_required'));
    const store = new OperatorStore(pool);
    for (let i = 0; i < 30; i++) {
      await manageOperatorRole(pool, target, i % 2 ? 'revoke' : 'grant', 'support_reader', `audit-${i}`);
    }
    const first = await store.audit(actor);
    assert.equal(first.events.length, 25);
    assert.notEqual(first.nextCursor, null);
    const second = await store.audit(actor, first.nextCursor);
    assert.equal(second.events.length, 6);
    assert.equal(second.nextCursor, null);
    const ids = [...first.events, ...second.events].map(event => BigInt(event.id));
    assert.equal(new Set(ids).size, 31);
    assert.ok(ids.every((id, i) => i === 0 || id < ids[i - 1]!));
    for (const after of ['0', '-1', '1 OR 1=1', '9223372036854775808', [], null]) {
      await assert.rejects(store.audit(actor, after), rejected(400, 'invalid_admin_cursor'));
    }
  } finally { await close(); }
});
