import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { parseAdminAccess, type AdminAccess } from '@/lib/admin-model';

export type AdminContext = { state: 'ready'; personId: string; access: AdminAccess } | { state: 'signed-out' | 'forbidden' | 'unavailable' };

// Every page and action calls this independently. No layout, cookie or token-role
// cache can preserve administrative access after its database grant is revoked.
export async function getAdminContext(): Promise<AdminContext> {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return { state: identity.state === 'signed-out' ? 'signed-out' : identity.state === 'restricted' ? 'forbidden' : 'unavailable' };
  try {
    const response = await identityApi('/v1/admin/access');
    if (response.status === 401) return { state: 'signed-out' };
    if (response.status === 403) return { state: 'forbidden' };
    if (!response.ok) return { state: 'unavailable' };
    const access = parseAdminAccess(await response.json());
    return access ? { state: 'ready', personId: identity.person.id, access } : { state: 'unavailable' };
  } catch { return { state: 'unavailable' }; }
}

export async function getAdminData<T>(path: string, parse: (value: unknown) => T | null): Promise<T | null> {
  if (!path.startsWith('/v1/admin/')) return null;
  try {
    const response = await identityApi(path);
    return response.ok ? parse(await response.json()) : null;
  } catch { return null; }
}
