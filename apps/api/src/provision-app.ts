/** Private, one-app first-party reconciler. Never expose this entry point as an HTTP route. */
import { Pool } from 'pg';
import { exactApplicationUrl } from './applications.js';
import { validId } from './organizations.js';
import { originProofPresent, proofHost, verifiableOrigin } from './origin-proof.js';

interface AppRow { id: string; client_id: string; name: string; redirect_uri: string; logout_uri: string; backchannel_logout_uri: string | null;
  status: string; trust_class: string; owner_active: boolean; origin_challenge: string;
  origin_verified_at: Date | null; origin_verified_host: string | null }
interface ClientRep { clientId: string; name?: string; enabled: boolean; protocol: string; publicClient: boolean;
  standardFlowEnabled: boolean; implicitFlowEnabled: boolean; directAccessGrantsEnabled: boolean;
  serviceAccountsEnabled: boolean; redirectUris: string[]; webOrigins: string[];
  attributes: Record<string, string>; protocolMappers?: Array<{ name: string; protocol?: string; protocolMapper: string; config: Record<string, string> }>;
  id?: string }

export function representation(row: AppRow): ClientRep {
  const redirect = exactApplicationUrl(row.redirect_uri);
  const logout = exactApplicationUrl(row.logout_uri);
  if (new URL(redirect).origin !== new URL(logout).origin) throw new Error('Stored application origin mismatch');
  const backchannel = row.backchannel_logout_uri ? exactApplicationUrl(row.backchannel_logout_uri) : null;
  if (backchannel && new URL(redirect).origin !== new URL(backchannel).origin) throw new Error('Stored backchannel origin mismatch');
  return {
    clientId: row.client_id, name: row.name, enabled: true, protocol: 'openid-connect', publicClient: true,
    standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false, redirectUris: [redirect], webOrigins: [new URL(redirect).origin],
    attributes: { 'pkce.code.challenge.method': 'S256', 'post.logout.redirect.uris': logout,
      ...(backchannel ? { 'backchannel.logout.url': backchannel, 'backchannel.logout.session.required': 'true' } : {}) },
    protocolMappers: [{ name: 'accesslobby-api-audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
      config: { 'included.client.audience': 'accesslobby-api', 'access.token.claim': 'true', 'id.token.claim': 'false' } }]
  };
}

export function matchesClient(actual: ClientRep, desired: ClientRep, mappers: ClientRep['protocolMappers']): boolean {
  const sameList = (a: string[] | undefined, b: string[]) => Array.isArray(a) && a.length === b.length && a.every((item, i) => item === b[i]);
  const mapper = mappers?.find(item => item.name === 'accesslobby-api-audience');
  return actual.clientId === desired.clientId && actual.enabled === true && actual.protocol === 'openid-connect' &&
    actual.publicClient === true && actual.standardFlowEnabled === true && actual.implicitFlowEnabled === false &&
    actual.directAccessGrantsEnabled === false && actual.serviceAccountsEnabled === false &&
    sameList(actual.redirectUris, desired.redirectUris) && sameList(actual.webOrigins, desired.webOrigins) &&
    actual.attributes?.['pkce.code.challenge.method'] === 'S256' &&
    actual.attributes?.['post.logout.redirect.uris'] === desired.attributes['post.logout.redirect.uris'] &&
    (actual.attributes?.['backchannel.logout.url'] ?? '') === (desired.attributes['backchannel.logout.url'] ?? '') &&
    (!desired.attributes['backchannel.logout.url'] || actual.attributes?.['backchannel.logout.session.required'] === 'true') &&
    mapper?.protocolMapper === 'oidc-audience-mapper' &&
    mapper.config?.['included.client.audience'] === 'accesslobby-api' &&
    mapper.config?.['access.token.claim'] === 'true' && mapper.config?.['id.token.claim'] === 'false';
}

export function internalBase(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['iam', 'localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== '8080' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('IAM_INTERNAL_URL must be a protected http://iam:8080 or loopback:8080 endpoint');
  }
  return url.origin;
}

export async function reconcileClient(base: string, realm: string, token: string, wanted: ClientRep,
  fetcher: typeof fetch = fetch) {
  const endpoint = `${base}/admin/realms/${encodeURIComponent(realm)}/clients`;
  const request = async (url: string, init: RequestInit = {}) => {
    const response = await fetcher(url, { ...init, headers: { authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(8000) });
    return response;
  };
  const find = async () => {
    const response = await request(`${endpoint}?clientId=${encodeURIComponent(wanted.clientId)}`);
    if (!response.ok) throw new Error(`Keycloak client lookup failed (${response.status})`);
    const list = await response.json() as ClientRep[];
    return list.find(client => client.clientId === wanted.clientId);
  };
  let client = await find();
  if (!client) {
    const created = await request(endpoint, { method: 'POST', body: JSON.stringify(wanted) });
    if (!created.ok && created.status !== 409) throw new Error(`Keycloak client creation failed (${created.status})`);
    client = await find();
  }
  if (!client?.id) throw new Error('Keycloak client missing after registration');
  const detail = await request(`${endpoint}/${encodeURIComponent(client.id)}`);
  const mapperResponse = await request(`${endpoint}/${encodeURIComponent(client.id)}/protocol-mappers/models`);
  if (!detail.ok || !mapperResponse.ok) throw new Error('Keycloak client readback failed');
  if (!matchesClient(await detail.json() as ClientRep, wanted, await mapperResponse.json() as ClientRep['protocolMappers'])) {
    throw new Error('Keycloak client differs from approved configuration; no activation');
  }
}

async function main() {
  const [appId, mode, reviewReference] = process.argv.slice(2);
  if (!validId(appId) || (mode !== '--plan' && mode !== '--activate-first-party')) {
    throw new Error('Usage: provision-app <application-uuid> --plan | --activate-first-party <review-reference>');
  }
  const databaseUrl = process.env.DATABASE_URL;
  const issuer = process.env.OIDC_ISSUER;
  if (!databaseUrl || !issuer) throw new Error('DATABASE_URL and OIDC_ISSUER required');
  const issuerUrl = new URL(issuer);
  if (issuerUrl.pathname !== '/realms/accesslobby-first-party' || issuerUrl.search || issuerUrl.hash ||
      (issuerUrl.protocol !== 'https:' && issuerUrl.hostname !== 'localhost')) throw new Error('Unexpected issuer');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query<AppRow>(`SELECT a.*, (p.status = 'active') AS owner_active
      FROM applications a JOIN persons p ON p.id = a.owner_person_id WHERE a.id = $1 FOR UPDATE OF a, p`, [appId]);
    const app = result.rows[0];
    if (!app || app.status !== 'requested' || app.trust_class !== 'unreviewed' || !app.owner_active) {
      throw new Error('Only requested applications with active owners may be activated');
    }
    const wanted = representation(app);
    if (mode === '--plan') {
      console.info(JSON.stringify({ applicationId: appId, issuer, client: wanted, state: 'plan-only' }, null, 2));
      await db.query('ROLLBACK');
      return;
    }
    if (!reviewReference || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reviewReference)) {
      throw new Error('A recorded first-party review reference is required');
    }
    const proofHostname = proofHost(app.redirect_uri);
    if (!app.origin_verified_at || app.origin_verified_host !== proofHostname ||
        !verifiableOrigin(app.redirect_uri) ||
        !(await originProofPresent(proofHostname, app.origin_challenge))) {
      throw new Error('Current DNS origin proof required before activation');
    }
    const token = process.env.IAM_PROVISIONING_TOKEN;
    if (!token) throw new Error('IAM_PROVISIONING_TOKEN required on the private provisioning runner');
    const base = internalBase(process.env.IAM_INTERNAL_URL ?? 'http://iam:8080');
    await reconcileClient(base, 'accesslobby-first-party', token, wanted);
    await db.query(`UPDATE applications SET status = 'active', trust_class = 'first_party', activated_at = now(), review_reference = $2
      WHERE id = $1`, [appId, reviewReference]);
    await db.query(`INSERT INTO application_events (application_id, action) VALUES ($1, 'application.activated')`, [appId]);
    await db.query('COMMIT');
    console.info(JSON.stringify({ applicationId: appId, status: 'active', clientId: app.client_id }));
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); await pool.end(); }
}

if (process.argv[1]?.endsWith('/provision-app.js') || process.argv[1]?.endsWith('/provision-app.ts')) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Provisioning failed'); process.exitCode = 1; });
}
