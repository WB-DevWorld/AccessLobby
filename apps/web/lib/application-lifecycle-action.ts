import { applicationLifecycleContract, applicationLifecycleNotices, lifecycleHash, lifecycleUuid } from './application-lifecycle';

type Dependencies = { hasSession: () => Promise<boolean>; api: (path: string, init: { method: string; body?: object }) => Promise<Response> };
const error = (message: string, status: number) => new Response(message, { status, headers: { 'cache-control': 'private, no-store, max-age=0' } });
const redirect = (path: string, origin: string) => new Response(null, { status: 303, headers: { location: new URL(path, origin).href, 'cache-control': 'private, no-store, max-age=0' } });
const originalErrors = new Set(['invalid_application_url', 'application_origin_mismatch', 'application_path_mismatch', 'invalid_application_platform',
  'invalid_client_id', 'client_id_taken', 'too_many_application_requests', 'invalid_application_name', 'invalid_visibility', 'invalid_admission',
  'person_not_found', 'application_not_found', 'application_grants_unavailable', 'grant_not_found', 'origin_proof_missing',
  'origin_verification_unavailable', 'application_verification_unavailable', 'public_domain_required']);

async function form(request: Request): Promise<URLSearchParams | null> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/x-www-form-urlencoded' || !request.body) return null;
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 32768) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function handleApplicationAction(request: Request, expectedOrigin: string, dependencies: Dependencies) {
  if (request.method !== 'POST') return error('Method not allowed', 405);
  if (request.headers.get('origin') !== expectedOrigin) return error('Origin rejected', 403);
  try { if (!await dependencies.hasSession()) return redirect('/auth/login', expectedOrigin); }
  catch { return error('Account access unavailable', 503); }
  const data = await form(request);
  if (!data || [...new Set(data.keys())].some(key => data.getAll(key).length !== 1)) return error('Invalid app action', 400);
  const value = (key: string) => data.get(key)?.trim() ?? '';
  const intent = value('intent'), appId = value('applicationId').toLowerCase(), personId = value('personId').toLowerCase();
  const lifecycle = ['edit', 'cancel', 'resubmit'].includes(intent);
  const keys = intent === 'request' ? ['intent', 'name', 'clientId', 'platform', 'redirectUri', 'logoutUri', 'backchannelLogoutUri', 'visibility', 'admission'] :
    intent === 'verify' ? ['intent', 'applicationId'] : ['grant', 'revoke'].includes(intent) ? ['intent', 'applicationId', 'personId'] :
    lifecycle ? ['intent', 'applicationId', 'expectedConfigurationHash', 'reference', ...(intent === 'edit' ? ['name', 'platform', 'redirectUri', 'logoutUri', 'backchannelLogoutUri', 'visibility', 'admission'] : [])] : [];
  if (!keys.length || [...data.keys()].some(key => !keys.includes(key))) return error('Invalid app action', 400);
  let path: string, method = 'POST', body: object | undefined;
  if (intent === 'request') {
    path = '/v1/applications';
    body = { name: value('name'), clientId: value('clientId'), platform: value('platform') || 'web',
      redirectUri: value('redirectUri'), logoutUri: value('logoutUri'), backchannelLogoutUri: value('backchannelLogoutUri'),
      visibility: value('visibility'), admission: value('admission') };
  } else if (intent === 'verify' && lifecycleUuid(appId)) path = `/v1/applications/${appId}/verify-origin`;
  else if (['grant', 'revoke'].includes(intent) && lifecycleUuid(appId) && lifecycleUuid(personId)) {
    path = `/v1/applications/${appId}/grants${intent === 'revoke' ? `/${personId}` : ''}`;
    if (intent === 'grant') body = { personId }; else method = 'DELETE';
  } else if (lifecycle && lifecycleUuid(appId) && lifecycleHash(value('expectedConfigurationHash')) && /^[A-Za-z0-9._:/-]{4,120}$/.test(value('reference'))) {
    path = `/v1/applications/${appId}${intent === 'edit' ? '' : `/${intent}`}`;
    method = intent === 'edit' ? 'PATCH' : 'POST';
    body = { expectedConfigurationHash: value('expectedConfigurationHash'), reference: value('reference'),
      ...(intent === 'edit' ? { name: value('name'), platform: value('platform'), redirectUri: value('redirectUri'),
        logoutUri: value('logoutUri'), backchannelLogoutUri: value('backchannelLogoutUri'), visibility: value('visibility'), admission: value('admission') } : {}) };
  } else return error('Invalid app action', 400);
  let notice = intent === 'request' ? 'requested' : intent === 'verify' ? 'verified' : intent === 'grant' ? 'granted' : intent === 'revoke' ? 'revoked' :
    intent === 'edit' ? 'edited' : intent === 'cancel' ? 'cancelled' : 'resubmitted';
  try {
    const response = await dependencies.api(path, { method, ...(body ? { body } : {}) });
    if (response.status === 401) return redirect('/auth/login', expectedOrigin);
    if (response.status === 403) return error('Current account access required', 403);
    const result = await response.json().catch(() => ({})) as { contract?: string; applicationId?: string; status?: string; configurationHash?: string; changed?: boolean; error?: string };
    if (!response.ok) notice = typeof result.error === 'string' && (originalErrors.has(result.error) || Object.hasOwn(applicationLifecycleNotices, result.error)) ? result.error : 'identity_unavailable';
    else if (lifecycle) {
      if (result.contract !== applicationLifecycleContract || result.applicationId !== appId ||
          !['requested', 'cancelled', 'active', 'suspended'].includes(result.status ?? '') ||
          !lifecycleHash(result.configurationHash) || typeof result.changed !== 'boolean') notice = 'identity_unavailable';
      else if (!result.changed) notice = 'unchanged';
      else if ((intent === 'cancel' && result.status !== 'cancelled') ||
          (intent === 'resubmit' && result.status !== 'requested') ||
          (intent === 'edit' && !['requested', 'cancelled'].includes(result.status!))) notice = 'identity_unavailable';
    }
  } catch { notice = 'identity_unavailable'; }
  return redirect(lifecycle ? `/apps/manage/${appId}?notice=${encodeURIComponent(notice)}` : `/apps/manage?notice=${encodeURIComponent(notice)}`, expectedOrigin);
}
