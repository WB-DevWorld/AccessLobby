import { adminHash, adminNotices, adminUuid, type AdminAccess } from './admin-model';

type AccessResult = { state: 'ready'; access: AdminAccess } | { state: 'signed-out' | 'forbidden' | 'unavailable' };
type Dependencies = { getAccess: () => Promise<AccessResult>; api: (path: string, init: { method: string; body: object }) => Promise<Response> };

async function boundedForm(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

const error = (message: string, status: number) => new Response(message, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
const redirect = (path: string, origin: string) => new Response(null, { status: 303,
  headers: { location: new URL(path, origin).href, 'cache-control': 'private, no-store, max-age=0' } });

export async function handleAdminReview(request: Request, expectedOrigin: string, dependencies: Dependencies): Promise<Response> {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== expectedOrigin) return error('Origin rejected', 403);
  let access: AccessResult;
  try { access = await dependencies.getAccess(); } catch { return error('Administration is unavailable', 503); }
  if (access.state === 'signed-out') return redirect('/auth/login', expectedOrigin);
  if (access.state === 'forbidden') return error('Operator access required', 403);
  if (access.state !== 'ready') return error('Administration is unavailable', 503);
  if (!access.access.capabilities.reviewApplications) return error('Application reviewer access required', 403);
  const form = await boundedForm(request);
  const keys = ['intent', 'applicationId', 'decision', 'reference', 'configurationHash'];
  if (!form || keys.some(key => form.getAll(key).length !== 1) || Array.from(form.keys()).some(key => !keys.includes(key))) {
    return error('Invalid review form', 400);
  }
  const applicationId = form.get('applicationId');
  const decision = form.get('decision');
  const reference = form.get('reference')?.trim();
  const configurationHash = form.get('configurationHash');
  if (form.get('intent') !== 'review' || !adminUuid(applicationId) || !adminHash(configurationHash) ||
      (decision !== 'approved' && decision !== 'rejected') || !reference || !/^[A-Za-z0-9._:/-]{4,120}$/.test(reference)) {
    return error('Invalid review form', 400);
  }
  let notice = 'unavailable';
  try {
    const response = await dependencies.api(`/v1/admin/applications/${applicationId}/review`, {
      method: 'POST', body: { decision, reference, configurationHash },
    });
    if (response.status === 401) return redirect('/auth/login', expectedOrigin);
    if (response.status === 403) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (body.error !== 'independent_reviewer_required') return error('Application reviewer access required', 403);
      notice = body.error;
    } else {
      const body = await response.json().catch(() => ({})) as { contract?: string; decision?: string; applicationId?: string; error?: string };
      if (response.ok && body.contract === 'accesslobby.admin.v0.1' && body.decision === decision && body.applicationId === applicationId) notice = decision;
      else if (!response.ok && typeof body.error === 'string' && Object.hasOwn(adminNotices, body.error)) notice = body.error;
    }
  } catch { /* An uncertain result must be checked before retrying. */ }
  return redirect(`/admin/applications/${applicationId}?notice=${encodeURIComponent(notice)}`, expectedOrigin);
}
