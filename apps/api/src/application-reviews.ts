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
  reviewer_grant_version: string | null; reviewer_person_version: string | null;
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
function presentReview(row: ReviewRow | undefined, authorizationCurrent = false) {
  return row ? { decision: row.decision, reference: row.reference,
    reviewerPersonId: row.reviewer_person_id, reviewedAt: row.reviewed_at.toISOString(),
    configurationHash: row.configuration_hash, authorizationCurrent } : null;
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
    const result = await this.pool.query<ReviewApplicationRow & { review_decision: string | null; reviewed_hash: string | null; review_authority_current: boolean }>(`
      SELECT a.*, r.decision AS review_decision, r.configuration_hash AS reviewed_hash,
        (rp.status='active' AND rr.revoked_at IS NULL AND rr.grant_version=r.reviewer_grant_version
          AND rp.status_version=r.reviewer_person_version) AS review_authority_current FROM applications a
      LEFT JOIN LATERAL (SELECT * FROM application_reviews WHERE application_id=a.id ORDER BY id DESC LIMIT 1) r ON true
      LEFT JOIN persons rp ON rp.id=r.reviewer_person_id
      LEFT JOIN platform_operator_roles rr ON rr.person_id=r.reviewer_person_id AND rr.role='application_reviewer'
      WHERE ($1::text='' OR a.name ILIKE '%' || $1 || '%' ESCAPE '\\' OR a.client_id ILIKE '%' || $1 || '%' ESCAPE '\\')
        AND ($2::uuid IS NULL OR a.id > $2::uuid)
      ORDER BY a.id LIMIT $3`, [search, cursor, pageSize + 1]);
    const rows = result.rows.slice(0, pageSize);
    return { contract, applications: rows.map(row => ({ ...summary(row), reviewDecision: row.reviewed_hash === applicationConfigurationHash(row) &&
      (row.review_decision === 'rejected' || row.review_authority_current === true) ? row.review_decision : null })),
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
    const latest = review.rows[0];
    const authority = latest ? await this.pool.query<{ valid: boolean }>(`SELECT
      (p.status='active' AND p.status_version=$2::bigint AND r.grant_version=$3::bigint) AS valid
      FROM persons p JOIN platform_operator_roles r ON r.person_id=p.id
      WHERE p.id=$1 AND r.role='application_reviewer' AND r.revoked_at IS NULL`,
      [latest.reviewer_person_id, latest.reviewer_person_version, latest.reviewer_grant_version]) : null;
    const authorizationCurrent = !!latest && latest.configuration_hash === applicationConfigurationHash(row) && authority?.rows[0]?.valid === true;
    return { contract, application: { ...summary(row), redirectUri: row.redirect_uri, logoutUri: row.logout_uri,
      backchannelLogoutUri: row.backchannel_logout_uri, visibility: row.visibility, admission: row.admission,
      originVerifiedHost: row.origin_verified_host, configurationHash: applicationConfigurationHash(row),
      review: presentReview(latest, authorizationCurrent) } };
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
        JOIN persons p ON p.id=a.owner_person_id WHERE a.id=$1 FOR UPDATE OF a`, [appId]);
      const app = found.rows[0];
      if (!app) throw new OperatorError(404, 'application_not_found');
      const authority = await lockCurrentReviewer(db, actor, [app.owner_person_id]);
      const owner = await db.query<{ status: string }>('SELECT status FROM persons WHERE id=$1', [app.owner_person_id]);
      if (app.owner_person_id === actor) throw new OperatorError(403, 'independent_reviewer_required');
      if (app.status !== 'requested' || app.trust_class !== 'unreviewed' || owner.rows[0]?.status !== 'active') {
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
        if (prior.reviewer_grant_version !== authority.grantVersion || prior.reviewer_person_version !== authority.personVersion) {
          throw new OperatorError(409, 'review_authority_changed');
        }
        await db.query('COMMIT');
        return { contract, decision, applicationId: appId };
      }
      if (decision === 'approved' && (!app.origin_verified_at || !verifiableOrigin(app.redirect_uri) ||
          app.origin_verified_host !== proofHost(app.redirect_uri))) throw new OperatorError(409, 'origin_proof_required');
      await db.query(`INSERT INTO application_reviews(application_id,reviewer_person_id,decision,reference,configuration_hash,reviewer_grant_version,reviewer_person_version)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [appId, actor, decision, input.reference, fingerprint, authority.grantVersion, authority.personVersion]);
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
export async function lockCurrentReviewer(db: PoolClient, actor: string, otherPersonIds: string[] = []) {
  const persons = await db.query<{ id: string; status: string; status_version: string }>(
    'SELECT id,status,status_version FROM persons WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE', [[...new Set([actor, ...otherPersonIds])].sort()]);
  const person = persons.rows.find(row => row.id === actor.toLowerCase());
  const role = await db.query<{ grant_version: string }>(`SELECT person_id,grant_version FROM platform_operator_roles
    WHERE person_id=$1 AND role='application_reviewer' AND revoked_at IS NULL FOR SHARE`, [actor]);
  if (person?.status !== 'active' || !role.rowCount) throw new OperatorError(403, 'operator_access_denied');
  return { grantVersion: String(role.rows[0]!.grant_version), personVersion: String(person.status_version) };
}

export async function requireApprovedApplicationReview(db: PoolClient, app: ReviewApplicationRow, reference: string, additionalPersonIds: string[] = []) {
  const result = await db.query<ReviewRow>(`SELECT * FROM application_reviews
    WHERE application_id=$1 ORDER BY id DESC LIMIT 1 FOR SHARE`, [app.id]);
  const review = result.rows[0];
  if (!review || review.decision !== 'approved' || review.reference !== reference ||
      review.configuration_hash !== applicationConfigurationHash(app) || review.reviewer_person_id === app.owner_person_id) {
    throw new Error('Current independent approved application review required before activation');
  }
  const authority = await lockCurrentReviewer(db, review.reviewer_person_id, [app.owner_person_id, ...additionalPersonIds]);
  const owner = await db.query<{ status: string }>('SELECT status FROM persons WHERE id=$1', [app.owner_person_id]);
  if (owner.rows[0]?.status !== 'active') throw new OperatorError(409, 'application_review_unavailable');
  if (review.reviewer_grant_version !== authority.grantVersion || review.reviewer_person_version !== authority.personVersion) {
    throw new OperatorError(403, 'review_authority_changed');
  }
  return review;
}
