import { adminContract, adminUuid, type AdminAccess } from './admin-model';
import { validPersonReference } from './person-controls-model';
import { sessionInspectionNotices, validSessionSnapshot } from './session-inspection-model';

type Access = { state: 'ready'; access: AdminAccess } | { state: 'signed-out' | 'forbidden' | 'unavailable' };
type Dependencies = { getAccess: () => Promise<Access>; api: (path: string, init: { method: string; body: object }) => Promise<Response> };
const noStore = { 'cache-control': 'private, no-store, max-age=0' };
const error = (value: string, status: number) => new Response(value, { status, headers: noStore });
const redirect = (path: string, origin: string) => new Response(null, { status: 303, headers: { ...noStore, location: new URL(path, origin).href } });
async function form(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.byteLength;
      if (length > 4096) { await reader.cancel(); return null; } chunks.push(part.value); }
    const bytes = new Uint8Array(length); let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function handleSessionEnd(request: Request, origin: string, personId: string, dependencies: Dependencies) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== origin) return error('Origin rejected', 403);
  if (!adminUuid(personId)) return error('Person unavailable', 404);
  let access: Access;
  try { access = await dependencies.getAccess(); } catch { return error('Administration unavailable', 503); }
  if (access.state === 'signed-out') return redirect('/auth/login', origin);
  if (access.state === 'forbidden') return error('Operator access required', 403);
  if (access.state !== 'ready') return error('Administration unavailable', 503);
  if (access.access.capabilities.managePeople !== true) return error('Person administration access required', 403);
  const body = await form(request), keys = ['intent', 'handle', 'expectedState', 'reference'];
  if (!body || keys.some(key => body.getAll(key).length !== 1) || Array.from(body.keys()).some(key => !keys.includes(key))) return error('Invalid app association action', 400);
  const handle = body.get('handle'), expectedState = body.get('expectedState'), reference = body.get('reference')?.trim();
  if (body.get('intent') !== 'end-association' || !adminUuid(handle) || !validSessionSnapshot(expectedState) || !validPersonReference(reference)) return error('Invalid app association action', 400);
  const target = personId.toLowerCase(), normalizedHandle = handle.toLowerCase();
  let notice = 'unavailable';
  try {
    const response = await dependencies.api(`/v1/admin/people/${target}/sessions/${normalizedHandle}/end`, { method: 'POST', body: { expectedState, reference } });
    if (response.status === 401) return redirect('/auth/login', origin);
    const value = await response.json().catch(() => ({})) as { contract?: string; personId?: string; handle?: string; ended?: boolean; changed?: boolean; error?: string };
    if (response.status === 403 && !['self_session_end_forbidden', 'protected_operator_person'].includes(value.error ?? '')) return error('Person administration access required', 403);
    if (response.ok && value.contract === adminContract && value.personId === target && value.handle === normalizedHandle && value.ended === true && typeof value.changed === 'boolean') notice = value.changed ? 'ended' : 'unchanged';
    else if (!response.ok && typeof value.error === 'string' && Object.hasOwn(sessionInspectionNotices, value.error)) notice = value.error;
  } catch { /* A lost reply is uncertain until current records are inspected. */ }
  return redirect(`/admin/people/${target}/sessions?notice=${encodeURIComponent(notice)}`, origin);
}
