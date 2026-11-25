import { getAdminContext } from '@/lib/admin';
import { identityApi } from '@/lib/current-identity';
import { origin } from '@/lib/oidc';
import { handleApplicationSuspension } from '@/lib/application-suspension-action';

export const dynamic = 'force-dynamic';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleApplicationSuspension(request, origin(), (await params).id, { getAccess: getAdminContext, api: identityApi });
}
