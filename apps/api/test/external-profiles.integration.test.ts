import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { ApplicationError, ApplicationStore } from '../src/applications.js';
import { ExternalProfiles, externalPreviewPolicy } from '../src/external-profiles.js';
import { PostgresIdentityStore } from '../src/identity.js';
import { provisionApp } from '../src/provision-app.js';
import { proofValue } from '../src/origin-proof.js';

test('external preparation stays inactive; two isolated subjects retain one canonical human and explicit consent',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const issuer = 'https://issuer.example/' + randomUUID(), subject = randomUUID(), owner = randomUUID(), outsider = randomUUID();
    const identity = new PostgresIdentityStore(pool);
    const human = await identity.resolve({ issuer, subject, client: 'accesslobby-web' });
    const proofs = new Map<string, string>();
    let published = true;
    const lookup = async (host: string) => published ? [[proofs.get(host) ?? 'wrong-proof']] : [];
    const apps = new ApplicationStore(pool, [], lookup), external = new ExternalProfiles(pool, lookup);
    try {
      for (const id of [owner, outsider]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [id]);
      const prepared = [];
      for (const name of ['publisher-one', 'publisher-two']) {
        const app = await apps.request(owner, { clientId: name + '-' + randomUUID(), name, platform: 'wordpress',
          redirectUri: `https://${name}.example.test/gh/wp-login.php?action=al_callback`,
          logoutUri: `https://${name}.example.test/gh/wp-login.php?action=al_signed_out`,
          visibility: 'hidden', admission: 'authenticated_open' });
        proofs.set(app.originVerificationHost, proofValue(app.originVerificationValue.slice('accesslobby-verify='.length)));
        const plan = await external.prepare(app.id, undefined);
        assert.equal(plan.activationAllowed, false); assert.equal(plan.iamProvisioned, false);
        await assert.rejects(external.prepare(app.id, 'review-external-61', false), ApplicationError);
        await apps.verifyOrigin(owner, app.id);
        published = false;
        await assert.rejects(external.prepare(app.id, 'review-external-61', false), ApplicationError);
        published = true;
        assert.equal((await external.prepare(app.id, 'review-external-61', false)).state, 'prepared-inactive');
        assert.equal(await apps.allowedClient(app.clientId), false);
        // Even a legacy environment allowlist cannot bypass the external registry boundary.
        assert.equal(await new ApplicationStore(pool, [app.clientId]).allowedClient(app.clientId), false);
        await assert.rejects(provisionApp(pool, app.id, '--activate-first-party', 'review-61',
          { issuer: 'https://iam.example.test/realms/accesslobby-first-party' }), /Only requested applications/);
        await assert.rejects(pool.query("UPDATE applications SET status='active',activated_at=now() WHERE id=$1", [app.id]),
          error => (error as { code?: string }).code === '23514');
        await assert.rejects(external.subjectForConsentedPerson(human.id, app.id), ApplicationError);
        await assert.rejects(external.grant(human.id, app.id, externalPreviewPolicy, ['openid', 'email']), ApplicationError);
        // Concurrent consent never creates duplicate app identities or a new Person.
        await Promise.all(Array.from({ length: 4 }, () => external.grant(human.id, app.id, externalPreviewPolicy, ['openid'])));
        prepared.push({ app, opaque: await external.subjectForConsentedPerson(human.id, app.id) });
      }
      assert(prepared[0].opaque !== prepared[1].opaque);
      for (const item of prepared) assert(/^alx_[A-Za-z0-9_-]{43}$/.test(item.opaque) && item.opaque !== human.id && item.opaque !== subject);
      const canonical = await pool.query(`SELECT count(*) AS identities,count(DISTINCT person_id) AS persons
        FROM external_app_identities WHERE application_id=ANY($1::uuid[])`, [prepared.map(p => p.app.id)]);
      assert.deepEqual(canonical.rows[0], { identities: '2', persons: '1' });
      assert.equal((await identity.resolve({ issuer, subject, client: 'accesslobby-web' })).id, human.id);
      const mine = JSON.stringify(await external.mine(human.id));
      for (const secret of [human.id, subject, ...prepared.map(p => p.opaque)]) assert(!mine.includes(secret));
      assert.deepEqual(await external.mine(outsider), []);
      const a = prepared[0];
      await assert.rejects(external.withdraw(outsider, a.app.id), ApplicationError);
      await external.withdraw(human.id, a.app.id);
      await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
      assert.equal(await external.subjectForConsentedPerson(human.id, prepared[1].app.id), prepared[1].opaque);
      await external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid']);
      assert.equal(await external.subjectForConsentedPerson(human.id, a.app.id), a.opaque);
      await external.suspend(a.app.id, 'external-suspend-review-61');
      await assert.rejects(external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid']), ApplicationError);
      await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
      await external.withdraw(human.id, a.app.id); // Withdrawal remains available after publisher suspension.
      await pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [owner]);
      await assert.rejects(external.grant(human.id, prepared[1].app.id, externalPreviewPolicy, ['openid']), ApplicationError);
    } finally { await pool.end(); }
  });
