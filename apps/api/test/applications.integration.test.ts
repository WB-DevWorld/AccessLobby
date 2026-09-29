import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { ApplicationError, ApplicationStore, exactApplicationUrl } from '../src/applications.js';

const fails = (code: string) => (error: unknown) => error instanceof ApplicationError && error.code === code;

test('application URLs must be exact and same-origin', () => {
  assert.equal(exactApplicationUrl('https://app.example.test/callback'), 'https://app.example.test/callback');
  for (const url of ['http://app.example.test/', 'https://app.example.test/*', 'https://app.example.test/?x=1',
    'https://user:pass@app.example.test/', 'https://app.example.test/#f', 'https://app.example.test/a b']) {
    assert.throws(() => exactApplicationUrl(url), fails('invalid_application_url'));
  }
});

test('requested app cannot serve tokens or admit people before controlled activation', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const apps = new ApplicationStore(pool, ['accesslobby-web', 'reference-consumer']);
  const [owner, customer, outsider] = [randomUUID(), randomUUID(), randomUUID()];
  const clientId = `pilot-${randomUUID()}`;
  try {
    for (const id of [owner, customer, outsider]) await pool.query("INSERT INTO persons(id,status) VALUES ($1,'active')", [id]);
    const input = { clientId, name: 'Pilot portal', redirectUri: 'https://portal.example.test/callback',
      logoutUri: 'https://portal.example.test/', visibility: 'hidden', admission: 'grant_required' };
    const app = await apps.request(owner, input);
    assert.equal(app.status, 'requested');
    assert.equal(await apps.allowedClient(clientId), false);
    assert.equal(await apps.allowedClient('reference-consumer'), true);
    await assert.rejects(apps.request(owner, input), fails('client_id_taken'));
    await assert.rejects(apps.request(owner, { ...input, clientId: 'reference-consumer' }), fails('invalid_client_id'));
    await assert.rejects(apps.request(owner, { ...input, clientId: `other-${randomUUID()}`, logoutUri: 'https://other.example.test/' }), fails('application_origin_mismatch'));
    await assert.rejects(apps.entry(customer, clientId), fails('application_unavailable'));
    await assert.rejects(apps.grant(owner, app.id, customer, undefined), fails('application_grants_unavailable'));
    assert.deepEqual(await apps.visible(customer), []);
    assert.equal((await apps.mine(owner)).length, 1);
    assert.deepEqual(await apps.mine(outsider), []);

    // Represents an independently verified first-party client; there is no public activation route.
    await pool.query("UPDATE applications SET status = 'active', trust_class = 'first_party', activated_at = now() WHERE id = $1", [app.id]);
    assert.equal(await apps.allowedClient(clientId), true);
    await assert.rejects(apps.entry(customer, clientId), fails('application_entry_denied'));
    await assert.rejects(apps.grant(outsider, app.id, customer, undefined), fails('application_not_found'));
    await assert.rejects(apps.grant(owner, app.id, randomUUID(), undefined), fails('person_not_found'));
    await apps.grant(owner, app.id, customer, undefined);
    assert.equal((await apps.entry(customer, clientId)).admitted, true);
    assert.equal((await apps.visible(customer)).length, 1);
    assert.deepEqual(await apps.visible(outsider), []);
    await pool.query("UPDATE application_grants SET expires_at = now() - interval '1 second' WHERE application_id = $1", [app.id]);
    await assert.rejects(apps.entry(customer, clientId), fails('application_entry_denied'));
    await apps.grant(owner, app.id, customer, new Date(Date.now() + 3600_000).toISOString());
    await apps.revoke(owner, app.id, customer);
    await assert.rejects(apps.entry(customer, clientId), fails('application_entry_denied'));
    assert.deepEqual(await apps.visible(customer), []);
    await pool.query("UPDATE applications SET status = 'suspended' WHERE id = $1", [app.id]);
    assert.equal(await apps.allowedClient(clientId), false);
    const events = await pool.query<{ action: string }>('SELECT action FROM application_events WHERE application_id = $1 ORDER BY id', [app.id]);
    assert.deepEqual(events.rows.map(row => row.action), [
      'application.requested', 'application.granted', 'application.granted', 'application.revoked'
    ]);
  } finally { await pool.end(); }
});

test('discoverable open app admits a person without a resource grant', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const apps = new ApplicationStore(pool, ['accesslobby-web']);
  const [owner, visitor] = [randomUUID(), randomUUID()];
  try {
    for (const id of [owner, visitor]) await pool.query("INSERT INTO persons(id,status) VALUES ($1,'active')", [id]);
    const app = await apps.request(owner, { clientId: `open-${randomUUID()}`, name: 'Public entry',
      redirectUri: 'https://open.example.test/callback', logoutUri: 'https://open.example.test/',
      visibility: 'discoverable', admission: 'authenticated_open' });
    await pool.query("UPDATE applications SET status = 'active', trust_class = 'first_party', activated_at = now() WHERE id = $1", [app.id]);
    assert.equal((await apps.visible(visitor)).length, 1);
    assert.equal((await apps.entry(visitor, app.clientId)).admitted, true);
    await assert.rejects(apps.grant(owner, app.id, visitor, undefined), fails('application_grants_unavailable'));
  } finally { await pool.end(); }
});
