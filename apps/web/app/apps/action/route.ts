import { getCurrentAccessToken, identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';
import { handleApplicationAction } from '@/lib/application-lifecycle-action';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleApplicationAction(request, origin(), { hasSession: async () => !!await getCurrentAccessToken(), api: identityApi });
}
