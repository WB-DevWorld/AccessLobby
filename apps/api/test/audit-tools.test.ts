import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AuditToolsStore, auditCsvCell, auditEventsCsv, auditExportLimit, parseAuditQuery } from '../src/audit-tools.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { manageOperatorRole } from '../src/manage-operator.js';
import { openIsolatedDatabase } from './isolated-database.js';

const live = { skip: !process.env.TEST_DATABASE_URL };
const denied = (code: string) => (error: unknown) => error instanceof OperatorError && error.code === code;

test('audit queries reject structured, duplicate-shaped, unknown, oversized and invalid calendar input', () => {
  assert.deepEqual(parseAuditQuery(undefined), {});
  assert.deepEqual(parseAuditQuery(Object.assign(Object.create(null), { reference: 'plain-query' })), { reference: 'plain-query' });
  assert.deepEqual(parseAuditQuery({ reference: '  accepted_ref  ', action: 'application.activation_job.retried',
    from: '2026-02-28', to: '2026-03-01', after: '9223372036854775807' }), {
    reference: 'accepted_ref', action: 'application.activation_job.retried', from: '2026-02-28', to: '2026-03-01', after: '9223372036854775807',
  });
  for (const query of [null, [], new Map(), new URLSearchParams('action=application.suspended'), 'action=application.suspended', { action: ['application.suspended'] },
    { unknown: '' }, { actorPersonId: {} }, { targetId: 'not-an-id' }, { action: 'realm.delete' },
    { action: "application.suspended' OR true--" }, { reference: '\nprivate' }, { reference: 'x'.repeat(121) },
    { from: '2026-02-29' }, { from: '0000-01-01' }, { to: '2026-13-01' }, { from: '2026-11-29', to: '2026-11-28' },
    { after: '0' }, { after: '-1' }, { after: '9223372036854775808' }, { after: ['12', '13'] }]) {
    assert.throws(() => parseAuditQuery(query), OperatorError);
  }
  const id = randomUUID();
  assert.equal(parseAuditQuery({ actorPersonId: id.toUpperCase(), targetId: id.toUpperCase() }).actorPersonId, id);
});

test('CSV quotes every field and neutralizes formula prefixes after whitespace or controls', () => {
  for (const expression of ['=1+1', '+cmd', '-12', '@SUM(A1:A2)', '  =1', '\t+cmd', '\r\n-3', '\u0000@cmd', '\u200b=1', '\ufeff=1']) {
    assert.equal(auditCsvCell(expression), `"'${expression}"`);
  }
  assert.equal(auditCsvCell('ordinary,"quoted"\r\nvalue'), '"ordinary,""quoted""\r\nvalue"');
  assert.equal(auditCsvCell(null), '""');
  const csv = auditEventsCsv([{ id: '1', occurredAt: '2026-11-28T12:00:00.000Z', actorPersonId: null,
    action: 'application.suspended', targetType: 'application', targetId: randomUUID(), reference: '-formula-reference' }]);
  assert.ok(csv.startsWith('"id","occurredAt","action","actorPersonId","targetType","targetId","reference"\r\n'));
  assert.ok(csv.includes('"\'-formula-reference"\r\n'));
  assert.equal(auditEventsCsv([]).split('\r\n').length, 2);
});

async function fixture() {
  const db = await openIsolatedDatabase();
  const reader = randomUUID(), outsider = randomUUID(), actor = randomUUID(), target = randomUUID();
  await db.pool.query("INSERT INTO persons(id,status) SELECT unnest($1::uuid[]),'active'", [[reader, outsider, actor]]);
  await manageOperatorRole(db.pool, reader, 'grant', 'support_reader', 'audit-fixture-reader');
  // Scope the deterministic fixture away from its private role-grant event.
  const store = new AuditToolsStore(db.pool, new OperatorStore(db.pool));
  return { ...db, reader, outsider, actor, target, store };
}

test('audit filters use exact IDs/actions, literal references and inclusive UTC days while preserving cursor order', live, async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 32; i++) {
      await f.pool.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference,occurred_at)
        VALUES($1,'application.suspended','application',$2,$3,$4::timestamptz)`,
      [f.actor, i === 0 ? f.target.toUpperCase() : f.target, i === 0 ? 'case_ref_100' : 'case-ref-100', i === 0 ? '2026-11-28T00:00:00Z' : '2026-11-28T23:59:59.999999Z']);
    }
    await f.pool.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference,occurred_at)
      VALUES($1,'application.suspended','application',$2,'case-ref-100','2026-11-29T00:00:00Z'),
      ($1,'person.suspended','person',$2,'case-ref-100','2026-11-27T23:59:59.999999Z')`, [f.actor, f.target]);
    const filter = { action: 'application.suspended', actorPersonId: f.actor, targetId: f.target, from: '2026-11-28', to: '2026-11-28' };
    const page = await f.store.list(f.reader, filter);
    assert.equal(page.events.length, 25); assert.ok(page.nextCursor);
    const next = await f.store.list(f.reader, { ...filter, after: page.nextCursor! });
    assert.equal(next.events.length, 7); assert.equal(next.nextCursor, null);
    const combined = [...page.events, ...next.events];
    assert.equal(new Set(combined.map(row => row.id)).size, 32);
    assert.ok(combined.every(row => row.occurredAt.startsWith('2026-11-28')));
    assert.ok(combined.every((row, i) => !i || BigInt(row.id) < BigInt(combined[i - 1]!.id)));
    assert.equal((await f.store.list(f.reader, { ...filter, reference: 'case_ref' })).events.length, 1);
    assert.equal((await f.store.list(f.reader, { ...filter, reference: '%' })).events.length, 0);
    assert.equal((await f.store.list(f.reader, { ...filter, reference: "' OR true --" })).events.length, 0);
    assert.equal((await f.store.list(f.reader, { ...filter, actorPersonId: randomUUID() })).events.length, 0);
    assert.deepEqual(Object.keys(combined[0]!).sort(), ['action', 'actorPersonId', 'id', 'occurredAt', 'reference', 'targetId', 'targetType']);
  } finally { await f.close(); }
});

test('every audit read/export checks current person and roles; bounded exports neither mutate history nor expose private stores', live, async () => {
  const f = await fixture();
  try {
    await f.pool.query("INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES('https://never-export-issuer.invalid','never-export-provider-subject',$1)", [f.reader]);
    await f.pool.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
      SELECT $1::uuid,'person.suspended','person',$2,'export-fixture' FROM generate_series(1,1005)`, [f.actor, f.target]);
    const before = (await f.pool.query('SELECT count(*) FROM operator_audit_events')).rows[0].count;
    const exported = await f.store.export(f.reader, { reference: 'export-fixture' });
    assert.equal(exported.count, auditExportLimit); assert.equal(exported.truncated, true);
    assert.equal(exported.csv.split('\r\n').length, 1002);
    assert.equal(exported.csv.includes('never-export'), false);
    assert.equal((await f.pool.query('SELECT count(*) FROM operator_audit_events')).rows[0].count, before);
    const empty = await f.store.export(f.reader, { reference: 'nothing-matches' });
    assert.equal(empty.count, 0); assert.equal(empty.truncated, false);
    for (const operation of ['list', 'export'] as const) {
      await assert.rejects(f.store[operation](f.outsider, {}), denied('operator_access_denied'));
    }
    await manageOperatorRole(f.pool, f.reader, 'revoke', 'support_reader', 'audit-fixture-revoke');
    await assert.rejects(f.store.export(f.reader, {}), denied('operator_access_denied'));
    await manageOperatorRole(f.pool, f.reader, 'grant', 'support_reader', 'audit-fixture-regrant');
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.reader]);
    await assert.rejects(f.store.list(f.reader, {}), denied('operator_access_denied'));
    await assert.rejects(f.store.export(f.reader, {}), denied('operator_access_denied'));
  } finally { await f.close(); }
});

test('export rechecks locked authority after its initial check, closing a concurrent revocation window', live, async () => {
  const f = await fixture();
  let checked = false;
  const gate = new OperatorStore(f.pool);
  const original = gate.require.bind(gate);
  gate.require = async (...args) => {
    const result = await original(...args);
    if (!checked) { checked = true; await manageOperatorRole(f.pool, f.reader, 'revoke', 'support_reader', 'audit-concurrent-revoke'); }
    return result;
  };
  try {
    const guarded = new AuditToolsStore(f.pool, gate);
    await assert.rejects(guarded.export(f.reader, {}), denied('operator_access_denied'));
    assert.equal(checked, true);
  } finally { await f.close(); }
});
