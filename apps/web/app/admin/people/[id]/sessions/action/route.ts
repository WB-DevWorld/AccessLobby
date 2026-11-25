import { getAdminContext } from '@/lib/admin';
import { identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';
import { handleSessionEnd } from '@/lib/session-inspection-action';

export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleSessionEnd(request, origin(), (await params).id, { getAccess: getAdminContext, api: identityApi });
}
