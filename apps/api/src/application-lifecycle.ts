import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ApplicationError, exactApplicationUrl, type ApplicationPlatform } from './applications.js';
import { applicationConfigurationHash, type ReviewApplicationRow } from './application-reviews.js';
import { validId } from './organizations.js';
import { proofHost, proofValue } from './origin-proof.js';

export const applicationLifecycleContract = 'accesslobby.application-lifecycle.v0.1' as const;
const referencePattern = /^[A-Za-z0-9._:/-]{4,120}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const commonKeys = ['expectedConfigurationHash', 'reference'];
const editKeys = ['name', 'platform', 'redirectUri', 'logoutUri', 'backchannelLogoutUri', 'visibility', 'admission'];
type Action = 'edit' | 'cancel' | 'resubmit';
type Input = Record<string, unknown>;
type Editable = { name: string; platform: ApplicationPlatform; redirectUri: string; logoutUri: string;
  backchannelLogoutUri: string | null; visibility: 'discoverable' | 'hidden'; admission: 'authenticated_open' | 'grant_required' };
const fail = (status: number, code: string): never => { throw new ApplicationError(status, code); };

function input(value: unknown, action: Action) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'invalid_application_mutation');
  const body = value as Input;
  const allowed = [...commonKeys, ...(action === 'edit' ? editKeys : [])];
  if (Object.keys(body).some(key => !allowed.includes(key)) ||
      typeof body.expectedConfigurationHash !== 'string' || !hashPattern.test(body.expectedConfigurationHash) ||
      typeof body.reference !== 'string' || !referencePattern.test(body.reference)) return fail(400, 'invalid_application_mutation');
  return body as Input & { expectedConfigurationHash: string; reference: string };
}

function editable(body: Input): Editable {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) return fail(400, 'invalid_application_name');
  const platform = body.platform;
  if (platform !== 'web' && platform !== 'wordpress') return fail(400, 'invalid_application_platform');
  const redirectUri = exactApplicationUrl(body.redirectUri, platform, 'callback');
  const logoutUri = exactApplicationUrl(body.logoutUri, platform, 'logout');
  if (new URL(redirectUri).origin !== new URL(logoutUri).origin) return fail(400, 'application_origin_mismatch');
  if (platform === 'wordpress' && new URL(redirectUri).pathname !== new URL(logoutUri).pathname) return fail(400, 'application_path_mismatch');
  const backchannelLogoutUri = body.backchannelLogoutUri === undefined || body.backchannelLogoutUri === null || body.backchannelLogoutUri === ''
    ? null : exactApplicationUrl(body.backchannelLogoutUri, platform, 'backchannel');
  if (backchannelLogoutUri && new URL(redirectUri).origin !== new URL(backchannelLogoutUri).origin) return fail(400, 'application_origin_mismatch');
  if (body.visibility !== 'discoverable' && body.visibility !== 'hidden') return fail(400, 'invalid_visibility');
  if (body.admission !== 'authenticated_open' && body.admission !== 'grant_required') return fail(400, 'invalid_admission');
  return { name, platform, redirectUri, logoutUri, backchannelLogoutUri, visibility: body.visibility, admission: body.admission };
}

function result(app: ReviewApplicationRow, changed: boolean) {
  return { contract: applicationLifecycleContract, applicationId: app.id, status: app.status,
    configurationHash: applicationConfigurationHash(app), changed };
}

/** Owner-only inactive request lifecycle. No IAM credential or client mutation. */
export class ApplicationLifecycleStore {
  constructor(private readonly pool: Pool) {}

  async detail(owner: string, appId: string) {
    if (!validId(owner) || !validId(appId)) return fail(404, 'application_not_found');
    const found = await this.pool.query<ReviewApplicationRow>(`SELECT a.* FROM applications a
      JOIN persons p ON p.id = a.owner_person_id
      WHERE a.id = $1 AND a.owner_person_id = $2 AND p.status = 'active'`, [appId, owner]);
    const app = found.rows[0];
    if (!app) return fail(404, 'application_not_found');
    const hash = applicationConfigurationHash(app);
    const review = await this.pool.query<{ decision: 'approved' | 'rejected' }>(`SELECT decision FROM application_reviews
      WHERE application_id = $1 AND configuration_hash = $2 ORDER BY id DESC LIMIT 1`, [appId, hash]);
    return { contract: applicationLifecycleContract, application: {
      id: app.id, clientId: app.client_id, name: app.name, platform: app.platform, status: app.status, trustClass: app.trust_class,
      redirectUri: app.redirect_uri, logoutUri: app.logout_uri, backchannelLogoutUri: app.backchannel_logout_uri,
      visibility: app.visibility, admission: app.admission, originVerificationHost: proofHost(app.redirect_uri),
      originVerificationValue: proofValue(app.origin_challenge), originVerifiedAt: app.origin_verified_at?.toISOString() ?? null,
      configurationHash: hash, reviewDecision: review.rows[0]?.decision ?? null,
    } };
  }

  edit(owner: string, appId: string, value: unknown) { return this.mutate(owner, appId, 'edit', value); }
  cancel(owner: string, appId: string, value: unknown) { return this.mutate(owner, appId, 'cancel', value); }
  resubmit(owner: string, appId: string, value: unknown) { return this.mutate(owner, appId, 'resubmit', value); }

  private async mutate(owner: string, appId: string, action: Action, value: unknown) {
    if (!validId(owner) || !validId(appId)) return fail(404, 'application_not_found');
    const body = input(value, action);
    const edit = action === 'edit' ? editable(body) : null;
    const mutationHash = createHash('sha256').update(JSON.stringify([
      action, body.expectedConfigurationHash, body.reference, edit,
    ])).digest('hex');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Review and private activation also lock the application before its owner.
      const found = await db.query<ReviewApplicationRow>('SELECT * FROM applications WHERE id = $1 FOR UPDATE', [appId]);
      let app = found.rows[0];
      if (!app || app.owner_person_id !== owner) return fail(404, 'application_not_found');
      // Same owner lock as request() keeps the ten-pending quota serialized.
      const person = await db.query<{ status: string }>('SELECT status FROM persons WHERE id = $1 FOR UPDATE', [owner]);
      if (person.rows[0]?.status !== 'active') return fail(403, 'identity_suspended');
      const previous = await db.query<{ mutation_hash: string }>(`SELECT mutation_hash FROM application_lifecycle_commands
        WHERE application_id = $1 AND actor_person_id = $2 AND action = $3 AND expected_configuration_hash = $4`,
      [appId, owner, action, body.expectedConfigurationHash]);
      if (previous.rows[0]) {
        if (previous.rows[0].mutation_hash !== mutationHash) return fail(409, 'application_mutation_conflict');
        await db.query('COMMIT');
        return result(app, false);
      }
      if (applicationConfigurationHash(app) !== body.expectedConfigurationHash) return fail(409, 'stale_application_mutation');
      if (app.trust_class !== 'unreviewed' || !['requested', 'cancelled'].includes(app.status) ||
          (action === 'cancel' && app.status !== 'requested') || (action === 'resubmit' && app.status !== 'cancelled')) {
        return fail(409, 'application_lifecycle_unavailable');
      }
      if (action === 'resubmit') {
        const pending = await db.query<{ count: string }>("SELECT count(*) FROM applications WHERE owner_person_id = $1 AND status = 'requested'", [owner]);
        if (Number(pending.rows[0]?.count ?? 0) >= 10) return fail(429, 'too_many_application_requests');
      }
      let updated;
      if (edit) {
        const challenge = new URL(edit.redirectUri).hostname === new URL(app.redirect_uri).hostname
          ? app.origin_challenge : randomBytes(32).toString('base64url');
        updated = await db.query<ReviewApplicationRow>(`UPDATE applications SET name = $2, platform = $3, redirect_uri = $4,
          logout_uri = $5, backchannel_logout_uri = $6, visibility = $7, admission = $8,
          origin_verified_at = NULL, origin_verified_host = NULL, origin_challenge = $9,
          lifecycle_revision = lifecycle_revision + 1
          WHERE id = $1 RETURNING *`, [appId, edit.name, edit.platform, edit.redirectUri, edit.logoutUri,
          edit.backchannelLogoutUri, edit.visibility, edit.admission, challenge]);
      } else {
        updated = await db.query<ReviewApplicationRow>(`UPDATE applications SET status = $2,
          origin_verified_at = NULL, origin_verified_host = NULL WHERE id = $1 RETURNING *`,
        [appId, action === 'cancel' ? 'cancelled' : 'requested']);
      }
      app = updated.rows[0]!;
      await this.record(db, app, owner, action, body, mutationHash);
      await db.query('COMMIT');
      return result(app, true);
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private async record(db: PoolClient, app: ReviewApplicationRow, owner: string, action: Action,
    body: { expectedConfigurationHash: string; reference: string }, mutationHash: string) {
    await db.query(`INSERT INTO application_lifecycle_commands(application_id,actor_person_id,action,reference,
      expected_configuration_hash,mutation_hash,resulting_configuration_hash,resulting_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [app.id, owner, action, body.reference, body.expectedConfigurationHash, mutationHash, applicationConfigurationHash(app), app.status]);
    await db.query('INSERT INTO application_events(application_id,actor_person_id,action) VALUES($1,$2,$3)',
      [app.id, owner, `application.${action === 'edit' ? 'edited' : action === 'cancel' ? 'cancelled' : 'resubmitted'}`]);
  }
}
