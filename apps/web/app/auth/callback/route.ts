import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { clearCookie, exchange, flowCookie, origin, secureCookie, seal, sessionCookie, unseal } from '@/lib/oidc';
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const flow = jar.get(flowCookie())?.value;
  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  const failure = () => {
    const response = NextResponse.redirect(new URL('/?error=login_failed', origin()));
    clearCookie(response, flowCookie());
    return response;
  };
  if (!flow || !state || !code || request.nextUrl.searchParams.has('error')) return failure();
  try {
    const pending = await unseal(flow);
    if (pending.state !== state || typeof pending.verifier !== 'string' || typeof pending.nonce !== 'string') return failure();
    const tokens = await exchange(code, pending.verifier, pending.nonce);
    const response = NextResponse.redirect(new URL('/account', origin()));
    clearCookie(response, flowCookie());
    response.cookies.set(sessionCookie(), await seal({ accessToken: tokens.access_token }, Math.min(tokens.expires_in, 3600)), {
      httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge: Math.min(tokens.expires_in, 3600)
    });
    return response;
  } catch { return failure(); }
}
