import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { clearCookie, exchange, flowCookie, origin, secureCookie, seal, sessionCookie, unseal } from '@/lib/oidc';
import { contextCookie } from '@/lib/contexts';
import { AccountResolutionError, resolveAccountLanding } from '@/lib/account-landing';
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const flow = jar.get(flowCookie())?.value;
  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  const failure = (error = 'login_failed', endCurrentSession = false) => {
    const response = NextResponse.redirect(new URL(`/?error=${error}`, origin()));
    clearCookie(response, flowCookie());
    if (endCurrentSession) {
      clearCookie(response, contextCookie());
      clearCookie(response, sessionCookie());
    }
    return response;
  };
  if (!flow || !state || !code || request.nextUrl.searchParams.has('error')) return failure();
  let authenticated = false;
  try {
    const pending = await unseal(flow);
    if (pending.state !== state || typeof pending.verifier !== 'string' || typeof pending.nonce !== 'string') return failure();
    const tokens = await exchange(code, pending.verifier, pending.nonce);
    authenticated = true;
    const destination = await resolveAccountLanding(tokens.access_token);
    const response = NextResponse.redirect(new URL(destination, origin()));
    clearCookie(response, flowCookie());
    clearCookie(response, contextCookie());
    response.cookies.set(sessionCookie(), await seal({ accessToken: tokens.access_token }, Math.min(tokens.expires_in, 3600)), {
      httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge: Math.min(tokens.expires_in, 3600)
    });
    return response;
  } catch (error) {
    return failure(error instanceof AccountResolutionError ? error.code : 'login_failed', authenticated);
  }
}
