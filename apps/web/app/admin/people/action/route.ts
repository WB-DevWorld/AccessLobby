import { getAdminContext } from '@/lib/admin';
import { identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';
import { handlePersonStatusChange } from '@/lib/person-controls-action';

export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return handlePersonStatusChange(request, origin(), { getAccess: getAdminContext, api: identityApi });
}
