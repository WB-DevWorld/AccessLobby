/** Private first-party suspension. Deny API access before attempting IAM disable. */
import { Pool } from 'pg';
import { internalBase } from './provision-app.js';
import { validId } from './organizations.js';

export async function suspendRegistry(pool: Pool, appId: string, reference: string): Promise<string> {
  if (!validId(appId) || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reference)) {
    throw new Error('Application UUID and suspension reference required');
  }
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query<{ client_id: string; status: string; trust_class: string; suspension_reference: string | null }>(
      'SELECT client_id, status, trust_class, suspension_reference FROM applications WHERE id = $1 FOR UPDATE', [appId]);
    const app = result.rows[0];
    if (!app || app.trust_class !== 'first_party' || !['active', 'suspended'].includes(app.status)) {
      throw new Error('Only an activated first-party application may be suspended');
    }
    if (app.status === 'suspended' && app.suspension_reference !== reference) {
      throw new Error('Suspension retry requires the original reference');
    }
    if (app.status === 'active') {
      await db.query(`UPDATE applications SET status = 'suspended', suspended_at = now(), suspension_reference = $2 WHERE id = $1`,
        [appId, reference]);
      await db.query(`INSERT INTO application_events (application_id, action) VALUES ($1, 'application.suspended')`, [appId]);
    }
    await db.query('COMMIT');
    return app.client_id;
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function disableIamClient(base: string, realm: string, token: string, clientId: string,
  fetcher: typeof fetch = fetch): Promise<'disabled' | 'absent'> {
  const endpoint = `${base}/admin/realms/${encodeURIComponent(realm)}/clients`;
  const request = (url: string, init: RequestInit = {}) => fetcher(url, {
    ...init, headers: { authorization: `Bearer ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(8000),
  });
  const found = await request(`${endpoint}?clientId=${encodeURIComponent(clientId)}`);
  if (!found.ok) throw new Error(`IAM client lookup failed (${found.status})`);
  const matches = (await found.json() as Array<{ id?: string; clientId?: string }>).filter(item => item.clientId === clientId);
  if (matches.length === 0) return 'absent';
  if (matches.length !== 1 || !matches[0]?.id) throw new Error('IAM client lookup ambiguous');
  const detailUrl = `${endpoint}/${encodeURIComponent(matches[0].id)}`;
  const detail = await request(detailUrl);
  if (!detail.ok) throw new Error(`IAM client read failed (${detail.status})`);
  const client = await detail.json() as { clientId?: string; enabled?: boolean; [key: string]: unknown };
  if (client.clientId !== clientId) throw new Error('IAM client identity changed');
  if (client.enabled !== false) {
    const changed = await request(detailUrl, { method: 'PUT', body: JSON.stringify({ ...client, enabled: false }) });
    if (!changed.ok) throw new Error(`IAM client disable failed (${changed.status})`);
  }
  const readback = await request(detailUrl);
  if (!readback.ok) throw new Error(`IAM client readback failed (${readback.status})`);
  const actual = await readback.json() as { clientId?: string; enabled?: boolean };
  if (actual.clientId !== clientId || actual.enabled !== false) throw new Error('IAM client still enabled after suspension');
  return 'disabled';
}

async function main() {
  const [appId, mode, reference] = process.argv.slice(2);
  if (!validId(appId) || mode !== '--suspend' || !reference) {
    throw new Error('Usage: suspend-app <application-uuid> --suspend <reference>');
  }
  const databaseUrl = process.env.DATABASE_URL;
  const issuer = process.env.OIDC_ISSUER;
  const token = process.env.IAM_PROVISIONING_TOKEN;
  if (!databaseUrl || !issuer || !token) throw new Error('DATABASE_URL, OIDC_ISSUER and IAM_PROVISIONING_TOKEN required');
  const issuerUrl = new URL(issuer);
  if (issuerUrl.pathname !== '/realms/accesslobby-first-party' || issuerUrl.search || issuerUrl.hash ||
      (issuerUrl.protocol !== 'https:' && issuerUrl.hostname !== 'localhost')) throw new Error('Unexpected issuer');
  const base = internalBase(process.env.IAM_INTERNAL_URL ?? 'http://iam:8080');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const clientId = await suspendRegistry(pool, appId, reference);
    // If IAM is unavailable, the registry remains suspended. Retry this command to finish disable.
    const iamClientState = await disableIamClient(base, 'accesslobby-first-party', token, clientId);
    console.info(JSON.stringify({ applicationId: appId, status: 'suspended', iamClientState }));
  } finally { await pool.end(); }
}

if (process.argv[1]?.endsWith('/suspend-app.js') || process.argv[1]?.endsWith('/suspend-app.ts')) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'Suspension failed'); process.exitCode = 1; });
}
