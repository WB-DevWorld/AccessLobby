import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { validId } from './organizations.js';
import { originProofPresent, proofHost, proofValue, verifiableOrigin } from './origin-proof.js';

export class ApplicationError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export class ClientRegistryUnavailable extends Error {}
const fail = (status: number, code: string): never => { throw new ApplicationError(status, code); };

export type ApplicationPlatform = 'web' | 'wordpress';
export type ApplicationUrlPurpose = 'callback' | 'logout' | 'backchannel';

export function exactApplicationUrl(value: unknown, platform: ApplicationPlatform = 'web', purpose?: ApplicationUrlPurpose): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\x00-\x20\x7f*]/.test(value)) return fail(400, 'invalid_application_url');
  let url: URL;
  try { url = new URL(value); } catch { return fail(400, 'invalid_application_url'); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) ||
      !url.hostname || url.username || url.password || value.includes('#') || url.href !== value) {
    return fail(400, 'invalid_application_url');
  }
  // WordPress core dispatches these actions on wp-login.php. Permit only this
  // registered static query profile, never caller-supplied return URLs/tokens.
  if (platform === 'wordpress') {
    if (purpose === 'callback' || purpose === 'logout') {
      const action = purpose === 'callback' ? 'al_callback' : 'al_signed_out';
      if (!url.pathname.endsWith('/wp-login.php') || /%2f|%5c/i.test(url.pathname) || url.search !== `?action=${action}`) {
        return fail(400, 'invalid_application_url');
      }
    } else if (purpose !== 'backchannel' || (value.includes('?') &&
        !/^\?rest_route=(?:\/accesslobby\/v1\/backchannel-logout|%2faccesslobby%2fv1%2fbackchannel-logout)$/i.test(url.search))) {
      return fail(400, 'invalid_application_url');
    }
  } else if (platform !== 'web' || value.includes('?')) return fail(400, 'invalid_application_url');
  return value;
}

interface RequestInput { clientId?: unknown; name?: unknown; redirectUri?: unknown; logoutUri?: unknown; backchannelLogoutUri?: unknown;
  visibility?: unknown; admission?: unknown; platform?: unknown }

export class ApplicationStore {
  constructor(private readonly pool: Pool, private readonly legacyClients: string[],
    private readonly lookupTxt?: (host: string) => Promise<string[][]>) {}

  private async transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async allowedClient(clientId: string): Promise<boolean> {
    try {
      const result = await this.pool.query<{ status: string; trust_class: string }>(
        'SELECT status, trust_class FROM applications WHERE client_id = $1', [clientId]);
      const app = result.rows[0];
      return app ? app.status === 'active' && app.trust_class === 'first_party' : this.legacyClients.includes(clientId);
    } catch { throw new ClientRegistryUnavailable('Client registry unavailable'); }
  }

  async request(personId: string, input: RequestInput) {
    const clientId = input?.clientId;
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (typeof clientId !== 'string' || clientId.length > 80 || !/^[a-z0-9_-]+$/.test(clientId) ||
        ['accesslobby-web', 'accesslobby-api'].includes(clientId) || this.legacyClients.includes(clientId)) return fail(400, 'invalid_client_id');
    if (name.length < 2 || name.length > 120 || /[\x00-\x1f\x7f]/.test(name)) return fail(400, 'invalid_application_name');
    const platform = input.platform ?? 'web';
    if (platform !== 'web' && platform !== 'wordpress') return fail(400, 'invalid_application_platform');
    const redirectUri = exactApplicationUrl(input.redirectUri, platform, 'callback');
    const logoutUri = exactApplicationUrl(input.logoutUri, platform, 'logout');
    if (new URL(redirectUri).origin !== new URL(logoutUri).origin) return fail(400, 'application_origin_mismatch');
    if (platform === 'wordpress' && new URL(redirectUri).pathname !== new URL(logoutUri).pathname) return fail(400, 'application_path_mismatch');
    const backchannelLogoutUri = input.backchannelLogoutUri === undefined || input.backchannelLogoutUri === null || input.backchannelLogoutUri === ''
      ? null : exactApplicationUrl(input.backchannelLogoutUri, platform, 'backchannel');
    if (backchannelLogoutUri && new URL(redirectUri).origin !== new URL(backchannelLogoutUri).origin) return fail(400, 'application_origin_mismatch');
    if (input.visibility !== 'discoverable' && input.visibility !== 'hidden') return fail(400, 'invalid_visibility');
    if (input.admission !== 'authenticated_open' && input.admission !== 'grant_required') return fail(400, 'invalid_admission');
    return this.transaction(async db => {
      // Existing client IDs stay reserved through cancellation. Refuse known
      // duplicates before the person lock, avoiding an app/person lock cycle
      // with lifecycle mutations. The unique constraint still guards new races.
      const taken = await db.query('SELECT id FROM applications WHERE client_id=$1', [clientId]);
      if (taken.rowCount) return fail(409, 'client_id_taken');
      // Serialize a person's requests and bound pending review work.
      await db.query('SELECT id FROM persons WHERE id = $1 FOR UPDATE', [personId]);
      const pending = await db.query<{ count: string }>(
        "SELECT count(*) FROM applications WHERE owner_person_id = $1 AND status = 'requested'", [personId]);
      if (Number(pending.rows[0]?.count ?? 0) >= 10) return fail(429, 'too_many_application_requests');
      const id = randomUUID();
      const challenge = randomBytes(32).toString('base64url');
      try {
        await db.query('INSERT INTO applications (id, client_id, name, owner_person_id, redirect_uri, logout_uri, backchannel_logout_uri, visibility, admission, origin_challenge, platform) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [id, clientId, name, personId, redirectUri, logoutUri, backchannelLogoutUri, input.visibility, input.admission, challenge, platform]);
      } catch (error) {
        if ((error as { code?: string }).code === '23505') return fail(409, 'client_id_taken');
        throw error;
      }
      await this.event(db, id, personId, 'application.requested');
      return { id, clientId, name, platform, visibility: input.visibility, admission: input.admission, status: 'requested', backchannelLogoutUri,
        originVerificationHost: proofHost(redirectUri), originVerificationValue: proofValue(challenge) };
    });
  }

  async mine(personId: string) {
    const result = await this.pool.query(
      `SELECT id, client_id AS "clientId", name, platform, visibility, admission, status, created_at AS "createdAt",
        redirect_uri AS "redirectUri", backchannel_logout_uri AS "backchannelLogoutUri",
        origin_challenge AS "originChallenge", origin_verified_at AS "originVerifiedAt"
        FROM applications WHERE owner_person_id = $1 ORDER BY created_at DESC, id`, [personId]);
    return result.rows.map(({ redirectUri, originChallenge, ...row }) => ({ ...row,
      originVerificationHost: proofHost(redirectUri), originVerificationValue: proofValue(originChallenge) }));
  }

  async verifyOrigin(actor: string, appId: string) {
    if (!validId(appId)) return fail(400, 'invalid_id');
    return this.transaction(async db => {
      const result = await db.query<{ owner_person_id: string; status: string; redirect_uri: string; origin_challenge: string }>(
        'SELECT owner_person_id, status, redirect_uri, origin_challenge FROM applications WHERE id = $1 FOR UPDATE', [appId]);
      const app = result.rows[0];
      if (!app || app.owner_person_id !== actor) return fail(404, 'application_not_found');
      if (app.status !== 'requested') return fail(409, 'application_verification_unavailable');
      const host = proofHost(app.redirect_uri);
      if (!verifiableOrigin(app.redirect_uri)) return fail(409, 'public_domain_required');
      let found: boolean;
      try { found = await originProofPresent(host, app.origin_challenge, this.lookupTxt); }
      catch { return fail(503, 'origin_verification_unavailable'); }
      if (!found) return fail(409, 'origin_proof_missing');
      await db.query('UPDATE applications SET origin_verified_at = now(), origin_verified_host = $2 WHERE id = $1', [appId, host]);
      await this.event(db, appId, actor, 'application.origin_verified');
      return { applicationId: appId, originVerified: true, originVerificationHost: host };
    });
  }

  async visible(personId: string) {
    const result = await this.pool.query(
      `SELECT a.id, a.client_id AS "clientId", a.name, a.platform, a.visibility, a.admission
       FROM applications a LEFT JOIN application_grants g ON g.application_id = a.id AND g.person_id = $1
       WHERE a.status = 'active' AND a.trust_class = 'first_party'
         AND (a.visibility = 'discoverable' OR (g.status = 'active' AND (g.expires_at IS NULL OR g.expires_at > now())))
       ORDER BY a.name, a.id`, [personId]);
    return result.rows;
  }

  async entry(personId: string, clientId: string) {
    const result = await this.pool.query<{ id: string; admission: string; status: string; trust_class: string; granted: boolean }>(
      `SELECT a.id, a.admission, a.status, a.trust_class,
       (g.status = 'active' AND (g.expires_at IS NULL OR g.expires_at > now())) AS granted
       FROM applications a LEFT JOIN application_grants g ON g.application_id = a.id AND g.person_id = $1
       WHERE a.client_id = $2`, [personId, clientId]);
    const app = result.rows[0];
    if (!app || app.status !== 'active' || app.trust_class !== 'first_party') return fail(403, 'application_unavailable');
    if (app.admission === 'grant_required' && app.granted !== true) return fail(403, 'application_entry_denied');
    return { applicationId: app.id, clientId, admitted: true };
  }

  private async ownedGrantApp(db: PoolClient, appId: string, actor: string) {
    const result = await db.query<{ owner_person_id: string; status: string; admission: string }>(
      'SELECT owner_person_id, status, admission FROM applications WHERE id = $1 FOR UPDATE', [appId]);
    const app = result.rows[0];
    if (!app || app.owner_person_id !== actor) return fail(404, 'application_not_found');
    if (app.status !== 'active' || app.admission !== 'grant_required') return fail(409, 'application_grants_unavailable');
  }

  async grant(actor: string, appId: string, personId: string, expiresAt: unknown) {
    if (!validId(appId) || !validId(personId)) return fail(400, 'invalid_id');
    if (expiresAt !== undefined && (typeof expiresAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(expiresAt) ||
        !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now())) return fail(400, 'invalid_expiry');
    return this.transaction(async db => {
      await this.ownedGrantApp(db, appId, actor);
      const person = await db.query("SELECT 1 FROM persons WHERE id = $1 AND status = 'active'", [personId]);
      if (!person.rows[0]) return fail(404, 'person_not_found');
      await db.query(`INSERT INTO application_grants (application_id, person_id, status, granted_by, expires_at)
        VALUES ($1,$2,'active',$3,$4) ON CONFLICT (application_id, person_id)
        DO UPDATE SET status = 'active', granted_by = EXCLUDED.granted_by, granted_at = now(), expires_at = EXCLUDED.expires_at, revoked_at = NULL`,
      [appId, personId, actor, expiresAt ?? null]);
      await this.event(db, appId, actor, 'application.granted', personId);
      return { applicationId: appId, personId, status: 'active', expiresAt: expiresAt ?? null };
    });
  }

  async revoke(actor: string, appId: string, personId: string) {
    if (!validId(appId) || !validId(personId)) return fail(400, 'invalid_id');
    return this.transaction(async db => {
      await this.ownedGrantApp(db, appId, actor);
      const result = await db.query(`UPDATE application_grants SET status = 'revoked', revoked_at = now()
        WHERE application_id = $1 AND person_id = $2 AND status = 'active' RETURNING person_id`, [appId, personId]);
      if (!result.rows[0]) return fail(404, 'grant_not_found');
      await this.event(db, appId, actor, 'application.revoked', personId);
      return { applicationId: appId, personId, status: 'revoked' };
    });
  }

  private async event(db: PoolClient, appId: string, actor: string, action: string, target?: string) {
    await db.query('INSERT INTO application_events (application_id, actor_person_id, target_person_id, action) VALUES ($1,$2,$3,$4)',
      [appId, actor, target ?? null, action]);
  }
}
