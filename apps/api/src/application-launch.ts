import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { exactApplicationUrl } from './applications.js';
import { verifiableOrigin } from './origin-proof.js';
import { validId } from './organizations.js';
import { OperatorError, OperatorStore, validOperatorReference } from './operators.js';

export const applicationLaunchContract = 'accesslobby.application-launch.v0.1' as const;
const protectedClients = new Set(['accesslobby-web', 'accesslobby-api']);
const fail = (status: number, code: string): never => { throw new OperatorError(status, code); };
interface AppRow { id: string; client_id: string; name: string; status: string; trust_class: string;
  redirect_uri: string; administration_version: string }
interface LaunchRow { launch_url: string | null; revision: string; updated_at: Date; reference: string }
const columns = 'id,client_id,name,status,trust_class,redirect_uri,administration_version';
const eligible = (app: AppRow) => app.status === 'active' && app.trust_class === 'first_party' && !protectedClients.has(app.client_id);

/** Static, public HTTPS entry points only. Query parameters cannot become return URLs or credentials. */
export function applicationLaunchUrl(value: unknown, callback: string): string {
  try {
    const exact = exactApplicationUrl(value);
    const url = new URL(exact);
    if (!verifiableOrigin(exact) || !url.hostname.includes('.') || /\.(?:local|internal|lan|home)$/i.test(url.hostname) ||
        /%2f|%5c|%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(url.pathname) ||
        url.pathname.includes('//') || url.origin !== new URL(callback).origin) return fail(400, 'invalid_application_launch_url');
    return exact;
  } catch { return fail(400, 'invalid_application_launch_url'); }
}
function version(app: AppRow, launch: LaunchRow | undefined): string {
  return createHash('sha256').update(JSON.stringify([app.id, app.administration_version,
    launch?.revision ?? '0', launch?.launch_url ?? null])).digest('hex');
}
function envelope(app: AppRow, launch: LaunchRow | undefined, canManage: boolean) {
  // Never turn corrupt or obsolete metadata into a navigable URL.
  let launchUrl: string | null = null, needsReview = false;
  if (launch?.launch_url) {
    try { launchUrl = applicationLaunchUrl(launch.launch_url, app.redirect_uri); } catch { needsReview = true; }
  }
  return { contract: applicationLaunchContract, application: { id: app.id, clientId: app.client_id, name: app.name,
    status: app.status, trustClass: app.trust_class, redirectUri: app.redirect_uri },
    launch: { launchUrl, version: version(app, launch), updatedAt: launch?.updated_at.toISOString() ?? null, reference: launch?.reference ?? null, needsReview },
    canManage: canManage && eligible(app) };
}

/** Launch links do not change IAM clients, admission, visibility, grants or reviewed OIDC settings. */
export class ApplicationLaunchStore {
  constructor(private readonly pool: Pool, private readonly operators: OperatorStore) {}

  async get(actor: string, appId: string) {
    const roles = await this.operators.require(actor, 'read');
    if (!validId(appId)) return fail(404, 'application_not_found');
    const app = (await this.pool.query<AppRow>(`SELECT ${columns} FROM applications WHERE id=$1`, [appId])).rows[0];
    if (!app) return fail(404, 'application_not_found');
    const launch = (await this.pool.query<LaunchRow>('SELECT launch_url,revision,updated_at,reference FROM application_launches WHERE application_id=$1', [appId])).rows[0];
    return envelope(app, launch, roles.includes('application_operator'));
  }

  async set(actor: string, appId: string, input: unknown) {
    await this.operators.require(actor, 'activate');
    if (!validId(appId)) return fail(404, 'application_not_found');
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'invalid_application_launch');
    const body = input as Record<string, unknown>, keys = ['launchUrl', 'expectedVersion', 'reference'];
    if (Object.keys(body).length !== keys.length || Object.keys(body).some(key => !keys.includes(key)) ||
        !(body.launchUrl === null || typeof body.launchUrl === 'string') || typeof body.expectedVersion !== 'string' ||
        !/^[a-f0-9]{64}$/.test(body.expectedVersion) || !validOperatorReference(body.reference)) return fail(400, 'invalid_application_launch');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      // Application-first matches lifecycle/provisioning/suspension. Actor and grant
      // locks retain current write authority until navigation metadata and audit commit.
      const app = (await db.query<AppRow>(`SELECT ${columns} FROM applications WHERE id=$1 FOR UPDATE`, [appId])).rows[0];
      await this.lockAuthority(db, actor);
      if (!app) return fail(404, 'application_not_found');
      if (protectedClients.has(app.client_id)) return fail(403, 'protected_application');
      if (!eligible(app)) return fail(409, 'application_launch_unavailable');
      const launchUrl = body.launchUrl === null ? null : applicationLaunchUrl(body.launchUrl, app.redirect_uri);
      const launch = (await db.query<LaunchRow>('SELECT launch_url,revision,updated_at,reference FROM application_launches WHERE application_id=$1', [appId])).rows[0];
      const prior = (await db.query<{ expected_version: string; launch_url: string | null }>(`SELECT expected_version,launch_url FROM application_launch_commands
        WHERE application_id=$1 AND actor_person_id=$2 AND reference=$3`, [appId, actor, body.reference])).rows[0];
      if (prior) {
        if (prior.expected_version !== body.expectedVersion || prior.launch_url !== launchUrl) return fail(409, 'application_launch_reference_conflict');
        await db.query('COMMIT');
        return { ...envelope(app, launch, true), changed: false };
      }
      if (version(app, launch) !== body.expectedVersion) return fail(409, 'stale_application_launch');
      const changed = (launch?.launch_url ?? null) !== launchUrl;
      let updated = launch;
      if (changed) {
        updated = (await db.query<LaunchRow>(`INSERT INTO application_launches(application_id,launch_url,revision,updated_by,reference)
          VALUES($1,$2,1,$3,$4) ON CONFLICT(application_id) DO UPDATE SET launch_url=EXCLUDED.launch_url,
          revision=application_launches.revision+1,updated_by=EXCLUDED.updated_by,updated_at=clock_timestamp(),reference=EXCLUDED.reference
          RETURNING launch_url,revision,updated_at,reference`, [appId, launchUrl, actor, body.reference])).rows[0]!;
        const action = launchUrl === null ? 'application.launch_removed' : 'application.launch_set';
        await db.query('INSERT INTO application_events(application_id,actor_person_id,action) VALUES($1,$2,$3)', [appId, actor, action]);
        await db.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
          VALUES($1,$2,'application',$3,$4)`, [actor, action, appId, body.reference]);
      }
      await db.query(`INSERT INTO application_launch_commands(application_id,actor_person_id,reference,expected_version,launch_url)
        VALUES($1,$2,$3,$4,$5)`, [appId, actor, body.reference, body.expectedVersion, launchUrl]);
      await db.query('COMMIT');
      return { ...envelope(app, updated, true), changed };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  /** Internal enrichment only: accepts the already permitted visible row IDs and never discovers more apps. */
  async forApplications(appIds: readonly string[]): Promise<Map<string, string>> {
    if (!Array.isArray(appIds) || !appIds.every(validId)) return fail(400, 'invalid_application_launch');
    const links = new Map<string, string>();
    if (!appIds.length) return links;
    const rows = (await this.pool.query<AppRow & LaunchRow>(`SELECT a.id,a.client_id,a.status,a.trust_class,a.redirect_uri,l.launch_url
      FROM applications a JOIN application_launches l ON l.application_id=a.id WHERE a.id=ANY($1::uuid[])
      AND a.status='active' AND a.trust_class='first_party'`, [appIds])).rows;
    for (const app of rows) {
      if (!app.launch_url || protectedClients.has(app.client_id)) continue;
      try { links.set(app.id, applicationLaunchUrl(app.launch_url, app.redirect_uri)); } catch { /* Invalid metadata has no public link. */ }
    }
    return links;
  }

  private async lockAuthority(db: PoolClient, actor: string) {
    const person = await db.query<{ status: string }>('SELECT status FROM persons WHERE id=$1 FOR SHARE', [actor]);
    if (person.rows[0]?.status !== 'active') return fail(403, 'operator_access_denied');
    const role = await db.query(`SELECT person_id FROM platform_operator_roles
      WHERE person_id=$1 AND role='application_operator' AND revoked_at IS NULL FOR SHARE`, [actor]);
    if (!role.rowCount) return fail(403, 'operator_access_denied');
  }
}
