import { parseCurrentPersonResponse } from './current-identity-model';
import type { Contexts } from './contexts';

export class AccountResolutionError extends Error {
  constructor(public readonly code: 'account_restricted' | 'account_unavailable') { super(code); }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const role = (value: unknown) => value === 'owner' || value === 'administrator' || value === 'member';

export function parseAccountContexts(value: unknown, personId: string): Contexts | null {
  if (!isRecord(value) || !isRecord(value.person) || value.person.id !== personId ||
      !Array.isArray(value.contexts) || !Array.isArray(value.invitations)) return null;
  if (value.contexts.length < 1 || value.contexts.length > 1001 || value.invitations.length > 1000 ||
      !isRecord(value.contexts[0]) || value.contexts[0].type !== 'personal') return null;
  const orgs = value.contexts.slice(1);
  if (orgs.some(org => !isRecord(org) || org.type !== 'organization' || !uuid(org.id) ||
      typeof org.name !== 'string' || !role(org.role)) ||
      new Set(orgs.map(org => org.id)).size !== orgs.length ||
      value.invitations.some(invite => !isRecord(invite) || !uuid(invite.id) ||
        !uuid(invite.organizationId) || typeof invite.organizationName !== 'string' ||
        (invite.role !== 'administrator' && invite.role !== 'member') ||
        typeof invite.expiresAt !== 'string')) return null;
  return value as Contexts;
}

export function accountLanding(contexts: Contexts): '/account' | '/contexts' {
  // Never silently select an organization because of membership or role.
  return contexts.contexts.length > 1 || contexts.invitations.length > 0 ? '/contexts' : '/account';
}

export async function resolveAccountLanding(
  accessToken: string,
  apiUrl = process.env.API_INTERNAL_URL,
  fetcher: typeof fetch = fetch,
): Promise<'/account' | '/contexts'> {
  if (!apiUrl) throw new AccountResolutionError('account_unavailable');
  const request = async (path: string) => {
    let response: Response;
    try {
      response = await fetcher(`${apiUrl}${path}`, {
        headers: { authorization: `Bearer ${accessToken}` }, cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      });
    } catch { throw new AccountResolutionError('account_unavailable'); }
    if (response.status === 403) throw new AccountResolutionError('account_restricted');
    if (!response.ok) throw new AccountResolutionError('account_unavailable');
    try { return await response.json() as unknown; }
    catch { throw new AccountResolutionError('account_unavailable'); }
  };
  const identity = await request('/v1/me');
  const person = parseCurrentPersonResponse(identity);
  if (!isRecord(identity) || identity.contract !== 'accesslobby.identity.v0.1' ||
      !person || !uuid(person.id) || person.status !== 'active') {
    throw new AccountResolutionError('account_unavailable');
  }
  const contexts = parseAccountContexts(await request('/v1/contexts'), person.id);
  if (!contexts) throw new AccountResolutionError('account_unavailable');
  return accountLanding(contexts);
}
