import { getAdminContext } from '@/lib/admin';
import { handleAdminReview } from '@/lib/admin-action';
import { identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handleAdminReview(request, origin(), { getAccess: getAdminContext, api: identityApi });
}
