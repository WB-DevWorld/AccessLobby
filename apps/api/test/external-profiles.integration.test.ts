import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Pool } from 'pg';
import { ApplicationError, ApplicationStore } from '../src/applications.js';
import { ExternalProfiles, externalPreviewPolicy, externalPreviewContract } from '../src/external-profiles.js';
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
        const review = await external.review(human.id, app.id);
        assert.equal(review.contract, externalPreviewContract); assert.equal(review.state, 'not-granted');
        assert.equal(review.activationAllowed, false);
        await assert.rejects(external.grant(human.id, app.id, externalPreviewPolicy, ['openid', 'email'], review.fingerprint), ApplicationError);
        await assert.rejects(external.grant(human.id, app.id, externalPreviewPolicy, ['openid'], '0'.repeat(64)), ApplicationError);
        // Concurrent consent never creates duplicate app identities or a new Person.
        await Promise.all(Array.from({ length: 4 }, () => external.grant(human.id, app.id, externalPreviewPolicy, ['openid'], review.fingerprint)));
        const audit = await pool.query("SELECT count(*) AS count FROM application_events WHERE application_id=$1 AND action='external_consent.granted'", [app.id]);
        assert.equal(audit.rows[0].count, '1');
        assert.equal((await pool.query('SELECT revision FROM external_app_consents WHERE application_id=$1', [app.id])).rows[0].revision, 1);
        prepared.push({ app, review, opaque: await external.subjectForConsentedPerson(human.id, app.id) });
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
      await external.withdraw(human.id, a.app.id); // Retry is idempotent.
      assert.equal((await pool.query('SELECT revision FROM external_app_consents WHERE application_id=$1', [a.app.id])).rows[0].revision, 2);
      await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
      assert.equal(await external.subjectForConsentedPerson(human.id, prepared[1].app.id), prepared[1].opaque);
      await external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], a.review.fingerprint);
      assert.equal(await external.subjectForConsentedPerson(human.id, a.app.id), a.opaque);
      await external.suspend(a.app.id, 'external-suspend-review-61');
      await assert.rejects(external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], a.review.fingerprint), ApplicationError);
      await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
      await external.withdraw(human.id, a.app.id); // Withdrawal remains available after publisher suspension.
      await assert.rejects(external.reverify(a.app.id, 'review-without-resume'), ApplicationError);
      published = false;
      await assert.rejects(external.reverify(a.app.id, 'review-resume', true), ApplicationError);
      published = true;
      await external.reverify(a.app.id, 'review-resume', true);
      await assert.rejects(external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], a.review.fingerprint), ApplicationError);
      await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
      await external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], (await external.review(human.id, a.app.id)).fingerprint);
      assert.equal(await external.subjectForConsentedPerson(human.id, a.app.id), a.opaque);
      assert.equal(await apps.allowedClient(a.app.clientId), false); // Resuming a preview never activates it.

      const preReview = await external.review(human.id, a.app.id);
      await external.reverify(a.app.id, 'review-unchanged-config');
      await assert.rejects(external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], preReview.fingerprint), ApplicationError);
      await external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], (await external.review(human.id, a.app.id)).fingerprint);
      // Every consequential registration change invalidates the old review and consent, including a transfer to another active owner.
      for (const [field, value] of [['name', 'Changed publisher'], ['owner_person_id', outsider],
        ['redirect_uri', 'https://publisher-one.example.test/gh/wp-login.php?action=al_callback&unapproved=1'],
        ['logout_uri', 'https://publisher-one.example.test/changed/wp-login.php?action=al_signed_out'],
        ['backchannel_logout_uri', 'https://publisher-one.example.test/new-backchannel'], ['admission', 'grant_required'],
        ['visibility', 'discoverable']] as const) {
        const prior = await pool.query(`SELECT ${field} FROM applications WHERE id=$1`, [a.app.id]);
        await pool.query(`UPDATE applications SET ${field}=$2 WHERE id=$1`, [a.app.id, value]);
        await assert.rejects(external.review(human.id, a.app.id), ApplicationError);
        await assert.rejects(external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], a.review.fingerprint), ApplicationError);
        await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
        const list = await external.mine(human.id);
        assert.equal(list.find(site => site.applicationId === a.app.id)?.consentCurrent, false);
        assert.equal(list.find(site => site.applicationId === a.app.id)?.name, 'publisher-one'); // Previous approved display stays intact.
        await pool.query(`UPDATE applications SET ${field}=$2 WHERE id=$1`, [a.app.id, prior.rows[0][field]]);
        await assert.rejects(external.review(human.id, a.app.id), ApplicationError);
        await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
        await external.reverify(a.app.id, 'review-restored-config');
        const restored = await external.review(human.id, a.app.id);
        await external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], restored.fingerprint);
      }
      // Domain changes require fresh origin proof AND re-consent, while preserving the original app identity and canonical human.
      await pool.query(`UPDATE applications SET redirect_uri='https://new-owner.example.test/gh/wp-login.php?action=al_callback',
        logout_uri='https://new-owner.example.test/gh/wp-login.php?action=al_signed_out' WHERE id=$1`, [a.app.id]);
      await assert.rejects(external.reverify(a.app.id, 'review-new-domain'), ApplicationError);
      await pool.query("UPDATE applications SET origin_verified_host='_accesslobby-verify.new-owner.example.test' WHERE id=$1", [a.app.id]);
      proofs.set('_accesslobby-verify.new-owner.example.test', a.app.originVerificationValue);
      await external.reverify(a.app.id, 'review-new-domain');
      const next = await external.review(human.id, a.app.id);
      assert.equal(next.state, 'not-granted'); assert.notEqual(next.fingerprint, a.review.fingerprint);
      await assert.rejects(external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], a.review.fingerprint), ApplicationError);
      await external.grant(human.id, a.app.id, externalPreviewPolicy, ['openid'], next.fingerprint);
      assert.equal(await external.subjectForConsentedPerson(human.id, a.app.id), a.opaque);
      assert.equal((await external.mine(human.id)).find(site => site.applicationId === a.app.id)?.origin, 'https://new-owner.example.test');
      // Legacy approvals have no context; an idempotent migration must never silently bless them.
      await pool.query('UPDATE external_app_profiles SET config_fingerprint=NULL WHERE application_id=$1', [a.app.id]);
      await assert.rejects(external.review(human.id, a.app.id), ApplicationError);
      await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
      await external.reverify(a.app.id, 'review-legacy-context');
      await assert.rejects(external.subjectForConsentedPerson(human.id, a.app.id), ApplicationError);
      await pool.query("UPDATE persons SET status='suspended' WHERE id=$1", [owner]);
      await assert.rejects(external.grant(human.id, prepared[1].app.id, externalPreviewPolicy, ['openid'], prepared[1].review.fingerprint), ApplicationError);
    } finally { await pool.end(); }
  });
