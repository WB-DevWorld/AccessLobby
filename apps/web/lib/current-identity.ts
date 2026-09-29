import { cookies } from 'next/headers';
import { sessionCookie, unseal } from '@/lib/oidc';
import {
  parseCurrentPersonResponse,
  type CurrentIdentityResult,
} from '@/lib/current-identity-model';

const IDENTITY_TIMEOUT_MS = 5_000;

export async function getCurrentIdentity(): Promise<CurrentIdentityResult> {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) return { state: 'signed-out' };

  try {
    const response = await fetch(`${process.env.API_INTERNAL_URL}/v1/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      return { state: 'signed-out' };
    }

    if (!response.ok) return { state: 'unavailable' };

    const person = parseCurrentPersonResponse(await response.json());
    return person ? { state: 'ready', person } : { state: 'unavailable' };
  } catch {
    return { state: 'unavailable' };
  }
}

export async function getCurrentAccessToken(): Promise<string | null> {
  let session: string | undefined;

  try {
    session = (await cookies()).get(sessionCookie())?.value;
  } catch {
    return null;
  }

  if (!session) return null;

  try {
    const payload = await unseal(session);
    if (typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
      return null;
    }
    return payload.accessToken;
  } catch {
    return null;
  }
}

export async function identityApi(path: string, init?: { method?: string; body?: object }): Promise<Response> {
  const accessToken = await getCurrentAccessToken();
  if (!accessToken) throw new Error('signed_out');
  if (!path.startsWith('/v1/')) throw new Error('invalid_identity_path');
  try {
    return await fetch(`${process.env.API_INTERNAL_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: { authorization: `Bearer ${accessToken}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(IDENTITY_TIMEOUT_MS),
    });
  } catch { throw new Error('identity_unavailable'); }
}
