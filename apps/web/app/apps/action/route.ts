import { getCurrentAccessToken, identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';
import { handleApplicationGrantAction } from '@/lib/application-grants';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleApplicationGrantAction(request, origin(), { hasSession: async () => !!await getCurrentAccessToken(), api: identityApi });
}
