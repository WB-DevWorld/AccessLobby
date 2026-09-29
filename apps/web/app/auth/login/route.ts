import { NextResponse } from 'next/server';
import { isPublicRegistrationEnabled } from '@/lib/features';
import { callbackUrl, challenge, clientId, discover, flowCookie, origin, seal, secureCookie } from '@/lib/oidc';

export async function GET(request: Request) {
  const intent = new URL(request.url).searchParams.get('intent');
  if (intent !== null && intent !== 'register' && intent !== 'switch') {
    return NextResponse.redirect(new URL('/?error=login_failed', origin()));
  }
  if (intent === 'register' && !isPublicRegistrationEnabled()) {
    return NextResponse.redirect(new URL('/?error=registration_unavailable', origin()));
  }

  try {
    const doc = await discover();
    const { state, nonce, verifier, codeChallenge } = challenge();
    const url = new URL(doc.authorization_endpoint);
    for (const [key, value] of Object.entries({
      client_id: clientId(),
      redirect_uri: callbackUrl(),
      response_type: 'code',
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })) url.searchParams.set(key, value);
    if (intent === 'register') url.searchParams.set('prompt', 'create');
    if (intent === 'switch') url.searchParams.set('prompt', 'login');
    const response = NextResponse.redirect(url);
    response.cookies.set(flowCookie(), await seal({ state, nonce, verifier }, 300), {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL('/?error=issuer_unavailable', origin()));
  }
}
