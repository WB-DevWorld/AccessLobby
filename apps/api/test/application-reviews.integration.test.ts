import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { ApplicationStore } from '../src/applications.js';
import { ApplicationReviewStore } from '../src/application-reviews.js';
import { OperatorError, OperatorStore } from '../src/operators.js';
import { provisionApp, representation } from '../src/provision-app.js';

const enabled = { skip: !process.env.TEST_DATABASE_URL };
const knownError = (status: number, code: string) => (error: unknown) => error instanceof OperatorError && error.status === status && error.code === code;

async function fixture() {
  const database = await openIsolatedDatabase();
  const { pool } = database;
  const owner = randomUUID(), reviewer = randomUUID(), reader = randomUUID(), outsider = randomUUID();
  await pool.query("INSERT INTO persons(id,status) SELECT unnest($1::uuid[]),'active'", [[owner, reviewer, reader, outsider]]);
  await pool.query(`INSERT INTO platform_operator_roles(person_id,role,grant_reference)
    VALUES($1,'application_reviewer','fixture-reviewer'),($2,'support_reader','fixture-reader'),($3,'application_reviewer','fixture-owner')`, [reviewer, reader, owner]);
  const proofs = new Map<string, string[][]>();
  const lookupTxt = async (host: string) => proofs.get(host) ?? [];
  const apps = new ApplicationStore(pool, [], lookupTxt);
  const reviews = new ApplicationReviewStore(pool, new OperatorStore(pool));
  const requested = await apps.request(owner, { clientId: `review-${randomUUID()}`, name: 'Review example',
    redirectUri: 'https://review.example.test/callback', logoutUri: 'https://review.example.test/',
    visibility: 'hidden', admission: 'grant_required' });
  const verifyOrigin = async () => {
    proofs.set(requested.originVerificationHost, [[requested.originVerificationValue]]);
    await apps.verifyOrigin(owner, requested.id);
  };
  const input = async (decision: 'approved' | 'rejected' = 'approved', reference = 'review-acceptance') => ({
    decision, reference, configurationHash: (await reviews.detail(reviewer, requested.id)).application.configurationHash,
  });
  return { ...database, owner, reviewer, reader, outsider, apps, reviews, requested, verifyOrigin, input, lookupTxt };
}

test('operator app review is independent, bounded and cannot activate an application', enabled, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.reviews.list(f.outsider), knownError(403, 'operator_access_denied'));
    await assert.rejects(f.reviews.detail(f.outsider, f.requested.id), knownError(403, 'operator_access_denied'));
    await assert.rejects(f.reviews.record(f.reader, f.requested.id, await f.input()), knownError(403, 'operator_access_denied'));
    await assert.rejects(f.reviews.record(f.owner, f.requested.id, await f.input()), knownError(403, 'independent_reviewer_required'));
    await assert.rejects(f.reviews.record(f.reviewer, f.requested.id, await f.input()), knownError(409, 'origin_proof_required'));
    await assert.rejects(f.reviews.record(f.reviewer, f.requested.id, { ...await f.input(), reference: 'unsafe\nref' }), knownError(400, 'invalid_application_review'));
    await assert.rejects(f.reviews.list(f.reader, '', 'forged-cursor'), knownError(400, 'invalid_admin_cursor'));
    await assert.rejects(f.reviews.list(f.reader, 'x'.repeat(121)), knownError(400, 'invalid_admin_query'));
    await f.verifyOrigin();
    const input = await f.input();
    await f.reviews.record(f.reviewer, f.requested.id, input);
    const detail = await f.reviews.detail(f.reader, f.requested.id);
    assert.equal(detail.application.review?.decision, 'approved');
    assert.equal(detail.application.review?.configurationHash, detail.application.configurationHash);
    assert.equal(detail.application.status, 'requested');
    assert.equal(await f.apps.allowedClient(f.requested.clientId), false);
    assert.deepEqual((await f.reviews.list(f.reader, 'Review example')).applications.map(a => a.reviewDecision), ['approved']);
    assert.equal((await f.reviews.list(f.reader, '%')).applications.length, 0, 'Wildcards are literal search text');
    const json = JSON.stringify(detail);
    for (const forbidden of ['origin_challenge', 'subject', 'accessToken', 'iam_subject_links']) assert.ok(!json.includes(forbidden));
  } finally { await f.close(); }
});

test('concurrent identical review retries create one decision and audit; rejection cannot be bypassed', enabled, async () => {
  const f = await fixture();
  try {
    await f.verifyOrigin();
    const rejected = await f.input('rejected', 'review-rejected');
    await Promise.all(Array.from({ length: 8 }, () => f.reviews.record(f.reviewer, f.requested.id, rejected)));
    assert.equal((await f.pool.query('SELECT count(*) FROM application_reviews')).rows[0].count, '1');
    await assert.rejects(f.pool.query("UPDATE application_reviews SET decision='approved'"), /append-only/);
    await assert.rejects(f.pool.query('DELETE FROM application_reviews'), /append-only/);
    assert.equal((await f.pool.query("SELECT count(*) FROM operator_audit_events WHERE action='application.review_rejected'")).rows[0].count, '1');
    await assert.rejects(f.reviews.record(f.reviewer, f.requested.id, { ...rejected, decision: 'approved' }), knownError(409, 'review_already_recorded'));
    let iamCalls = 0;
    const options = { issuer: 'https://iam.example.test/realms/accesslobby-first-party', token: 'synthetic-private-token',
      lookupTxt: f.lookupTxt, fetcher: (async () => { iamCalls++; throw new Error('Unexpected IAM request'); }) as typeof fetch };
    await assert.rejects(provisionApp(f.pool, f.requested.id, '--activate-first-party', 'review-rejected', options), /Current independent approved/);
    assert.equal(iamCalls, 0);
    assert.equal(await f.apps.allowedClient(f.requested.clientId), false);
  } finally { await f.close(); }
});

test('configuration restoration, changed proof and revoked reviewer invalidate approval', enabled, async () => {
  const f = await fixture();
  try {
    await f.verifyOrigin();
    const input = await f.input();
    await f.reviews.record(f.reviewer, f.requested.id, input);
    await f.pool.query("UPDATE applications SET name='Changed application' WHERE id=$1", [f.requested.id]);
    await f.pool.query("UPDATE applications SET name='Review example' WHERE id=$1", [f.requested.id]);
    const changed = await f.reviews.detail(f.reviewer, f.requested.id);
    assert.notEqual(changed.application.configurationHash, input.configurationHash);
    assert.equal((await f.reviews.list(f.reader)).applications[0]?.reviewDecision, null);
    await assert.rejects(f.reviews.record(f.reviewer, f.requested.id, input), knownError(409, 'stale_application_review'));
    const options = { issuer: 'https://iam.example.test/realms/accesslobby-first-party', lookupTxt: f.lookupTxt,
      token: 'synthetic-private-token', fetcher: (async () => { throw new Error('Unexpected IAM request'); }) as typeof fetch };
    await assert.rejects(provisionApp(f.pool, f.requested.id, '--activate-first-party', input.reference, options), /Current independent approved/);
    await f.reviews.record(f.reviewer, f.requested.id, await f.input('approved', 'review-updated'));
    const finalInput = await f.input();
    await f.pool.query("UPDATE platform_operator_roles SET revoked_at=now(),revoke_reference='fixture-revoke' WHERE person_id=$1", [f.reviewer]);
    await assert.rejects(provisionApp(f.pool, f.requested.id, '--activate-first-party', 'review-updated', options), knownError(403, 'operator_access_denied'));
    await assert.rejects(f.reviews.record(f.reviewer, f.requested.id, finalInput), knownError(403, 'operator_access_denied'));
  } finally { await f.close(); }
});

test('only a current independent approval plus matching IAM readback permits activation', enabled, async () => {
  const f = await fixture();
  try {
    await f.verifyOrigin();
    let created: ReturnType<typeof representation> | undefined;
    let calls = 0;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      calls++;
      const address = String(url);
      if (address.includes('?clientId=')) return Response.json(created ? [{ id: 'fixture-client', clientId: created.clientId }] : []);
      if (init?.method === 'POST') { created = JSON.parse(String(init.body)); return new Response(null, { status: 201 }); }
      if (address.endsWith('/protocol-mappers/models')) return Response.json(created?.protocolMappers);
      return Response.json({ ...created, id: 'fixture-client' });
    }) as typeof fetch;
    const options = { issuer: 'https://iam.example.test/realms/accesslobby-first-party', token: 'synthetic-private-token', lookupTxt: f.lookupTxt, fetcher };
    await assert.rejects(provisionApp(f.pool, f.requested.id, '--activate-first-party', 'review-acceptance', options), /Current independent approved/);
    assert.equal(calls, 0);
    await f.reviews.record(f.reviewer, f.requested.id, await f.input());
    await assert.rejects(provisionApp(f.pool, f.requested.id, '--activate-first-party', 'unrecorded-reference', options), /Current independent approved/);
    assert.equal(calls, 0);
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.reviewer]);
    await assert.rejects(provisionApp(f.pool, f.requested.id, '--activate-first-party', 'review-acceptance', options), knownError(403, 'operator_access_denied'));
    assert.equal(calls, 0);
    await f.pool.query("UPDATE persons SET status='active' WHERE id=$1", [f.reviewer]);
    assert.equal((await provisionApp(f.pool, f.requested.id, '--activate-first-party', 'review-acceptance', options)).status, 'active');
    assert.equal(await f.apps.allowedClient(f.requested.clientId), true);
    const audit = await f.pool.query("SELECT action FROM operator_audit_events ORDER BY id");
    assert.deepEqual(audit.rows.map(row => row.action), ['application.review_approved', 'application.activated_private']);
  } finally { await f.close(); }
});


test('application review listing paginates actual registry data and rejects stale owner state', enabled, async () => {
  const f = await fixture();
  try {
    for (let index = 0; index < 27; index++) {
      await f.pool.query(`INSERT INTO applications(id,client_id,name,owner_person_id,redirect_uri,logout_uri,visibility,admission,origin_challenge)
        VALUES($1,$2,'Directory example',$3,'https://directory.example.test/callback','https://directory.example.test/','hidden','grant_required','fixture-challenge')`,
        [randomUUID(), `directory-${randomUUID()}`, f.owner]);
    }
    const first = await f.reviews.list(f.reader);
    assert.equal(first.applications.length, 25);
    assert.ok(first.nextCursor);
    const second = await f.reviews.list(f.reader, undefined, first.nextCursor);
    assert.equal(second.applications.length, 3);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.applications, ...second.applications].map(app => app.id)).size, 28);
    assert.equal((await f.reviews.list(f.reader, "' OR true --")).applications.length, 0);
    await f.verifyOrigin();
    const input = await f.input();
    await f.pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [f.owner]);
    await assert.rejects(f.reviews.record(f.reviewer, f.requested.id, input), knownError(409, 'application_review_unavailable'));
  } finally { await f.close(); }
});
