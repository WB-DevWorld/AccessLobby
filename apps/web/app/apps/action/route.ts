import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccessToken, identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';

const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const known = new Set(['invalid_application_url', 'application_origin_mismatch', 'invalid_client_id', 'client_id_taken', 'too_many_application_requests',
  'invalid_application_name', 'invalid_visibility', 'invalid_admission', 'person_not_found', 'application_not_found',
  'application_grants_unavailable', 'grant_not_found', 'origin_proof_missing', 'origin_verification_unavailable',
  'application_verification_unavailable', 'public_domain_required']);

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== origin()) return new NextResponse('Origin rejected', { status: 403 });
  if (!await getCurrentAccessToken()) return NextResponse.redirect(new URL('/auth/login', origin()), 303);
  const form = await request.formData();
  const field = (key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : '';
  const intent = field('intent');
  const appId = field('applicationId');
  const personId = field('personId');
  let path: string; let method = 'POST'; let body: object | undefined;
  if (intent === 'request') {
    path = '/v1/applications';
    body = { name: field('name'), clientId: field('clientId'), redirectUri: field('redirectUri'),
      logoutUri: field('logoutUri'), backchannelLogoutUri: field('backchannelLogoutUri'),
      visibility: field('visibility'), admission: field('admission') };
  } else if (intent === 'verify' && uuid(appId)) {
    path = `/v1/applications/${appId}/verify-origin`;
  } else if ((intent === 'grant' || intent === 'revoke') && uuid(appId) && uuid(personId)) {
    path = `/v1/applications/${appId}/grants${intent === 'revoke' ? `/${personId}` : ''}`;
    if (intent === 'grant') body = { personId }; else method = 'DELETE';
  } else return new NextResponse('Invalid app action', { status: 400 });
  let notice = intent === 'request' ? 'requested' : intent === 'grant' ? 'granted' : intent === 'verify' ? 'verified' : 'revoked';
  try {
    const response = await identityApi(path, { method, ...(body ? { body } : {}) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      notice = error.error && known.has(error.error) ? error.error : 'identity_unavailable';
    }
  } catch { notice = 'identity_unavailable'; }
  return NextResponse.redirect(new URL(`/apps?notice=${encodeURIComponent(notice)}`, origin()), 303);
}
