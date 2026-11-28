import { adminUuid, type AdminAccess } from './admin-model';

export const applicationLaunchContract = 'accesslobby.application-launch.v0.1' as const;
export type ApplicationLaunchDetail = { application: { id: string; clientId: string; name: string; status: 'requested' | 'active' | 'suspended' | 'cancelled';
  trustClass: 'unreviewed' | 'first_party' | 'external'; redirectUri: string }; launch: {
    launchUrl: string | null; version: string; updatedAt: string | null; reference: string | null; needsReview: boolean;
  }; canManage: boolean };
const protectedClients = new Set(['accesslobby-web', 'accesslobby-api']);
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const version = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const reference = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._:/-]{4,120}$/.test(value);
function publicHttps(value: unknown): URL | null {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\x00-\x20\x7f*]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.href === value && !url.username && !url.password && !value.includes('#') &&
      url.hostname.includes('.') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) && !url.hostname.startsWith('[') &&
      url.hostname !== 'localhost' && !/\.(?:localhost|local|internal|lan|home)$/i.test(url.hostname) ? url : null;
  } catch { return null; }
}

/** Only a validated API-provided entry URL can become an external navigation link. */
export function safeApplicationLaunchUrl(value: unknown): string | null {
  const url = publicHttps(value);
  return url && !url.search && !String(value).includes('?') && !url.pathname.includes('//') &&
    !/%2f|%5c|%0[0-9a-f]|%1[0-9a-f]|%7f/i.test(url.pathname) ? url.href : null;
}
export function applicationLaunchLink(app: { admission: string; admitted?: boolean; launchUrl?: unknown }): string | null {
  if (app.admitted !== undefined && app.admitted !== true) return null;
  return app.admission === 'authenticated_open' || (app.admission === 'grant_required' && app.admitted === true) ?
    safeApplicationLaunchUrl(app.launchUrl) : null;
}
export function parseApplicationLaunch(value: unknown): ApplicationLaunchDetail | null {
  if (!record(value) || value.contract !== applicationLaunchContract || !record(value.application) || !record(value.launch)) return null;
  const app = value.application, launch = value.launch;
  const callback = publicHttps(app.redirectUri);
  if (!adminUuid(app.id) || typeof app.clientId !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(app.clientId) || typeof app.name !== 'string' ||
      app.name.length < 2 || app.name.length > 120 || /[\x00-\x1f\x7f]/.test(app.name) ||
      !(app.status === 'requested' || app.status === 'active' || app.status === 'suspended' || app.status === 'cancelled') ||
      !(app.trustClass === 'unreviewed' || app.trustClass === 'first_party' || app.trustClass === 'external') || !callback ||
      !version(launch.version) || !(launch.launchUrl === null || safeApplicationLaunchUrl(launch.launchUrl)) ||
      (typeof launch.launchUrl === 'string' && new URL(launch.launchUrl).origin !== callback.origin) ||
      !(launch.updatedAt === null || (typeof launch.updatedAt === 'string' && launch.updatedAt.length <= 40 && Number.isFinite(Date.parse(launch.updatedAt)))) ||
      !(launch.reference === null || reference(launch.reference)) || (launch.updatedAt === null) !== (launch.reference === null) ||
      (launch.needsReview !== undefined && typeof launch.needsReview !== 'boolean') || (launch.needsReview === true && launch.launchUrl !== null) ||
      typeof value.canManage !== 'boolean' || (value.canManage && (app.status !== 'active' || app.trustClass !== 'first_party' || protectedClients.has(app.clientId)))) return null;
  return { application: { id: app.id, clientId: app.clientId, name: app.name, status: app.status, trustClass: app.trustClass,
    redirectUri: app.redirectUri as string }, launch: { launchUrl: launch.launchUrl as string | null, version: launch.version,
    updatedAt: launch.updatedAt, reference: launch.reference, needsReview: launch.needsReview === true }, canManage: value.canManage };
}

export const applicationLaunchNotices: Record<string, string> = {
  saved: 'Launch link saved.', removed: 'Launch link removed.', unchanged: 'No new change. Review the current launch link below.',
  invalid_application_launch_url: 'Use an HTTPS entry URL on the registered callback origin, without query parameters or a fragment.',
  stale_application_launch: 'This app or link changed. Review the current details and submit again.',
  application_launch_reference_conflict: 'This reference already identifies a different request. Use a new change reference.',
  application_launch_unavailable: 'Only active first-party apps can have a launch link.',
  protected_application: 'Core AccessLobby services use the protected operator process.',
  invalid_application_launch: 'Check the entry URL and change reference.', unavailable: 'The update could not be confirmed. Check the current link before retrying.',
};

type Access = { state: 'ready'; access: AdminAccess } | { state: 'signed-out' | 'forbidden' | 'unavailable' };
type Dependencies = { getAccess: () => Promise<Access>; api: (path: string, init: { method: string; body: object }) => Promise<Response> };
const headers = { 'cache-control': 'private, no-store, max-age=0' };
const error = (message: string, status: number) => new Response(message, { status, headers });
const redirect = (path: string, origin: string) => new Response(null, { status: 303, headers: { ...headers, location: new URL(path, origin).href } });
async function formBody(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 8192) { await reader.cancel(); return null; } chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function handleApplicationLaunch(request: Request, expectedOrigin: string, appId: string, dependencies: Dependencies) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== expectedOrigin) return error('Origin rejected', 403);
  if (!adminUuid(appId)) return error('Application unavailable', 404);
  let access: Access;
  try { access = await dependencies.getAccess(); } catch { return error('Administration is unavailable', 503); }
  if (access.state === 'signed-out') return redirect('/auth/login', expectedOrigin);
  if (access.state === 'forbidden') return error('Operator access required', 403);
  if (access.state !== 'ready') return error('Administration is unavailable', 503);
  if (access.access.capabilities.activateApplications !== true) return error('Application operator access required', 403);
  const form = await formBody(request), keys = ['launchUrl', 'expectedVersion', 'reference'];
  if (!form || keys.some(key => form.getAll(key).length !== 1) || Array.from(form.keys()).some(key => !keys.includes(key))) return error('Invalid launch link', 400);
  const raw = form.get('launchUrl'), expectedVersion = form.get('expectedVersion'), changeReference = form.get('reference');
  const launchUrl = raw === '' ? null : safeApplicationLaunchUrl(raw);
  if ((raw !== '' && launchUrl === null) || !version(expectedVersion) || !reference(changeReference)) return error('Invalid launch link', 400);
  let notice = 'unavailable';
  try {
    const response = await dependencies.api(`/v1/admin/applications/${appId.toLowerCase()}/launch`, {
      method: 'POST', body: { launchUrl, expectedVersion, reference: changeReference },
    });
    if (response.status === 401) return redirect('/auth/login', expectedOrigin);
    const body: unknown = await response.json().catch(() => null);
    const code = record(body) && typeof body.error === 'string' ? body.error : '';
    if (response.status === 403 && code !== 'protected_application') return error('Application operator access required', 403);
    const parsed = parseApplicationLaunch(body);
    if (response.ok && parsed?.application.id === appId.toLowerCase() && record(body) && typeof body.changed === 'boolean') {
      // An exact retry can return later current metadata. Never describe an old command as newly applied.
      if (!body.changed) notice = 'unchanged';
      else if (parsed.canManage && parsed.launch.launchUrl === launchUrl && parsed.launch.reference === changeReference &&
        parsed.launch.version !== expectedVersion) notice = launchUrl === null ? 'removed' : 'saved';
    } else if (!response.ok && Object.hasOwn(applicationLaunchNotices, code)) notice = code;
  } catch { /* A lost response does not establish whether the transaction committed. */ }
  return redirect(`/admin/applications/${appId.toLowerCase()}/launch?notice=${encodeURIComponent(notice)}`, expectedOrigin);
}
