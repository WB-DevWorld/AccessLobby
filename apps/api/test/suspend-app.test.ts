import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { ApplicationStore } from '../src/applications.js';
import { proofValue } from '../src/origin-proof.js';
import { disableIamClient, suspendRegistry } from '../src/suspend-app.js';

test('private IAM suspension disables and reads back the exact client, retrying safely', async () => {
  let enabled = true, puts = 0;
  const base = 'http://iam:8080/admin/realms/accesslobby-first-party/clients';
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer scoped-token');
    if (String(url) === `${base}?clientId=my-app`) return Response.json([{ id: 'kc-id', clientId: 'my-app' }]);
    if (String(url) === `${base}/kc-id` && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      assert.equal(body.clientId, 'my-app');
      assert.equal(body.enabled, false);
      puts++; enabled = false;
      return new Response(null, { status: 204 });
    }
    if (String(url) === `${base}/kc-id`) return Response.json({ id: 'kc-id', clientId: 'my-app', enabled });
    throw new Error(`Unexpected IAM URL ${url}`);
  }) as typeof fetch;
  assert.equal(await disableIamClient('http://iam:8080', 'accesslobby-first-party', 'scoped-token', 'my-app', fakeFetch), 'disabled');
  assert.equal(await disableIamClient('http://iam:8080', 'accesslobby-first-party', 'scoped-token', 'my-app', fakeFetch), 'disabled');
  assert.equal(puts, 1);
});

test('IAM suspension rejects identity drift or failed readback', async () => {
  const base = 'http://iam:8080/admin/realms/accesslobby-first-party/clients';
  const drift = (async (url: string | URL | Request) => String(url) === `${base}?clientId=my-app`
    ? Response.json([{ id: 'kc-id', clientId: 'my-app' }]) : Response.json({ id: 'kc-id', clientId: 'another-app', enabled: true })) as typeof fetch;
  await assert.rejects(disableIamClient('http://iam:8080', 'accesslobby-first-party', 'token', 'my-app', drift),
    /identity changed/);
  const noReadback = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === `${base}?clientId=my-app`) return Response.json([{ id: 'kc-id', clientId: 'my-app' }]);
    if (init?.method === 'PUT') return new Response(null, { status: 204 });
    return Response.json({ id: 'kc-id', clientId: 'my-app', enabled: true });
  }) as typeof fetch;
  await assert.rejects(disableIamClient('http://iam:8080', 'accesslobby-first-party', 'token', 'my-app', noReadback),
    /still enabled/);
});

test('registry suspension denies an active client before IAM disable and is idempotent',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    let challenge = '';
    const apps = new ApplicationStore(pool, [], async () => [[proofValue(challenge)]]);
    const owner = randomUUID();
    try {
      await pool.query("INSERT INTO persons(id,status) VALUES ($1,'active')", [owner]);
      const app = await apps.request(owner, { clientId: `stop-${randomUUID()}`, name: 'Staging app',
        redirectUri: 'https://staging.example.test/callback', logoutUri: 'https://staging.example.test/',
        visibility: 'discoverable', admission: 'authenticated_open' });
      challenge = app.originVerificationValue.slice('accesslobby-verify='.length);
      await assert.rejects(suspendRegistry(pool, app.id, 'ticket-1234'), /Only an activated/);
      await apps.verifyOrigin(owner, app.id);
      await pool.query("UPDATE applications SET status = 'active', trust_class = 'first_party', activated_at = now() WHERE id = $1", [app.id]);
      assert.equal(await apps.allowedClient(app.clientId), true);
      assert.equal(await suspendRegistry(pool, app.id, 'ticket-1234'), app.clientId);
      assert.equal(await apps.allowedClient(app.clientId), false);
      assert.equal(await suspendRegistry(pool, app.id, 'ticket-1234'), app.clientId);
      await assert.rejects(suspendRegistry(pool, app.id, 'different-reference'), /original reference/);
      const state = await pool.query<{ status: string; suspension_reference: string }>(
        'SELECT status, suspension_reference FROM applications WHERE id = $1', [app.id]);
      assert.deepEqual(state.rows[0], { status: 'suspended', suspension_reference: 'ticket-1234' });
      const events = await pool.query('SELECT action FROM application_events WHERE application_id = $1 AND action = $2',
        [app.id, 'application.suspended']);
      assert.equal(events.rowCount, 1);
    } finally { await pool.end(); }
  });
