import { adminUuid, type AdminAccess } from './admin-model';
import { applicationSuspensionNotices, parseApplicationSuspensionDetail, validApplicationVersion, validSuspensionReference } from './application-suspension-model';

type Access = { state: 'ready'; access: AdminAccess } | { state: 'signed-out' | 'forbidden' | 'unavailable' };
type Dependencies = { getAccess: () => Promise<Access>; api: (path: string, init: { method: string; body: object }) => Promise<Response> };
const headers = { 'cache-control': 'private, no-store, max-age=0' };
const error = (message: string, status: number) => new Response(message, { status, headers });
const redirect = (path: string, origin: string) => new Response(null, { status: 303, headers: { ...headers, location: new URL(path, origin).href } });
async function formBody(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 4096) { await reader.cancel(); return null; } chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function handleApplicationSuspension(request: Request, expectedOrigin: string, applicationId: string, dependencies: Dependencies) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== expectedOrigin) return error('Origin rejected', 403);
  if (!adminUuid(applicationId)) return error('Application unavailable', 404);
  let access: Access;
  try { access = await dependencies.getAccess(); } catch { return error('Administration is unavailable', 503); }
  if (access.state === 'signed-out') return redirect('/auth/login', expectedOrigin);
  if (access.state === 'forbidden') return error('Operator access required', 403);
  if (access.state !== 'ready') return error('Administration is unavailable', 503);
  if (access.access.capabilities.activateApplications !== true) return error('Application operator access required', 403);
  const form = await formBody(request), keys = ['intent', 'expectedStatus', 'expectedVersion', 'confirmationClientId', 'reference'];
  if (!form || keys.some(key => form.getAll(key).length !== 1) || Array.from(form.keys()).some(key => !keys.includes(key))) return error('Invalid application suspension', 400);
  const expectedVersion = form.get('expectedVersion'), confirmationClientId = form.get('confirmationClientId'), reference = form.get('reference')?.trim();
  if (form.get('intent') !== 'suspend' || form.get('expectedStatus') !== 'active' || !validApplicationVersion(expectedVersion) ||
    typeof confirmationClientId !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(confirmationClientId) || !validSuspensionReference(reference)) return error('Invalid application suspension', 400);
  let notice = 'unavailable';
  try {
    const response = await dependencies.api(`/v1/admin/applications/${applicationId}/suspension`, {
      method: 'POST', body: { expectedStatus: 'active', expectedVersion, confirmationClientId, reference },
    });
    if (response.status === 401) return redirect('/auth/login', expectedOrigin);
    const body: unknown = await response.json().catch(() => null);
    const code = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : '';
    if (response.status === 403 && code !== 'protected_application') return error('Application operator access required', 403);
    const detail = parseApplicationSuspensionDetail(body);
    if (response.ok && detail?.application.id === applicationId && detail.application.clientId === confirmationClientId &&
      detail.application.status === 'suspended' && detail.application.suspensionReference === reference &&
      BigInt(detail.application.version) === BigInt(expectedVersion) + 1n && body && typeof body === 'object' &&
      'changed' in body && typeof body.changed === 'boolean') notice = body.changed ? 'suspended' : 'unchanged';
    else if (!response.ok && Object.hasOwn(applicationSuspensionNotices, code)) notice = code;
  } catch { /* A lost response does not establish whether the transaction committed. */ }
  return redirect(`/admin/applications/${applicationId}/suspension?notice=${encodeURIComponent(notice)}`, expectedOrigin);
}
