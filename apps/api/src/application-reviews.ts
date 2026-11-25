import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { OperatorError, OperatorStore } from './operators.js';
import { validId } from './organizations.js';
import { proofHost, verifiableOrigin } from './origin-proof.js';

const contract = 'accesslobby.admin.v0.1' as const;
const pageSize = 25;
const referencePattern = /^[A-Za-z0-9._:/-]{4,120}$/;

export interface ReviewApplicationRow {
  id: string; client_id: string; name: string; owner_person_id: string;
  status: string; trust_class: string; platform: 'web' | 'wordpress';
  redirect_uri: string; logout_uri: string; backchannel_logout_uri: string | null;
  visibility: string; admission: string; origin_challenge: string;
  origin_verified_at: Date | null; origin_verified_host: string | null;
  review_revision: string | number;
}
interface ReviewRow {
  id: string; decision: 'approved' | 'rejected'; reference: string;
  reviewer_person_id: string; configuration_hash: string; reviewed_at: Date;
}

// The revision advances even if a changed configuration is later restored.
export function applicationConfigurationHash(row: ReviewApplicationRow): string {
  return createHash('sha256').update(JSON.stringify([
    row.id, row.client_id, row.name, row.owner_person_id, row.platform,
    row.redirect_uri, row.logout_uri, row.backchannel_logout_uri,
    row.visibility, row.admission, row.origin_challenge,
    row.origin_verified_host, row.origin_verified_at?.toISOString() ?? null,
    String(row.review_revision),
  ])).digest('hex');
}
function summary(row: ReviewApplicationRow) {
  return { id: row.id, clientId: row.client_id, name: row.name, ownerPersonId: row.owner_person_id,
    status: row.status, trustClass: row.trust_class, platform: row.platform,
    originVerifiedAt: row.origin_verified_at?.toISOString() ?? null };
}
function presentReview(row: ReviewRow | undefined) {
  return row ? { decision: row.decision, reference: row.reference,
    reviewerPersonId: row.reviewer_person_id, reviewedAt: row.reviewed_at.toISOString(),
    configurationHash: row.configuration_hash } : null;
}
function queryValue(q: unknown) {
  if (q === undefined || q === '') return '';
  if (typeof q !== 'string' || q.length > 120 || /[\x00-\x1f\x7f]/.test(q)) throw new OperatorError(400, 'invalid_admin_query');
  return q.trim();
}
function cursorValue(after: unknown) {
  if (after === undefined || after === '') return null;
  if (!validId(after)) throw new OperatorError(400, 'invalid_admin_cursor');
  return after;
}

export class ApplicationReviewStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  async list(actor: string, q?: unknown, after?: unknown) {
    await this.operators.require(actor, 'read');
    const search = queryValue(q).replace(/[\\%_]/g, '\\$&');
    const cursor = cursorValue(after);
    const result = await this.pool.query<ReviewApplicationRow & { review_decision: string | null; reviewed_hash: string | null }>(`
      SELECT a.*, r.decision AS review_decision, r.configuration_hash AS reviewed_hash FROM applications a
      LEFT JOIN LATERAL (SELECT decision, configuration_hash FROM application_reviews WHERE application_id=a.id ORDER BY id DESC LIMIT 1) r ON true
      WHERE ($1::text='' OR a.name ILIKE '%' || $1 || '%' ESCAPE '\\' OR a.client_id ILIKE '%' || $1 || '%' ESCAPE '\\')
        AND ($2::uuid IS NULL OR a.id > $2::uuid)
      ORDER BY a.id LIMIT $3`, [search, cursor, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract, applications: rows.map(row => ({ ...summary(row), reviewDecision: row.reviewed_hash === applicationConfigurationHash(row) ? row.review_decision : null })),
      nextCursor: result.rows.length > pageSize ? rows.at(-1)!.id : null };
  }

  async detail(actor: string, appId: string) {
    await this.operators.require(actor, 'read');
    if (!validId(appId)) throw new OperatorError(404, 'application_not_found');
    const result = await this.pool.query<ReviewApplicationRow>('SELECT * FROM applications WHERE id=$1', [appId]);
    const row = result.rows[0];
    if (!row) throw new OperatorError(404, 'application_not_found');
    const review = await this.pool.query<ReviewRow>(
      'SELECT * FROM application_reviews WHERE application_id=$1 ORDER BY id DESC LIMIT 1', [appId]);
    return { contract, application: { ...summary(row), redirectUri: row.redirect_uri, logoutUri: row.logout_uri,
      backchannelLogoutUri: row.backchannel_logout_uri, visibility: row.visibility, admission: row.admission,
      originVerifiedHost: row.origin_verified_host, configurationHash: applicationConfigurationHash(row),
      review: presentReview(review.rows[0]) } };
  }

  async record(actor: string, appId: string, input: { decision?: unknown; reference?: unknown; configurationHash?: unknown } | null | undefined) {
    await this.operators.require(actor, 'review');
    if (!validId(appId)) throw new OperatorError(404, 'application_not_found');
    if (!input || (input.decision !== 'approved' && input.decision !== 'rejected') ||
        typeof input.reference !== 'string' || !referencePattern.test(input.reference) ||
        typeof input.configurationHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.configurationHash)) {
      throw new OperatorError(400, 'invalid_application_review');
    }
    const decision = input.decision as 'approved' | 'rejected';
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const found = await db.query<ReviewApplicationRow & { owner_active: boolean }>(`
        SELECT a.*, (p.status='active') AS owner_active FROM applications a
        JOIN persons p ON p.id=a.owner_person_id WHERE a.id=$1 FOR UPDATE OF a FOR SHARE OF p`, [appId]);
      const app = found.rows[0];
      if (!app) throw new OperatorError(404, 'application_not_found');
      await lockCurrentReviewer(db, actor);
      if (app.owner_person_id === actor) throw new OperatorError(403, 'independent_reviewer_required');
      if (app.status !== 'requested' || app.trust_class !== 'unreviewed' || !app.owner_active) {
        throw new OperatorError(409, 'application_review_unavailable');
      }
      const fingerprint = applicationConfigurationHash(app);
      if (fingerprint !== input.configurationHash) throw new OperatorError(409, 'stale_application_review');
      const existing = await db.query<ReviewRow>(
        'SELECT * FROM application_reviews WHERE application_id=$1 AND configuration_hash=$2', [appId, fingerprint]);
      if (existing.rows[0]) {
        const prior = existing.rows[0];
        if (prior.decision !== decision || prior.reference !== input.reference || prior.reviewer_person_id !== actor) {
          throw new OperatorError(409, 'review_already_recorded');
        }
        await db.query('COMMIT');
        return { contract, decision, applicationId: appId };
      }
      if (decision === 'approved' && (!app.origin_verified_at || !verifiableOrigin(app.redirect_uri) ||
          app.origin_verified_host !== proofHost(app.redirect_uri))) throw new OperatorError(409, 'origin_proof_required');
      await db.query(`INSERT INTO application_reviews(application_id,reviewer_person_id,decision,reference,configuration_hash)
        VALUES($1,$2,$3,$4,$5)`, [appId, actor, decision, input.reference, fingerprint]);
      await db.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
        VALUES($1,$2,'application',$3,$4)`, [actor, `application.review_${decision}`, appId, input.reference]);
      await db.query('COMMIT');
      return { contract, decision, applicationId: appId };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}

// Lock current authority for the complete review or provisioning transaction.
// A stale web page or a previously granted token role never suffices.
export async function lockCurrentReviewer(db: PoolClient, actor: string) {
  const person = await db.query<{ status: string }>('SELECT status FROM persons WHERE id=$1 FOR SHARE', [actor]);
  const role = await db.query(`SELECT person_id FROM platform_operator_roles
    WHERE person_id=$1 AND role='application_reviewer' AND revoked_at IS NULL FOR SHARE`, [actor]);
  if (person.rows[0]?.status !== 'active' || !role.rowCount) throw new OperatorError(403, 'operator_access_denied');
}

export async function requireApprovedApplicationReview(db: PoolClient, app: ReviewApplicationRow, reference: string) {
  const result = await db.query<ReviewRow>(`SELECT * FROM application_reviews
    WHERE application_id=$1 ORDER BY id DESC LIMIT 1 FOR SHARE`, [app.id]);
  const review = result.rows[0];
  if (!review || review.decision !== 'approved' || review.reference !== reference ||
      review.configuration_hash !== applicationConfigurationHash(app) || review.reviewer_person_id === app.owner_person_id) {
    throw new Error('Current independent approved application review required before activation');
  }
  await lockCurrentReviewer(db, review.reviewer_person_id);
}
