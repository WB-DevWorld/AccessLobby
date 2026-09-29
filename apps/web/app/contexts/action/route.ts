import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccessToken, identityApi } from '@/lib/current-identity';
import { contextCookie, getContexts } from '@/lib/contexts';
import { origin, seal, secureCookie } from '@/lib/oidc';

const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const knownErrors = new Set(['invalid_organization_name', 'invalid_invitation', 'person_not_found', 'already_a_member',
  'invitation_pending', 'invitation_not_found', 'membership_permission_denied', 'member_not_found', 'last_owner',
  'organization_not_found', 'invalid_role', 'identity_unavailable']);

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== origin()) return new NextResponse('Origin rejected', { status: 403 });
  if (!await getCurrentAccessToken()) return NextResponse.redirect(new URL('/auth/login', origin()), 303);
  const form = await request.formData();
  const field = (key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() : '';
  const intent = field('intent');
  const orgId = field('organizationId');
  const personId = field('personId');
  const invitationId = field('invitationId');
  const role = field('role');
  const detail = uuid(orgId) ? `/organizations/${orgId}` : '/contexts';
  const destination = (error?: string) => new URL(error ? `${detail}?error=${encodeURIComponent(error)}` : detail, origin());
  const bad = () => new NextResponse('Invalid account action', { status: 400 });

  try {
    if (intent === 'select') {
      const contexts = await getContexts();
      if (!contexts) return NextResponse.redirect(new URL('/contexts?error=identity_unavailable', origin()), 303);
      if (orgId && (!uuid(orgId) || !contexts.contexts.some(c => c.type === 'organization' && c.id === orgId))) return bad();
      const response = NextResponse.redirect(new URL('/contexts', origin()), 303);
      response.cookies.set(contextCookie(), await seal({ personId: contexts.person.id, organizationId: orgId }, 3600),
        { httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge: 3600 });
      return response;
    }

    let path: string; let method = 'POST'; let body: object | undefined;
    switch (intent) {
      case 'create':
        path = '/v1/organizations'; body = { name: field('name') }; break;
      case 'invite':
        if (!uuid(orgId) || !uuid(personId)) return bad();
        path = `/v1/organizations/${orgId}/invitations`; body = { personId, role }; break;
      case 'accept': case 'decline':
        if (!uuid(invitationId)) return bad();
        path = `/v1/invitations/${invitationId}/respond`; body = { decision: intent }; break;
      case 'revoke':
        if (!uuid(orgId) || !uuid(invitationId)) return bad();
        path = `/v1/organizations/${orgId}/invitations/${invitationId}`; method = 'DELETE'; break;
      case 'role':
        if (!uuid(orgId) || !uuid(personId)) return bad();
        path = `/v1/organizations/${orgId}/members/${personId}`; method = 'PATCH'; body = { role }; break;
      case 'remove': case 'leave':
        if (!uuid(orgId) || !uuid(personId)) return bad();
        path = `/v1/organizations/${orgId}/members/${personId}`; method = 'DELETE'; break;
      default: return bad();
    }
    const result = await identityApi(path, { method, ...(body ? { body } : {}) });
    if (!result.ok) {
      const failure = await result.json().catch(() => ({})) as { error?: string };
      const error = failure.error && knownErrors.has(failure.error) ? failure.error : 'identity_unavailable';
      return NextResponse.redirect(destination(error), 303);
    }
    if (intent === 'create') {
      const created = await result.json() as { id?: string };
      return NextResponse.redirect(new URL(created.id && uuid(created.id) ? `/organizations/${created.id}` : '/contexts', origin()), 303);
    }
    return NextResponse.redirect(new URL(intent === 'accept' || intent === 'decline' || intent === 'leave' ? '/contexts' : detail, origin()), 303);
  } catch { return NextResponse.redirect(destination('identity_unavailable'), 303); }
}
