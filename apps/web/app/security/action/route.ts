import { handleAccountSessionEnd } from '@/lib/account-sessions';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleAccountSessionEnd(request, origin(), { getIdentity: getCurrentIdentity, api: identityApi });
}
