import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import { PersonControlStore } from '../src/person-controls.js';
import { isCurrentPersonAuthentication, PostgresIdentityStore } from '../src/identity.js';
import { PeerSessions, PeerSessionError } from '../src/peer-sessions.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const rejected = (code: string) => (error: unknown) => error instanceof OperatorError && error.code === code;

async function fixture() {
  const database = await openIsolatedDatabase();
  const { pool } = database;
  const actor = randomUUID(), target = randomUUID(), reader = randomUUID();
  for (const id of [actor, target, reader]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [id]);
  await manageOperatorRole(pool, actor, 'grant', 'identity_operator', 'person-fixture-operator');
  await manageOperatorRole(pool, reader, 'grant', 'support_reader', 'person-fixture-reader');
  const controls = new PersonControlStore(pool, new OperatorStore(pool));
  return { ...database, actor, target, reader, controls };
}

test('authentication cutoff is strict only after lifecycle transitions', () => {
  assert.equal(isCurrentPersonAuthentication({}, {}), true);
  assert.equal(isCurrentPersonAuthentication({ sessionNotBefore: 100 }, { issuedAt: 99 }), false);
  assert.equal(isCurrentPersonAuthentication({ sessionNotBefore: 100 }, {}), false);
  assert.equal(isCurrentPersonAuthentication({ sessionNotBefore: 100 }, { issuedAt: 100 }), true);
  assert.equal(isCurrentPersonAuthentication({ sessionNotBefore: 100 }, { issuedAt: 101 }), true);
  assert.equal(isCurrentPersonAuthentication({ sessionNotBefore: Number.NaN }, { issuedAt: 101 }), false);
});

test('person inspection is explicit and administration refuses readers, self, protected targets and malformed/stale requests', enabled, async () => {
  const f = await fixture();
  try {
    const body = { status: 'suspended', reference: 'person-security-review', expectedVersion: '0' };
    await assert.rejects(f.controls.detail(f.target, f.reader), rejected('operator_access_denied'));
    const detail = await f.controls.detail(f.reader, f.target);
    assert.equal(detail.person.id, f.target); assert.equal(detail.person.statusVersion, '0');
    assert.equal(detail.person.protectedOperator, false);
    assert(!JSON.stringify(detail).includes('sessionNotBefore'));
    await assert.rejects(f.controls.change(f.reader, f.target, body), rejected('operator_access_denied'));
    await assert.rejects(f.controls.change(f.actor, f.actor, body), rejected('self_status_change_forbidden'));
    await assert.rejects(f.controls.change(f.actor, f.reader, body), rejected('protected_operator_person'));
    for (const input of [null, [], { ...body, expectedVersion: -1 }, { ...body, expectedVersion: '00' },
      { ...body, reference: 'free text is refused' }, { ...body, role: 'admin' }, { ...body, status: 'deleted' }]) {
      await assert.rejects(f.controls.change(f.actor, f.target, input), rejected('invalid_person_change'));
    }
    await assert.rejects(f.controls.change(f.actor, f.target, { ...body, expectedVersion: '1' }), rejected('stale_person_change'));
    await manageOperatorRole(f.pool, f.actor, 'revoke', 'identity_operator', 'person-authority-revoked');
    await assert.rejects(f.controls.change(f.actor, f.target, body), rejected('operator_access_denied'));
    assert.equal((await f.pool.query('SELECT status FROM persons WHERE id=$1', [f.target])).rows[0].status, 'active');
  } finally { await f.close(); }
});

test('concurrent identical person changes are idempotent and a later transition defeats stale replay', enabled, async () => {
  const f = await fixture();
  try {
    const suspend = { status: 'suspended', reference: 'person-idempotent-suspend', expectedVersion: '0' };
    const results = await Promise.all(Array.from({ length: 8 }, () => f.controls.change(f.actor, f.target, suspend)));
    assert.equal(results.filter(result => result.changed).length, 1);
    assert(results.every(result => result.person.statusVersion === '1'));
    const after = await f.controls.detail(f.actor, f.target);
    assert.equal(after.person.status, 'suspended');
    const resume = await f.controls.change(f.actor, f.target, { status: 'active', reference: 'person-idempotent-resume', expectedVersion: '1' });
    assert.equal(resume.person.statusVersion, '2');
    await assert.rejects(f.controls.change(f.actor, f.target, suspend), rejected('stale_person_change'));
    const events = await f.pool.query('SELECT action FROM operator_audit_events WHERE target_id=$1 AND action LIKE $2 ORDER BY id', [f.target, 'person.%']);
    assert.deepEqual(events.rows.map(row => row.action), ['person.suspended', 'person.reenabled']);
  } finally { await f.close(); }
});

test('suspension and resume preserve identity relationships while old bearers and peer receipts stay ended', enabled, async () => {
  const f = await fixture();
  try {
    const issuer = `https://person-fixture.example/${randomUUID()}`, subject = randomUUID(), organization = randomUUID();
    const actor = { issuer, subject, client: 'person-peer', sid: randomUUID(),
      issuedAt: Math.floor(Date.now() / 1000) - 1, expiresAt: Math.floor(Date.now() / 1000) + 300 };
    await f.pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3)', [issuer, subject, f.target]);
    await f.pool.query("INSERT INTO organizations(id,name,created_by) VALUES($1,'Retained organization',$2)", [organization, f.target]);
    await f.pool.query("INSERT INTO organization_memberships(organization_id,person_id,role,status) VALUES($1,$2,'owner','active')", [organization, f.target]);
    const identities = new PostgresIdentityStore(f.pool), peers = new PeerSessions(f.pool, issuer, async () => true);
    const receipt = await peers.issue(actor, f.target);
    assert.equal((await peers.status(receipt.receipt, actor.client)).active, true);
    await f.controls.change(f.actor, f.target, { status: 'suspended', reference: 'person-receipt-suspend', expectedVersion: '0' });
    await assert.rejects(peers.status(receipt.receipt, actor.client), PeerSessionError);
    await f.controls.change(f.actor, f.target, { status: 'active', reference: 'person-receipt-resume', expectedVersion: '1' });
    const person = await identities.resolve(actor);
    assert.equal(person.id, f.target); assert.equal(person.status, 'active');
    assert(person.sessionNotBefore! > actor.issuedAt);
    assert.equal(isCurrentPersonAuthentication(person, actor), false);
    await assert.rejects(peers.issue(actor, f.target), PeerSessionError);
    await assert.rejects(peers.status(receipt.receipt, actor.client), PeerSessionError);
    const fresh = { ...actor, issuedAt: person.sessionNotBefore };
    assert.equal(isCurrentPersonAuthentication(person, fresh), true);
    const next = await peers.issue(fresh, f.target);
    assert.equal((await peers.status(next.receipt, actor.client)).active, true);
    assert.equal((await f.pool.query('SELECT person_id FROM iam_subject_links WHERE issuer=$1 AND subject=$2', [issuer, subject])).rows[0].person_id, f.target);
    assert.equal((await f.pool.query('SELECT status,role FROM organization_memberships WHERE organization_id=$1', [organization])).rows[0].role, 'owner');
    assert.equal((await f.controls.detail(f.actor, f.target)).person.organizationCount, 1);
  } finally { await f.close(); }
});

test('person transition and receipt invalidation roll back together if the audit insert fails', enabled, async () => {
  const f = await fixture();
  try {
    const actor = { issuer: 'https://person-rollback.example', subject: randomUUID(), client: 'person-peer', sid: randomUUID(), expiresAt: Math.floor(Date.now() / 1000) + 300 };
    const peers = new PeerSessions(f.pool, actor.issuer, async () => true);
    const receipt = await peers.issue(actor, f.target);
    await f.pool.query(`CREATE FUNCTION fail_person_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action LIKE 'person.%' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_person_audit BEFORE INSERT ON operator_audit_events FOR EACH ROW EXECUTE FUNCTION fail_person_audit();`);
    await assert.rejects(f.controls.change(f.actor, f.target, { status: 'suspended', reference: 'person-audit-failure', expectedVersion: '0' }));
    const state = await f.pool.query('SELECT status,status_version,session_not_before FROM persons WHERE id=$1', [f.target]);
    assert.deepEqual(state.rows[0], { status: 'active', status_version: '0', session_not_before: '0' });
    assert.equal((await peers.status(receipt.receipt, actor.client)).active, true);
  } finally { await f.close(); }
});

test('a concurrent private operator grant and person suspension cannot leave a suspended operator grant', enabled, async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 8; i++) {
      const target = randomUUID(); await f.pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [target]);
      const results = await Promise.allSettled([
        f.controls.change(f.actor, target, { status: 'suspended', reference: 'person-race-suspend', expectedVersion: '0' }),
        manageOperatorRole(f.pool, target, 'grant', 'support_reader', 'person-race-grant'),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const state = (await f.pool.query(`SELECT p.status,EXISTS(SELECT 1 FROM platform_operator_roles r WHERE r.person_id=p.id AND r.revoked_at IS NULL) AS granted
        FROM persons p WHERE p.id=$1`, [target])).rows[0];
      assert.equal(state.granted, state.status === 'active');
      for (const result of results) if (result.status === 'rejected') {
        assert(result.reason instanceof OperatorError);
        assert(['active_operator_person_required', 'protected_operator_person'].includes(result.reason.code));
      }
    }
  } finally { await f.close(); }
});
