// A peer may show the human's AccessLobby memberships; it owns app admission and permissions.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roles = new Set(['owner', 'administrator', 'member']);

export async function loadMemberships(api, session, fetcher = fetch) {
  if (!session.accessToken) throw new Error('No membership credential');
  const response = await fetcher(`${api}/v1/my-organizations`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Membership service unavailable');
  const result = await response.json();
  if (result.contract !== 'accesslobby.memberships.v0.1' || result.person?.id !== session.personId ||
      !Array.isArray(result.organizations) || result.organizations.length > 1000 ||
      result.organizations.some(org => !uuid.test(org?.id) || typeof org.name !== 'string' ||
        org.name.length < 2 || org.name.length > 120 || !roles.has(org.role)) ||
      new Set(result.organizations.map(org => org.id)).size !== result.organizations.length) {
    throw new Error('Membership response rejected');
  }
  return result.organizations;
}

export const selectedMembership = (session, organizations) =>
  organizations.find(org => org.id === session.selectedOrganizationId);
