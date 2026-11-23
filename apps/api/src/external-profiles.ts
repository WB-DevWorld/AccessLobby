import { randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ApplicationError, exactApplicationUrl, type ApplicationPlatform } from './applications.js';
import { originProofPresent, proofHost, verifiableOrigin } from './origin-proof.js';
import { validId } from './organizations.js';

export const externalPreviewPolicy = 'external-minimal-v0.1';
const reject = (status: number, code: string): never => { throw new ApplicationError(status, code); };
interface ProfileRow {
  id: string; client_id: string; owner_person_id: string; owner_active: boolean; status: string; trust_class: string;
  platform: ApplicationPlatform; redirect_uri: string; logout_uri: string; backchannel_logout_uri: string | null;
  origin_challenge: string; origin_verified_at: Date | null; origin_verified_host: string | null;
}

/** Preparatory storage and consent only. No external JWT may resolve/create a Person through this class. */
export class ExternalProfiles {
  constructor(private readonly pool: Pool, private readonly lookupTxt?: (host: string) => Promise<string[][]>) {}

  private async transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async prepare(appId: string, reviewReference: string | undefined, planOnly = true) {
    if (!validId(appId)) return reject(400, 'invalid_id');
    return this.transaction(async db => {
      const result = await db.query<ProfileRow>(`SELECT a.*, (p.status='active') AS owner_active
        FROM applications a JOIN persons p ON p.id=a.owner_person_id WHERE a.id=$1 FOR UPDATE OF a,p`, [appId]);
      const app = result.rows[0];
      if (!app || app.status !== 'requested' || app.trust_class !== 'unreviewed' || !app.owner_active) {
        return reject(409, 'external_preparation_unavailable');
      }
      const callback = exactApplicationUrl(app.redirect_uri, app.platform, 'callback');
      const logout = exactApplicationUrl(app.logout_uri, app.platform, 'logout');
      if (new URL(callback).origin !== new URL(logout).origin || (app.platform === 'wordpress' &&
          new URL(callback).pathname !== new URL(logout).pathname)) return reject(409, 'application_origin_mismatch');
      if (app.backchannel_logout_uri && new URL(exactApplicationUrl(app.backchannel_logout_uri, app.platform, 'backchannel')).origin !==
          new URL(callback).origin) return reject(409, 'application_origin_mismatch');
      const plan = { contract: 'accesslobby.external-preview.v0.1', applicationId: appId, clientId: app.client_id,
        platform: app.platform, origin: new URL(callback).origin, policyVersion: externalPreviewPolicy,
        scopes: ['openid'], activationAllowed: false, iamProvisioned: false } as const;
      if (planOnly) return { ...plan, state: 'plan-only' };
      if (!reviewReference || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reviewReference)) return reject(400, 'review_reference_required');
      const host = proofHost(callback);
      if (!app.origin_verified_at || app.origin_verified_host !== host || !verifiableOrigin(callback) ||
          !await originProofPresent(host, app.origin_challenge, this.lookupTxt)) return reject(409, 'current_origin_proof_required');
      await db.query(`INSERT INTO external_app_profiles(application_id,state,policy_version,scopes,review_reference)
        VALUES($1,'prepared',$2,ARRAY['openid'],$3)`, [appId, externalPreviewPolicy, reviewReference]);
      await db.query("UPDATE applications SET trust_class='external',review_reference=$2 WHERE id=$1", [appId, reviewReference]);
      await db.query("INSERT INTO application_events(application_id,action) VALUES($1,'application.external_prepared')", [appId]);
      return { ...plan, state: 'prepared-inactive' };
    });
  }

  async grant(personId: string, appId: string, policyVersion: unknown, scopes: unknown) {
    if (!validId(personId) || !validId(appId)) return reject(400, 'invalid_id');
    if (policyVersion !== externalPreviewPolicy || !Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== 'openid') {
      return reject(400, 'unsupported_external_consent');
    }
    return this.transaction(async db => {
      const profile = await db.query(`SELECT a.id FROM external_app_profiles x JOIN applications a ON a.id=x.application_id
        JOIN persons owner ON owner.id=a.owner_person_id JOIN persons actor ON actor.id=$2
        WHERE a.id=$1 AND a.status='requested' AND a.trust_class='external' AND x.state='prepared'
        AND owner.status='active' AND actor.status='active' FOR SHARE OF a,x,owner,actor`, [appId, personId]);
      if (!profile.rows[0]) return reject(404, 'external_profile_unavailable');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['external-consent', appId, personId])]);
      await db.query(`INSERT INTO external_app_identities(application_id,person_id,subject) VALUES($1,$2,$3)
        ON CONFLICT(application_id,person_id) DO NOTHING`, [appId, personId, 'alx_' + randomBytes(32).toString('base64url')]);
      await db.query(`INSERT INTO external_app_consents(application_id,person_id,policy_version,scopes,state)
        VALUES($1,$2,$3,ARRAY['openid'],'granted') ON CONFLICT(application_id,person_id) DO UPDATE
        SET state='granted',revision=external_app_consents.revision+1,granted_at=now(),withdrawn_at=NULL`,
      [appId, personId, externalPreviewPolicy]);
      await db.query(`INSERT INTO application_events(application_id,actor_person_id,action)
        VALUES($1,$2,'external_consent.granted')`, [appId, personId]);
      return { contract: 'accesslobby.external-preview.v0.1', applicationId: appId, state: 'granted', activationAllowed: false };
    });
  }

  async suspend(appId: string, reference: string) {
    if (!validId(appId) || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reference)) return reject(400, 'invalid_external_suspension');
    return this.transaction(async db => {
      const app = await db.query(`SELECT a.id FROM applications a JOIN external_app_profiles x ON x.application_id=a.id
        WHERE a.id=$1 AND a.trust_class='external' AND a.status IN ('requested','suspended') FOR UPDATE OF a,x`, [appId]);
      if (!app.rows[0]) return reject(404, 'external_profile_unavailable');
      await db.query("UPDATE external_app_profiles SET state='suspended' WHERE application_id=$1", [appId]);
      await db.query("UPDATE applications SET status='suspended',suspended_at=now(),suspension_reference=$2 WHERE id=$1", [appId, reference]);
      await db.query("INSERT INTO application_events(application_id,action) VALUES($1,'application.external_suspended')", [appId]);
      return { applicationId: appId, state: 'suspended', activationAllowed: false, iamProvisioned: false };
    });
  }

  async withdraw(personId: string, appId: string) {
    if (!validId(personId) || !validId(appId)) return reject(400, 'invalid_id');
    return this.transaction(async db => {
      const result = await db.query(`UPDATE external_app_consents SET state='withdrawn',withdrawn_at=now(),revision=revision+1
        WHERE application_id=$1 AND person_id=$2 RETURNING application_id`, [appId, personId]);
      if (!result.rows[0]) return reject(404, 'external_consent_not_found');
      await db.query(`INSERT INTO application_events(application_id,actor_person_id,action)
        VALUES($1,$2,'external_consent.withdrawn')`, [appId, personId]);
      return { contract: 'accesslobby.external-preview.v0.1', applicationId: appId, state: 'withdrawn', activationAllowed: false };
    });
  }

  async mine(personId: string) {
    const result = await this.pool.query(`SELECT a.id AS "applicationId",a.client_id AS "clientId",a.name,
      a.redirect_uri AS callback,c.state,c.policy_version AS "policyVersion",c.scopes
      FROM external_app_consents c JOIN applications a ON a.id=c.application_id WHERE c.person_id=$1 ORDER BY a.name,a.id`, [personId]);
    return result.rows.map(({ callback, ...row }) => ({ ...row, origin: new URL(callback).origin, activationAllowed: false }));
  }

  /** Private test/issuer adapter boundary. Not an external consumer endpoint; activation is still prohibited. */
  async subjectForConsentedPerson(personId: string, appId: string): Promise<string> {
    const result = await this.pool.query<{ subject: string }>(`SELECT i.subject FROM external_app_identities i
      JOIN external_app_consents c USING(application_id,person_id) JOIN external_app_profiles x USING(application_id)
      JOIN applications a ON a.id=i.application_id JOIN persons p ON p.id=i.person_id JOIN persons owner ON owner.id=a.owner_person_id
      WHERE i.application_id=$1 AND i.person_id=$2 AND c.state='granted' AND x.state='prepared'
      AND a.status='requested' AND a.trust_class='external' AND p.status='active' AND owner.status='active'`, [appId, personId]);
    return result.rows[0]?.subject ?? reject(403, 'external_consent_required');
  }
}
