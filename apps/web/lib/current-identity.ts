import { cookies } from 'next/headers';
import { sessionCookie, unseal } from '@/lib/oidc';
import {
  parseCurrentPersonResponse,
  type CurrentIdentityResult,
} from '@/lib/current-identity-model';

const IDENTITY_TIMEOUT_MS = 5_000;

export async function getCurrentIdentity(): Promise<CurrentIdentityResult> {
  let session: string | undefined;

  try {
    session = (await cookies()).get(sessionCookie())?.value;
  } catch {
    return { state: 'unavailable' };
  }

  if (!session) return { state: 'signed-out' };

  let accessToken: string;
  try {
    const payload = await unseal(session);
    if (typeof payload.accessToken !== 'string' || payload.accessToken.length === 0) {
      return { state: 'signed-out' };
    }
    accessToken = payload.accessToken;
  } catch {
    return { state: 'signed-out' };
  }

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
