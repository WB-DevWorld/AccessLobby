import { adminContract, adminUuid, type AdminAccess } from './admin-model';
import { personControlNotices, validPersonReference, validPersonVersion } from './person-controls-model';

type AccessResult = { state: 'ready'; access: AdminAccess } | { state: 'signed-out' | 'forbidden' | 'unavailable' };
type Dependencies = { getAccess: () => Promise<AccessResult>; api: (path: string, init: { method: string; body: object }) => Promise<Response> };
const headers = { 'cache-control': 'private, no-store, max-age=0' };
const error = (text: string, status: number) => new Response(text, { status, headers });
const redirect = (path: string, expectedOrigin: string) => new Response(null,
  { status: 303, headers: { ...headers, location: new URL(path, expectedOrigin).href } });

async function readForm(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function handlePersonStatusChange(request: Request, expectedOrigin: string, dependencies: Dependencies) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== expectedOrigin) return error('Origin rejected', 403);
  let access: AccessResult;
  try { access = await dependencies.getAccess(); } catch { return error('Administration is unavailable', 503); }
  if (access.state === 'signed-out') return redirect('/auth/login', expectedOrigin);
  if (access.state === 'forbidden') return error('Operator access required', 403);
  if (access.state !== 'ready') return error('Administration is unavailable', 503);
  if (access.access.capabilities.managePeople !== true) return error('Person administration access required', 403);
  const form = await readForm(request);
  const keys = ['intent', 'personId', 'status', 'reference', 'expectedVersion'];
  if (!form || keys.some(key => form.getAll(key).length !== 1) || Array.from(form.keys()).some(key => !keys.includes(key))) {
    return error('Invalid person change', 400);
  }
  const personId = form.get('personId'); const status = form.get('status');
  const reference = form.get('reference')?.trim(); const expectedVersion = form.get('expectedVersion');
  if (form.get('intent') !== 'change-status' || !adminUuid(personId) || (status !== 'active' && status !== 'suspended') ||
      !validPersonReference(reference) || !validPersonVersion(expectedVersion)) return error('Invalid person change', 400);
  let notice = 'unavailable';
  try {
    const response = await dependencies.api(`/v1/admin/people/${personId}/status`, {
      method: 'POST', body: { status, reference, expectedVersion },
    });
    if (response.status === 401) return redirect('/auth/login', expectedOrigin);
    const body = await response.json().catch(() => ({})) as {
      contract?: string; changed?: boolean; person?: { id?: string; status?: string; statusVersion?: string }; error?: string;
    };
    if (response.status === 403 && !['self_status_change_forbidden', 'protected_operator_person'].includes(body.error ?? '')) {
      return error('Person administration access required', 403);
    }
    if (response.ok && body.contract === adminContract && body.person?.id === personId && body.person.status === status &&
        validPersonVersion(body.person.statusVersion) && typeof body.changed === 'boolean') {
      notice = body.changed ? status === 'suspended' ? 'suspended' : 'reenabled' : 'unchanged';
    } else if (!response.ok && typeof body.error === 'string' && Object.hasOwn(personControlNotices, body.error)) notice = body.error;
  } catch { /* A response lost after commit is uncertain; inspect before retry. */ }
  return redirect(`/admin/people/${personId}?notice=${encodeURIComponent(notice)}`, expectedOrigin);
}
