import { cookies } from 'next/headers';
import { identityApi } from '@/lib/current-identity';
import { secureCookie, unseal } from '@/lib/oidc';

export type Membership = { type: 'organization'; id: string; name: string; role: 'owner' | 'administrator' | 'member' };
export type Invitation = { id: string; organizationId: string; organizationName: string; role: 'administrator' | 'member'; expiresAt: string };
export type Contexts = { person: { id: string }; contexts: ({ type: 'personal' } | Membership)[]; invitations: Invitation[] };
export type OrganizationDetail = { id: string; name: string; role: Membership['role'];
  members: { personId: string; role: Membership['role'] }[];
  invitations: { id: string; personId: string; role: Invitation['role']; expiresAt: string }[] };

export const contextCookie = () => secureCookie() ? '__Host-al-context' : 'al-context';
export async function getContexts(): Promise<Contexts | null> {
  try {
    const response = await identityApi('/v1/contexts');
    if (!response.ok) return null;
    const value = await response.json() as Contexts;
    if (!value.person?.id || !Array.isArray(value.contexts) || !Array.isArray(value.invitations)) return null;
    return value;
  } catch { return null; }
}
export async function getOrganization(id: string): Promise<OrganizationDetail | null> {
  try {
    const response = await identityApi(`/v1/organizations/${encodeURIComponent(id)}`);
    if (!response.ok) return null;
    const value = await response.json() as OrganizationDetail;
    return value?.id === id && Array.isArray(value.members) && Array.isArray(value.invitations) ? value : null;
  } catch { return null; }
}
export async function selectedContext(personId: string, contexts: Contexts['contexts']): Promise<string | null> {
  try {
    const cookie = (await cookies()).get(contextCookie())?.value;
    if (!cookie) return null;
    const payload = await unseal(cookie);
    if (payload.personId !== personId || typeof payload.organizationId !== 'string') return null;
    return contexts.some(c => c.type === 'organization' && c.id === payload.organizationId) ? payload.organizationId : null;
  } catch { return null; }
}
