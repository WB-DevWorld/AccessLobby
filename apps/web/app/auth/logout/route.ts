import { NextResponse } from 'next/server';
import { clearCookie, clientId, discover, flowCookie, origin, sessionCookie } from '@/lib/oidc';
export async function POST() {
  let destination = new URL('/', origin());
  try {
    const doc = await discover();
    destination = new URL(doc.end_session_endpoint);
    destination.searchParams.set('client_id', clientId());
    destination.searchParams.set('post_logout_redirect_uri', origin());
  } catch { /* Local session must still be cleared when the IAM runtime is down. */ }
  const response = NextResponse.redirect(destination, 303);
  clearCookie(response, sessionCookie());
  clearCookie(response, flowCookie());
  return response;
}
