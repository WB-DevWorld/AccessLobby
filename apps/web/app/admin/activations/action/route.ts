import { origin } from '@/lib/oidc';
import { getAdminContext } from '@/lib/admin';
import { identityApi } from '@/lib/current-identity';
import { handleActivationAction } from '@/lib/activation-action';
export async function POST(request:Request){
  return handleActivationAction(request,origin(),{getAccess:getAdminContext,api:identityApi});
}
