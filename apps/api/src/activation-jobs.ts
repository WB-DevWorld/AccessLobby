import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { OperatorError, OperatorStore, validOperatorReference } from './operators.js';
import { validId } from './organizations.js';
import { applicationConfigurationHash, requireApprovedApplicationReview, type ReviewApplicationRow } from './application-reviews.js';

export const activationContract = 'accesslobby.activation-jobs.v0.1' as const;
export class ActivationJobError extends OperatorError {}
const fail = (status: number, code: string): never => { throw new ActivationJobError(status, code); };
const safeHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const exact = (body: unknown, fields: string[]): body is Record<string, unknown> =>
  typeof body === 'object' && body !== null && !Array.isArray(body) &&
  Object.keys(body).length === fields.length && fields.every(field => Object.hasOwn(body, field));

export interface ActivationJobRow {
  id: string; application_id: string; review_id: string; configuration_hash: string; review_reference: string;
  requested_by: string; status: 'queued' | 'running' | 'succeeded' | 'failed'; attempt: number; max_attempts: number;
  requester_grant_version: string; requester_person_version: string; reviewer_grant_version: string; reviewer_person_version: string;
  owner_person_version: string;
  lease_token: string | null; lease_expires_at: Date | null; last_error: string | null; retryable: boolean;
  created_at: Date; updated_at: Date;
}
type PresentJob = ActivationJobRow & { application_name: string; client_id: string; application_status: string };
const fields = `j.*,a.name AS application_name,a.client_id,a.status AS application_status`;
function present(row: PresentJob) {
  return { id: row.id, applicationId: row.application_id, applicationName: row.application_name, clientId: row.client_id,
    applicationStatus: row.application_status, status: row.status, attempt: row.attempt, maxAttempts: row.max_attempts,
    configurationHash: row.configuration_hash, reviewReference: row.review_reference, requestedBy: row.requested_by,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), lastError: row.last_error,
    retryable: row.retryable && row.attempt < row.max_attempts, leaseExpiresAt: row.lease_expires_at?.toISOString() ?? null };
}

/** Current actor authority is locked for the complete private mutation. */
export async function lockActivationRequester(db: PoolClient, actor: string) {
  const person = await db.query<{ status: string; status_version: string }>('SELECT status,status_version FROM persons WHERE id=$1 FOR SHARE', [actor]);
  const role = await db.query<{ grant_version: string }>(`SELECT grant_version FROM platform_operator_roles
    WHERE person_id=$1 AND role='application_operator' AND revoked_at IS NULL FOR SHARE`, [actor]);
  if (person.rows[0]?.status !== 'active' || !role.rowCount) fail(403, 'activation_requester_unavailable');
  return { grantVersion: String(role.rows[0]!.grant_version), personVersion: String(person.rows[0]!.status_version) };
}

async function currentApproval(db: PoolClient, app: ReviewApplicationRow, reference: string, additionalPeople: string[] = []) {
  try { await requireApprovedApplicationReview(db, app, reference, additionalPeople); }
  catch (error) {
    if (error instanceof OperatorError) throw error;
    return fail(409, 'activation_review_required');
  }
  const review = await db.query<{ id: string; reviewer_grant_version: string | null; reviewer_person_version: string | null }>(
    'SELECT id,reviewer_grant_version,reviewer_person_version FROM application_reviews WHERE application_id=$1 ORDER BY id DESC LIMIT 1 FOR SHARE', [app.id]);
  const row=review.rows[0]!;
  if(row.reviewer_grant_version===null || row.reviewer_person_version===null) return fail(409,'activation_review_required');
  return row;
}

// currentApproval has already acquired the owner in its sorted person locks.
async function lockedOwnerVersion(db: PoolClient, owner: string) {
  const row=await db.query<{status_version:string}>('SELECT status_version FROM persons WHERE id=$1',[owner]);
  if(!row.rows[0]) return fail(409,'activation_application_unavailable');
  return String(row.rows[0].status_version);
}

export interface ActivationLease { jobId: string; claimToken: string }

/** Called only inside the provisioner's app transaction; never an HTTP route. */
export async function lockActivationLease(db: PoolClient, app: ReviewApplicationRow & { activation_job_id?: string | null },
  reference: string, lease: ActivationLease): Promise<ActivationJobRow> {
  if (!validId(lease.jobId) || !validId(lease.claimToken)) return fail(409, 'activation_lease_lost');
  const found = await db.query<ActivationJobRow & { valid_lease: boolean }>(`SELECT *,
    lease_expires_at>clock_timestamp() AS valid_lease FROM application_activation_jobs WHERE id=$1 FOR UPDATE`, [lease.jobId]);
  const job = found.rows[0];
  if (!job || job.status !== 'running' || job.lease_token !== lease.claimToken || !job.valid_lease) return fail(409, 'activation_lease_lost');
  if (job.application_id !== app.id || job.review_reference !== reference || job.configuration_hash !== applicationConfigurationHash(app)) {
    return fail(409, 'activation_configuration_changed');
  }
  const review=await currentApproval(db,app,reference,[job.requested_by]);
  if(await lockedOwnerVersion(db,app.owner_person_id)!==String(job.owner_person_version)) return fail(403,'activation_authority_changed');
  const requester=await lockActivationRequester(db, job.requested_by);
  if(requester.grantVersion!==String(job.requester_grant_version) || requester.personVersion!==String(job.requester_person_version)) return fail(403,'activation_authority_changed');
  if (String(review.id) !== String(job.review_id) || String(review.reviewer_grant_version)!==String(job.reviewer_grant_version) ||
      String(review.reviewer_person_version)!==String(job.reviewer_person_version)) return fail(409, 'activation_review_required');
  return job;
}

export async function completeActivationJob(db: PoolClient, job: ActivationJobRow, lease: ActivationLease) {
  const completed = await db.query(`UPDATE application_activation_jobs SET status='succeeded',lease_token=NULL,
    lease_expires_at=NULL,last_error=NULL,retryable=false,updated_at=now()
    WHERE id=$1 AND status='running' AND lease_token=$2 AND lease_expires_at>clock_timestamp() RETURNING id`, [job.id, lease.claimToken]);
  if (!completed.rowCount) return fail(409, 'activation_lease_lost');
  await db.query(`INSERT INTO operator_audit_events(action,target_type,target_id,reference)
    VALUES('application.activation_job.succeeded','activation_job',$1,$2)`, [job.id, job.review_reference]);
}

/** Browser-side operations schedule work; they cannot reach IAM or activate an app. */
export class ActivationJobStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  async list(actor: string, after?: unknown) {
    await this.operators.require(actor, 'read');
    if (after !== undefined && after !== '' && !validId(after)) return fail(400, 'invalid_activation_cursor');
    const result = await this.pool.query<PresentJob>(`SELECT ${fields} FROM application_activation_jobs j
      JOIN applications a ON a.id=j.application_id WHERE ($1::uuid IS NULL OR j.id>$1::uuid) ORDER BY j.id LIMIT 26`, [after || null]);
    const rows = result.rows.slice(0, 25);
    return { contract: activationContract, jobs: rows.map(present), nextCursor: result.rows.length > 25 ? rows.at(-1)!.id : null };
  }

  async detail(actor: string, jobId: string) {
    await this.operators.require(actor, 'read');
    if (!validId(jobId)) return fail(404, 'activation_job_not_found');
    const result = await this.pool.query<PresentJob>(`SELECT ${fields} FROM application_activation_jobs j
      JOIN applications a ON a.id=j.application_id WHERE j.id=$1`, [jobId]);
    if (!result.rows[0]) return fail(404, 'activation_job_not_found');
    return { contract: activationContract, job: present(result.rows[0]) };
  }

  async enqueue(actor: string, appId: string, body: unknown) {
    await this.operators.require(actor, 'activate');
    if (!validId(appId)) return fail(404, 'application_not_found');
    if (!exact(body, ['configurationHash','reviewReference']) || !safeHash(body.configurationHash) || !validOperatorReference(body.reviewReference)) {
      return fail(400, 'invalid_activation_request');
    }
    const db = await this.pool.connect();
    let jobId: string;
    try {
      await db.query('BEGIN');
      const found = await db.query<ReviewApplicationRow & { owner_active: boolean }>(`SELECT a.*,(p.status='active') AS owner_active
        FROM applications a JOIN persons p ON p.id=a.owner_person_id WHERE a.id=$1 FOR UPDATE OF a`, [appId]);
      const app = found.rows[0];
      if (!app || app.status !== 'requested' || app.trust_class !== 'unreviewed' || !app.owner_active) return fail(409, 'activation_application_unavailable');
      if (applicationConfigurationHash(app) !== body.configurationHash) return fail(409, 'activation_configuration_changed');
      const review = await currentApproval(db, app, body.reviewReference,[actor]);
      const requester=await lockActivationRequester(db, actor);
      const ownerVersion=await lockedOwnerVersion(db,app.owner_person_id);
      const existing = await db.query<ActivationJobRow>(`SELECT * FROM application_activation_jobs
        WHERE application_id=$1 AND configuration_hash=$2 AND review_id=$3 AND requested_by=$4
          AND requester_grant_version=$5 AND requester_person_version=$6 AND reviewer_grant_version=$7 AND reviewer_person_version=$8 AND owner_person_version=$9 FOR UPDATE`,
      [app.id, body.configurationHash, review.id, actor, requester.grantVersion,requester.personVersion,review.reviewer_grant_version,review.reviewer_person_version,ownerVersion]);
      if (existing.rows[0]) jobId = existing.rows[0].id;
      else {
        jobId = randomUUID();
        await db.query(`INSERT INTO application_activation_jobs(id,application_id,review_id,configuration_hash,review_reference,requested_by,
          requester_grant_version,requester_person_version,reviewer_grant_version,reviewer_person_version,owner_person_version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [jobId, app.id, review.id, body.configurationHash, body.reviewReference, actor,
          requester.grantVersion,requester.personVersion,review.reviewer_grant_version,review.reviewer_person_version,ownerVersion]);
        await db.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
          VALUES($1,'application.activation_job.queued','activation_job',$2,$3)`, [actor, jobId, body.reviewReference]);
      }
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
    return this.detail(actor, jobId!);
  }

  async retry(actor: string, jobId: string, body: unknown) {
    await this.operators.require(actor, 'activate');
    if (!validId(jobId)) return fail(404, 'activation_job_not_found');
    if (!exact(body, ['expectedAttempt']) || !Number.isSafeInteger(body.expectedAttempt) || Number(body.expectedAttempt)<1) return fail(400, 'invalid_activation_retry');
    // Match the provisioner's lock ordering: app, owner, job, requester/reviewer.
    const lookup = await this.pool.query<{ application_id: string }>('SELECT application_id FROM application_activation_jobs WHERE id=$1', [jobId]);
    if (!lookup.rows[0]) return fail(404, 'activation_job_not_found');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const found = await db.query<ReviewApplicationRow & { owner_active: boolean; activation_job_id: string | null }>(`SELECT a.*,(p.status='active') AS owner_active
        FROM applications a JOIN persons p ON p.id=a.owner_person_id WHERE a.id=$1 FOR UPDATE OF a`, [lookup.rows[0].application_id]);
      const result = await db.query<ActivationJobRow>('SELECT * FROM application_activation_jobs WHERE id=$1 FOR UPDATE', [jobId]);
      const app = found.rows[0], job = result.rows[0];
      if (!job || job.attempt !== body.expectedAttempt) return fail(409, 'activation_attempt_changed');
      if (job.status !== 'failed' || !job.retryable || job.attempt >= job.max_attempts) return fail(409, 'activation_retry_unavailable');
      if (!app || !app.owner_active || !((app.status==='requested' && app.trust_class==='unreviewed') ||
          (app.status==='active' && app.trust_class==='first_party' && app.activation_job_id===job.id))) return fail(409, 'activation_application_unavailable');
      if (applicationConfigurationHash(app)!==job.configuration_hash) return fail(409, 'activation_configuration_changed');
      const review=await currentApproval(db,app,job.review_reference,[actor,job.requested_by]);
      if(await lockedOwnerVersion(db,app.owner_person_id)!==String(job.owner_person_version)) return fail(403,'activation_authority_changed');
      await lockActivationRequester(db, actor);
      if (String(review.id)!==String(job.review_id)) return fail(409,'activation_review_required');
      // A different current operator may retry, but authority of the original
      // requester remains required by private execution. No silent reassignment.
      const requester=await lockActivationRequester(db,job.requested_by);
      if(requester.grantVersion!==String(job.requester_grant_version) || requester.personVersion!==String(job.requester_person_version) ||
        String(review.reviewer_grant_version)!==String(job.reviewer_grant_version) || String(review.reviewer_person_version)!==String(job.reviewer_person_version)) return fail(403,'activation_authority_changed');
      await db.query(`UPDATE application_activation_jobs SET status='queued',last_error=NULL,retryable=false,
        lease_token=NULL,lease_expires_at=NULL,updated_at=now() WHERE id=$1`, [jobId]);
      await db.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
        VALUES($1,'application.activation_job.retried','activation_job',$2,$3)`, [actor,jobId,job.review_reference]);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
    return this.detail(actor,jobId);
  }
}

/** Private worker lease. No token or lease capability enters a web response. */
export async function claimActivationJob(pool: Pool, jobId?: string): Promise<ActivationLease | null> {
  if (jobId!==undefined && !validId(jobId)) return fail(400,'invalid_activation_job');
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    const found=await db.query<ActivationJobRow>(`SELECT * FROM application_activation_jobs
      WHERE ($1::uuid IS NULL OR id=$1) AND (status='queued' OR (status='running' AND lease_expires_at<=clock_timestamp()))
      ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,[jobId??null]);
    const job=found.rows[0];
    if(!job){await db.query('COMMIT');return null;}
    if(job.attempt>=job.max_attempts){
      await db.query(`UPDATE application_activation_jobs SET status='failed',lease_token=NULL,lease_expires_at=NULL,
        last_error='activation_attempts_exhausted',retryable=false,updated_at=now() WHERE id=$1`,[job.id]);
      await db.query(`INSERT INTO operator_audit_events(action,target_type,target_id,reference)
        VALUES('application.activation_job.exhausted','activation_job',$1,$2)`,[job.id,job.review_reference]);
      await db.query('COMMIT');return null;
    }
    const claimToken=randomUUID();
    await db.query(`UPDATE application_activation_jobs SET status='running',attempt=attempt+1,lease_token=$2,
      lease_expires_at=clock_timestamp()+interval '5 minutes',last_error=NULL,retryable=false,updated_at=now() WHERE id=$1`,[job.id,claimToken]);
    await db.query('COMMIT');return{jobId:job.id,claimToken};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function failActivationJob(pool:Pool,lease:ActivationLease,code:string,retryable:boolean){
  const db=await pool.connect();
  try{
    await db.query('BEGIN');
    const changed=await db.query<ActivationJobRow>(`UPDATE application_activation_jobs SET status='failed',lease_token=NULL,
      lease_expires_at=NULL,last_error=$3,retryable=$4,updated_at=now()
      WHERE id=$1 AND status='running' AND lease_token=$2 RETURNING *`,[lease.jobId,lease.claimToken,code,retryable]);
    const job=changed.rows[0];
    if(job)await db.query(`INSERT INTO operator_audit_events(action,target_type,target_id,reference)
      VALUES('application.activation_job.failed','activation_job',$1,$2)`,[job.id,job.review_reference]);
    await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
