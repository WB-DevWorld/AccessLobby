import { getAdminContext } from '@/lib/admin';
import { identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';
import { handleApplicationLaunch } from '@/lib/application-launch';

export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApplicationLaunch(request, origin(), (await params).id, { getAccess: getAdminContext, api: identityApi });
}
