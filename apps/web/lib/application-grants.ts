import { lifecycleUuid } from './application-lifecycle';
import { handleApplicationAction } from './application-lifecycle-action';

export const applicationGrantsContract = 'accesslobby.application-grants.v0.1' as const;
export type ApplicationGrant = { personId: string; personStatus: 'active' | 'suspended'; status: 'active' | 'revoked';
  grantedAt: string; grantedByPersonId: string; expiresAt: string | null; revokedAt: string | null; expired: boolean };
export type ApplicationGrantsPage = { application: { id: string; clientId: string; name: string; status: 'active'; trustClass: 'first_party'; admission: 'grant_required' };
  grants: ApplicationGrant[]; nextCursor: string | null };
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const utcDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace(/Z$/, '.000Z') : value);
const nullableDate = (value: unknown): value is string | null => value === null || utcDate(value);
export function grantExpiry(value: unknown, now = Date.now()): string | undefined | false {
  if (value === undefined || value === '') return undefined;
  return utcDate(value) && Date.parse(value) > now ? new Date(value).toISOString() : false;
}
export function parseApplicationGrants(value: unknown, expectedId: string): ApplicationGrantsPage | null {
  if (!record(value) || value.contract !== applicationGrantsContract || !record(value.application) || !Array.isArray(value.grants) || value.grants.length > 25 ||
      !(value.nextCursor === null || lifecycleUuid(value.nextCursor))) return null;
  const app = value.application;
  if (!lifecycleUuid(expectedId) || app.id !== expectedId.toLowerCase() || !lifecycleUuid(app.id) || typeof app.clientId !== 'string' ||
      !/^[a-z0-9_-]{1,80}$/.test(app.clientId) || typeof app.name !== 'string' || app.name.length < 2 || app.name.length > 120 ||
      /[\x00-\x1f\x7f]/.test(app.name) || app.status !== 'active' || app.trustClass !== 'first_party' || app.admission !== 'grant_required') return null;
  const grants: ApplicationGrant[] = [];
  for (const row of value.grants) {
    if (!record(row) || !lifecycleUuid(row.personId) || !lifecycleUuid(row.grantedByPersonId) ||
        !(row.personStatus === 'active' || row.personStatus === 'suspended') || !(row.status === 'active' || row.status === 'revoked') ||
        !utcDate(row.grantedAt) || !nullableDate(row.expiresAt) || !nullableDate(row.revokedAt) || typeof row.expired !== 'boolean' ||
        (row.expired && (row.status !== 'active' || row.expiresAt === null))) return null;
    grants.push({ personId: row.personId, grantedByPersonId: row.grantedByPersonId, personStatus: row.personStatus, status: row.status,
      grantedAt: row.grantedAt, expiresAt: row.expiresAt, revokedAt: row.revokedAt, expired: row.expired });
  }
  if (new Set(grants.map(row => row.personId)).size !== grants.length ||
      (value.nextCursor !== null && (grants.length !== 25 || grants.at(-1)?.personId !== value.nextCursor))) return null;
  return { application: { id: app.id, clientId: app.clientId, name: app.name, status: 'active', trustClass: 'first_party', admission: 'grant_required' }, grants, nextCursor: value.nextCursor };
}
export function applicationGrantsHref(appId: unknown, after?: unknown, personId?: unknown): string | null {
  if (!lifecycleUuid(appId) || (after !== undefined && !lifecycleUuid(after)) || (personId !== undefined && !lifecycleUuid(personId))) return null;
  const params = new URLSearchParams();
  if (typeof after === 'string') params.set('after', after.toLowerCase());
  if (typeof personId === 'string') params.set('personId', personId.toLowerCase());
  return `/apps/manage/${appId.toLowerCase()}/grants${params.size ? `?${params}` : ''}`;
}
export const applicationGrantNotices: Record<string, string> = {
  granted: 'Entry granted or renewed.', revoked: 'Entry revoked. Existing sessions follow the app’s checks and expiry.',
  invalid_expiry: 'Use a future UTC date such as 2027-01-01T18:30:00Z, or leave blank for no expiry.',
  person_not_found: 'That active AccessLobby person was not found.', application_not_found: 'This app is unavailable to you.',
  application_grants_unavailable: 'Entry grants require an active, restricted first-party app.', grant_not_found: 'No active grant was found for this person.',
  identity_unavailable: 'The change could not be confirmed. Check the current grant before retrying.',
};
type Dependencies = { hasSession: () => Promise<boolean>; api: (path: string, init: { method: string; body?: object }) => Promise<Response> };
const headers = { 'cache-control': 'private, no-store, max-age=0' };
const error = (message: string, status: number) => new Response(message, { status, headers });
const redirect = (path: string, origin: string) => new Response(null, { status: 303, headers: { ...headers, location: new URL(path, origin).href } });
async function formBody(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > 32768) { await reader.cancel(); return null; } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; } finally { reader.releaseLock(); }
}
/** Enhances only grant/revoke. All request, DNS and lifecycle actions retain their existing handler. */
export async function handleApplicationGrantAction(request: Request, expectedOrigin: string, dependencies: Dependencies) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== expectedOrigin) return error('Origin rejected', 403);
  try { if (!await dependencies.hasSession()) return redirect('/auth/login', expectedOrigin); } catch { return error('Account access unavailable', 503); }
  const form = await formBody(request);
  if (!form || [...new Set(form.keys())].some(key => form.getAll(key).length !== 1)) return error('Invalid app action', 400);
  const intent = form.get('intent')?.trim();
  if (intent !== 'grant' && intent !== 'revoke') {
    const forwardedHeaders = new Headers(request.headers); forwardedHeaders.delete('content-length');
    return handleApplicationAction(new Request(request.url, { method: 'POST', headers: forwardedHeaders, body: form.toString() }), expectedOrigin,
      { hasSession: async () => true, api: dependencies.api });
  }
  const keys = ['intent', 'applicationId', 'personId', 'expiresAt', 'grantView'];
  const appId = form.get('applicationId')?.trim().toLowerCase(), personId = form.get('personId')?.trim().toLowerCase(), view = form.get('grantView');
  const expiry = grantExpiry(form.has('expiresAt') ? form.get('expiresAt') : undefined);
  if ([...form.keys()].some(key => !keys.includes(key)) || !lifecycleUuid(appId) || !lifecycleUuid(personId) || (view !== null && view !== 'detail')) return error('Invalid app action', 400);
  const destination = view === 'detail' ? `/apps/manage/${appId}/grants` : '/apps/manage';
  if (expiry === false) return redirect(`${destination}?notice=invalid_expiry`, expectedOrigin);
  let notice = intent === 'grant' ? 'granted' : 'revoked';
  try {
    const response = await dependencies.api(`/v1/applications/${appId}/grants${intent === 'revoke' ? `/${personId}` : ''}`, {
      method: intent === 'revoke' ? 'DELETE' : 'POST', ...(intent === 'grant' ? { body: { personId, ...(expiry ? { expiresAt: expiry } : {}) } } : {}),
    });
    if (response.status === 401) return redirect('/auth/login', expectedOrigin);
    if (response.status === 403) return error('Current account access required', 403);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) notice = record(body) && typeof body.error === 'string' && Object.hasOwn(applicationGrantNotices, body.error) ? body.error : 'identity_unavailable';
    else if (!record(body) || body.applicationId !== appId || body.personId !== personId || body.status !== (intent === 'grant' ? 'active' : 'revoked') ||
      (intent === 'grant' && body.expiresAt !== (expiry ?? null))) notice = 'identity_unavailable';
  } catch { notice = 'identity_unavailable'; }
  return redirect(`${destination}?notice=${encodeURIComponent(notice)}`, expectedOrigin);
}
