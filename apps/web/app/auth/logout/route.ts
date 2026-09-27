import { NextRequest, NextResponse } from 'next/server';
import { clearCookie, clientId, discover, flowCookie, origin, sessionCookie } from '@/lib/oidc';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== origin()) return new NextResponse('Origin rejected', { status: 403 });
  const form = await request.formData();
  const scope = form.get('scope');
  if (scope !== 'current' && scope !== 'all') return new NextResponse('Choose a sign-out scope', { status: 400 });
  let destination = new URL('/', origin());
  if (scope === 'all') {
    try {
      const doc = await discover();
      destination = new URL(doc.end_session_endpoint);
      destination.searchParams.set('client_id', clientId());
      destination.searchParams.set('post_logout_redirect_uri', origin());
    } catch { destination = new URL('/?error=shared_logout_unavailable', origin()); }
  }
  const response = NextResponse.redirect(destination, 303);
  clearCookie(response, sessionCookie());
  clearCookie(response, flowCookie());
  return response;
}
