import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ApplicationError, exactApplicationUrl, type ApplicationPlatform } from './applications.js';
import { originProofPresent, proofHost, verifiableOrigin } from './origin-proof.js';
import { validId } from './organizations.js';

export const externalPreviewPolicy = 'external-minimal-v0.1';
export const externalPreviewContract = 'accesslobby.external-preview.v0.2';
const reject = (status: number, code: string): never => { throw new ApplicationError(status, code); };
interface ProfileRow {
  id: string; name: string; client_id: string; owner_person_id: string; owner_active: boolean; status: string; trust_class: string;
  platform: ApplicationPlatform; redirect_uri: string; logout_uri: string; backchannel_logout_uri: string | null;
  admission: string; visibility: string;
  origin_challenge: string; origin_verified_at: Date | null; origin_verified_host: string | null;
  profile_state: string; policy_version: string; scopes: string[]; config_fingerprint: string | null;
}

/** Closed preparation/consent preview. Never provisions IAM, activates a client or resolves a Person from external tokens. */
export class ExternalProfiles {
  constructor(private readonly pool: Pool, private readonly lookupTxt?: (host: string) => Promise<string[][]>) {}

  private async transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  private fingerprint(app: ProfileRow): string {
    // An application-specific review snapshot, not a reusable publisher/person identifier.
    return createHash('sha256').update(JSON.stringify([externalPreviewPolicy, ['openid'], app.id, app.client_id,
      app.name, app.owner_person_id, app.platform, app.redirect_uri, app.logout_uri, app.backchannel_logout_uri,
      app.admission, app.visibility])).digest('hex');
  }

  private origin(app: ProfileRow): string {
    const callback = exactApplicationUrl(app.redirect_uri, app.platform, 'callback');
    const logout = exactApplicationUrl(app.logout_uri, app.platform, 'logout');
    if (new URL(callback).origin !== new URL(logout).origin || (app.platform === 'wordpress' &&
        new URL(callback).pathname !== new URL(logout).pathname)) return reject(409, 'application_origin_mismatch');
    if (app.backchannel_logout_uri && new URL(exactApplicationUrl(app.backchannel_logout_uri, app.platform, 'backchannel')).origin !==
        new URL(callback).origin) return reject(409, 'application_origin_mismatch');
    return new URL(callback).origin;
  }

  private current(app: ProfileRow): boolean {
    return app.status === 'requested' && app.trust_class === 'external' && app.profile_state === 'prepared' && app.owner_active &&
      app.policy_version === externalPreviewPolicy && app.scopes.length === 1 && app.scopes[0] === 'openid' &&
      app.config_fingerprint === this.fingerprint(app);
  }

  private async proof(app: ProfileRow, reference: string | undefined): Promise<void> {
    if (!reference || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reference)) return reject(400, 'review_reference_required');
    this.origin(app);
    const host = proofHost(app.redirect_uri);
    if (!app.origin_verified_at || app.origin_verified_host !== host || !verifiableOrigin(app.redirect_uri) ||
        !await originProofPresent(host, app.origin_challenge, this.lookupTxt)) return reject(409, 'current_origin_proof_required');
  }

  private async invalidateConsents(db: PoolClient, appId: string): Promise<void> {
    await db.query(`WITH withdrawn AS (
      UPDATE external_app_consents SET state='withdrawn',withdrawn_at=now(),revision=revision+1
      WHERE application_id=$1 AND state='granted' RETURNING application_id,person_id)
      INSERT INTO application_events(application_id,actor_person_id,action)
      SELECT application_id,person_id,'external_consent.invalidated' FROM withdrawn`, [appId]);
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
      const plan = { contract: externalPreviewContract, applicationId: appId, clientId: app.client_id,
        platform: app.platform, origin: this.origin(app), policyVersion: externalPreviewPolicy,
        scopes: ['openid'], activationAllowed: false, iamProvisioned: false } as const;
      if (planOnly) return { ...plan, state: 'plan-only' };
      await this.proof(app, reviewReference);
      await db.query(`INSERT INTO external_app_profiles(application_id,state,policy_version,scopes,review_reference,config_fingerprint)
        VALUES($1,'prepared',$2,ARRAY['openid'],$3,$4)`, [appId, externalPreviewPolicy, reviewReference, this.fingerprint(app)]);
      await db.query("UPDATE applications SET trust_class='external',review_reference=$2 WHERE id=$1", [appId, reviewReference]);
      await db.query("INSERT INTO application_events(application_id,action) VALUES($1,'application.external_prepared')", [appId]);
      return { ...plan, state: 'prepared-inactive' };
    });
  }

  /** Host-only operation. A changed owner/domain/routes or suspended preview requires fresh proof and fresh user consent. */
  async reverify(appId: string, reference: string, resumePreview = false) {
    if (!validId(appId)) return reject(400, 'invalid_id');
    return this.transaction(async db => {
      const result = await db.query<ProfileRow>(`SELECT a.*, (p.status='active') AS owner_active,x.state AS profile_state
        FROM applications a JOIN external_app_profiles x ON x.application_id=a.id JOIN persons p ON p.id=a.owner_person_id
        WHERE a.id=$1 FOR UPDATE OF a,x,p`, [appId]);
      const app = result.rows[0];
      if (!app || app.trust_class !== 'external' || !app.owner_active ||
          app.status !== (resumePreview ? 'suspended' : 'requested') || app.profile_state !== (resumePreview ? 'suspended' : 'prepared')) {
        return reject(409, 'external_review_unavailable');
      }
      await this.proof(app, reference);
      await this.invalidateConsents(db, appId);
      await db.query(`UPDATE external_app_profiles SET state='prepared',config_fingerprint=$2,review_reference=$3,prepared_at=now()
        WHERE application_id=$1`, [appId, this.fingerprint(app), reference]);
      await db.query(`UPDATE applications SET status='requested',review_reference=$2 WHERE id=$1`, [appId, reference]);
      await db.query('INSERT INTO application_events(application_id,action) VALUES($1,$2)',
        [appId, resumePreview ? 'application.external_preview_resumed' : 'application.external_reverified']);
      return { applicationId: appId, state: 'prepared-inactive', activationAllowed: false, iamProvisioned: false };
    });
  }

  async review(personId: string, appId: string) {
    if (!validId(personId) || !validId(appId)) return reject(400, 'invalid_id');
    const result = await this.pool.query<ProfileRow & { consent_state: string | null; consent_fingerprint: string | null }>(`
      SELECT a.*,(owner.status='active') AS owner_active,x.state AS profile_state,x.policy_version,x.scopes,x.config_fingerprint,
      c.state AS consent_state,c.config_fingerprint AS consent_fingerprint
      FROM external_app_profiles x JOIN applications a ON a.id=x.application_id JOIN persons owner ON owner.id=a.owner_person_id
      JOIN persons actor ON actor.id=$2 LEFT JOIN external_app_consents c ON c.application_id=a.id AND c.person_id=$2
      WHERE a.id=$1 AND actor.status='active'`, [appId, personId]);
    const app = result.rows[0];
    if (!app) return reject(404, 'external_profile_unavailable');
    if (!this.current(app)) return reject(409, 'external_review_required');
    return { contract: externalPreviewContract, applicationId: app.id, clientId: app.client_id, name: app.name,
      origin: this.origin(app), policyVersion: externalPreviewPolicy, scopes: ['openid'], fingerprint: app.config_fingerprint,
      state: app.consent_state === 'granted' && app.consent_fingerprint === app.config_fingerprint ? 'granted' : 'not-granted',
      activationAllowed: false, iamProvisioned: false };
  }

  async grant(personId: string, appId: string, policyVersion: unknown, scopes: unknown, fingerprint: unknown) {
    if (!validId(personId) || !validId(appId)) return reject(400, 'invalid_id');
    if (policyVersion !== externalPreviewPolicy || !Array.isArray(scopes) || scopes.length !== 1 || scopes[0] !== 'openid' ||
        typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) return reject(400, 'unsupported_external_consent');
    return this.transaction(async db => {
      const result = await db.query<ProfileRow>(`SELECT a.*,(owner.status='active') AS owner_active,
        x.state AS profile_state,x.policy_version,x.scopes,x.config_fingerprint FROM external_app_profiles x
        JOIN applications a ON a.id=x.application_id JOIN persons owner ON owner.id=a.owner_person_id JOIN persons actor ON actor.id=$2
        WHERE a.id=$1 AND actor.status='active' FOR SHARE OF a,x,owner,actor`, [appId, personId]);
      const app = result.rows[0];
      if (!app) return reject(404, 'external_profile_unavailable');
      if (!this.current(app) || fingerprint !== app.config_fingerprint) return reject(409, 'external_review_required');
      const origin = this.origin(app);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['external-consent', appId, personId])]);
      await db.query(`INSERT INTO external_app_identities(application_id,person_id,subject) VALUES($1,$2,$3)
        ON CONFLICT(application_id,person_id) DO NOTHING`, [appId, personId, 'alx_' + randomBytes(32).toString('base64url')]);
      const changed = await db.query(`INSERT INTO external_app_consents
        (application_id,person_id,policy_version,scopes,state,config_fingerprint,site_name,site_origin)
        VALUES($1,$2,$3,ARRAY['openid'],'granted',$4,$5,$6) ON CONFLICT(application_id,person_id) DO UPDATE
        SET state='granted',revision=external_app_consents.revision+1,granted_at=now(),withdrawn_at=NULL,
        policy_version=EXCLUDED.policy_version,scopes=EXCLUDED.scopes,config_fingerprint=EXCLUDED.config_fingerprint,
        site_name=EXCLUDED.site_name,site_origin=EXCLUDED.site_origin
        WHERE external_app_consents.state<>'granted' OR external_app_consents.config_fingerprint IS DISTINCT FROM EXCLUDED.config_fingerprint
        RETURNING application_id`, [appId, personId, externalPreviewPolicy, fingerprint, app.name, origin]);
      if (changed.rowCount) await db.query(`INSERT INTO application_events(application_id,actor_person_id,action)
        VALUES($1,$2,'external_consent.granted')`, [appId, personId]);
      return { contract: externalPreviewContract, applicationId: appId, state: 'granted', activationAllowed: false };
    });
  }

  async suspend(appId: string, reference: string) {
    if (!validId(appId) || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reference)) return reject(400, 'invalid_external_suspension');
    return this.transaction(async db => {
      const app = await db.query(`SELECT a.id FROM applications a JOIN external_app_profiles x ON x.application_id=a.id
        WHERE a.id=$1 AND a.trust_class='external' AND a.status IN ('requested','suspended') FOR UPDATE OF a,x`, [appId]);
      if (!app.rows[0]) return reject(404, 'external_profile_unavailable');
      await this.invalidateConsents(db, appId);
      await db.query("UPDATE external_app_profiles SET state='suspended' WHERE application_id=$1", [appId]);
      await db.query("UPDATE applications SET status='suspended',suspended_at=now(),suspension_reference=$2 WHERE id=$1", [appId, reference]);
      await db.query("INSERT INTO application_events(application_id,action) VALUES($1,'application.external_suspended')", [appId]);
      return { applicationId: appId, state: 'suspended', activationAllowed: false, iamProvisioned: false };
    });
  }

  async withdraw(personId: string, appId: string) {
    if (!validId(personId) || !validId(appId)) return reject(400, 'invalid_id');
    return this.transaction(async db => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['external-consent', appId, personId])]);
      const result = await db.query(`UPDATE external_app_consents SET state='withdrawn',withdrawn_at=now(),revision=revision+1
        WHERE application_id=$1 AND person_id=$2 AND state='granted' RETURNING application_id`, [appId, personId]);
      if (result.rowCount) await db.query(`INSERT INTO application_events(application_id,actor_person_id,action)
        VALUES($1,$2,'external_consent.withdrawn')`, [appId, personId]);
      else if (!(await db.query('SELECT 1 FROM external_app_consents WHERE application_id=$1 AND person_id=$2', [appId, personId])).rowCount) {
        return reject(404, 'external_consent_not_found');
      }
      return { contract: externalPreviewContract, applicationId: appId, state: 'withdrawn', activationAllowed: false };
    });
  }

  async mine(personId: string) {
    if (!validId(personId)) return reject(400, 'invalid_id');
    const result = await this.pool.query<ProfileRow & { consent_state: string; consent_fingerprint: string | null;
      site_name: string | null; site_origin: string | null }>(`SELECT a.*,(owner.status='active') AS owner_active,
      x.state AS profile_state,x.policy_version,x.scopes,x.config_fingerprint,c.state AS consent_state,
      c.config_fingerprint AS consent_fingerprint,c.site_name,c.site_origin FROM external_app_consents c
      JOIN applications a ON a.id=c.application_id JOIN external_app_profiles x ON x.application_id=a.id
      JOIN persons owner ON owner.id=a.owner_person_id WHERE c.person_id=$1 ORDER BY c.site_name,a.id`, [personId]);
    return result.rows.map(app => ({ applicationId: app.id, name: app.site_name ?? 'Previously reviewed site',
      origin: app.site_origin, state: app.consent_state, policyVersion: app.policy_version, scopes: app.scopes,
      reviewAvailable: this.current(app), consentCurrent: this.current(app) && app.consent_state === 'granted' &&
        app.consent_fingerprint === app.config_fingerprint, activationAllowed: false }));
  }

  /** Private adapter boundary, still blocked from external consumers. All authorization context must remain current. */
  async subjectForConsentedPerson(personId: string, appId: string): Promise<string> {
    if (!validId(personId) || !validId(appId)) return reject(400, 'invalid_id');
    const result = await this.pool.query<ProfileRow & { subject: string; consent_fingerprint: string | null }>(`
      SELECT a.*,(owner.status='active') AS owner_active,x.state AS profile_state,x.policy_version,x.scopes,
      x.config_fingerprint,i.subject,c.config_fingerprint AS consent_fingerprint FROM external_app_identities i
      JOIN external_app_consents c USING(application_id,person_id) JOIN external_app_profiles x USING(application_id)
      JOIN applications a ON a.id=i.application_id JOIN persons p ON p.id=i.person_id JOIN persons owner ON owner.id=a.owner_person_id
      WHERE i.application_id=$1 AND i.person_id=$2 AND c.state='granted' AND p.status='active'`, [appId, personId]);
    const app = result.rows[0];
    return app && this.current(app) && app.consent_fingerprint === app.config_fingerprint ? app.subject : reject(403, 'external_consent_required');
  }
}
