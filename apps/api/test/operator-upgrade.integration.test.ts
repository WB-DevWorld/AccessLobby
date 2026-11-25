import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Pool } from 'pg';
import { migrationFiles } from '../src/migration-files.js';
import { ApplicationStore } from '../src/applications.js';
import { ApplicationReviewStore, applicationConfigurationHash, type ReviewApplicationRow } from '../src/application-reviews.js';
import { OperatorStore } from '../src/operators.js';
import { proofValue } from '../src/origin-proof.js';

test('round-one upgrade retains active apps and immutable history while renewing pending unstamped approval once',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const schema = `alupgrade_${randomBytes(8).toString('hex')}`;
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 5, options: `-c search_path=${schema}` });
    const owner = randomUUID(), reviewer = randomUUID();
    const apply = async (files: readonly string[]) => {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        for (const name of files) {
          await db.query(readFileSync(fileURLToPath(new URL(`../migrations/${name}`, import.meta.url)), 'utf8'));
        }
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      finally { db.release(); }
    };
    try {
      await admin.query(`CREATE SCHEMA ${schema}`);
      const cutoff = migrationFiles.indexOf('011_person_controls.sql');
      assert(cutoff > 0);
      await apply(migrationFiles.slice(0, cutoff));
      for (const person of [owner, reviewer]) await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
      await pool.query(`INSERT INTO platform_operator_roles(person_id,role,grant_reference)
        VALUES($1,'application_reviewer','legacy-reviewed-role')`, [reviewer]);
      const challenges = new Map<string, string>();
      const lookup = async (host: string) => [[proofValue(challenges.get(host)!)] ];
      const apps = new ApplicationStore(pool, [], lookup);
      const create = async (name: string) => {
        const hostname = `upgrade-${randomUUID()}.example.test`;
        const app = await apps.request(owner, { name, clientId: `upgrade-${randomUUID()}`,
          redirectUri: `https://${hostname}/callback`, logoutUri: `https://${hostname}/`,
          visibility: 'hidden', admission: 'grant_required' });
        challenges.set(app.originVerificationHost, app.originVerificationValue.slice('accesslobby-verify='.length));
        await apps.verifyOrigin(owner, app.id);
        const row = (await pool.query<ReviewApplicationRow>('SELECT * FROM applications WHERE id=$1', [app.id])).rows[0]!;
        // This is an explicit legacy-schema migration fixture. The new reviewer
        // service cannot be used before its generation columns exist.
        await pool.query(`INSERT INTO application_reviews(application_id,reviewer_person_id,decision,reference,configuration_hash)
          VALUES($1,$2,'approved','legacy-review',$3)`, [app.id, reviewer, applicationConfigurationHash(row)]);
        return app;
      };
      const pending = await create('Legacy pending approval');
      const active = await create('Legacy active client');
      await pool.query(`UPDATE applications SET status='active',trust_class='first_party',activated_at=now(),review_reference='legacy-review'
        WHERE id=$1`, [active.id]);
      const activeBefore = (await pool.query('SELECT id,status,trust_class,origin_verified_at,review_revision,activated_at FROM applications WHERE id=$1', [active.id])).rows[0];
      const historyBefore = (await pool.query('SELECT id,application_id,reviewer_person_id,decision,reference,configuration_hash,reviewed_at FROM application_reviews ORDER BY id')).rows;
      await apply(migrationFiles);
      const activeAfter = (await pool.query('SELECT id,status,trust_class,origin_verified_at,review_revision,activated_at FROM applications WHERE id=$1', [active.id])).rows[0];
      assert.deepEqual(activeAfter, activeBefore);
      assert.equal(await apps.allowedClient(active.clientId), true);
      assert.deepEqual((await pool.query('SELECT id,application_id,reviewer_person_id,decision,reference,configuration_hash,reviewed_at FROM application_reviews ORDER BY id')).rows, historyBefore);
      const pendingAfter = (await pool.query<ReviewApplicationRow>('SELECT * FROM applications WHERE id=$1', [pending.id])).rows[0]!;
      assert.equal(pendingAfter.status, 'requested');
      assert.equal(pendingAfter.origin_verified_at, null);
      assert.equal(pendingAfter.origin_verified_host, null);
      const revisions = (await pool.query('SELECT id,review_revision FROM applications ORDER BY id')).rows;
      await apply(migrationFiles);
      assert.deepEqual((await pool.query('SELECT id,review_revision FROM applications ORDER BY id')).rows, revisions);
      const reviews = new ApplicationReviewStore(pool, new OperatorStore(pool));
      assert.equal((await reviews.detail(reviewer, pending.id)).application.review?.authorizationCurrent, false);
      // Renew the pending request's proof and independent review. Re-running the
      // migrator must never wipe that newly established authority.
      await apps.verifyOrigin(owner, pending.id);
      const detail = await reviews.detail(reviewer, pending.id);
      await reviews.record(reviewer, pending.id, { decision: 'approved', reference: 'renewed-upgrade-review',
        configurationHash: detail.application.configurationHash });
      assert.equal((await reviews.detail(reviewer, pending.id)).application.review?.authorizationCurrent, true);
      await apply(migrationFiles);
      const renewed = await reviews.detail(reviewer, pending.id);
      assert(renewed.application.originVerifiedAt);
      assert.equal(renewed.application.configurationHash, detail.application.configurationHash);
      assert.equal(renewed.application.review?.authorizationCurrent, true);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM application_reviews WHERE application_id=$1', [pending.id])).rows[0].count, 2);
      assert.equal((await pool.query('SELECT count(*)::int AS count FROM persons')).rows[0].count, 2);
      await assert.rejects(pool.query("UPDATE application_reviews SET reference='tampered-history' WHERE application_id=$1", [pending.id]), /append-only/);
    } finally {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  });
