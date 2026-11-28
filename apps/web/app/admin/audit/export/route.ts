import { getAdminContext } from '@/lib/admin';
import { handleAuditExport } from '@/lib/audit-tools';
import { identityApi } from '@/lib/current-identity';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handleAuditExport(request, { getAccess: getAdminContext, api: path => identityApi(path) });
}
