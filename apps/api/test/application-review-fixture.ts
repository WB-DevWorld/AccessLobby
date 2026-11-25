// Only disposable test databases may use this explicit independent-review fixture.
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { OperatorStore } from '../src/operators.js';
import { ApplicationReviewStore } from '../src/application-reviews.js';

export async function recordFixtureApproval(pool: Pool, appId: string, reference: string, reviewer = randomUUID()) {
  await pool.query("INSERT INTO persons(id,status) VALUES($1,'active') ON CONFLICT DO NOTHING", [reviewer]);
  await pool.query(`INSERT INTO platform_operator_roles(person_id,role,grant_reference)
    VALUES($1,'application_reviewer','disposable-reviewer-fixture') ON CONFLICT DO NOTHING`, [reviewer]);
  const reviews = new ApplicationReviewStore(pool, new OperatorStore(pool));
  const detail = await reviews.detail(reviewer, appId);
  await reviews.record(reviewer, appId, { decision: 'approved', reference, configurationHash: detail.application.configurationHash });
  return reviewer;
}
