import { organizationDetailPath, organizationInspectionPath, type OrganizationSection } from './organization-inspection';

export type InspectionResult<T> = { state: 'ready'; data: T } | { state: 'signed-out' | 'forbidden' | 'not-found' | 'unavailable' | 'invalid-query' };

/** Fixed internal GET destinations; the authenticated transport applies no-store and its timeout. */
export async function loadOrganizationInspection<T>(id: unknown, section: OrganizationSection | 'detail', after: unknown,
  parse: (value: unknown) => T | null, api: (path: string) => Promise<Response>): Promise<InspectionResult<T>> {
  const path = section === 'detail' ? (after === undefined ? organizationDetailPath(id) : null) : organizationInspectionPath(id, section, after);
  if (!path) return { state: 'invalid-query' };
  try {
    const response = await api(path);
    if (response.status === 401) return { state: 'signed-out' };
    if (response.status === 403) return { state: 'forbidden' };
    if (response.status === 404) return { state: 'not-found' };
    if (response.status === 400) return { state: 'invalid-query' };
    if (!response.ok) return { state: 'unavailable' };
    const data = parse(await response.json());
    return data === null ? { state: 'unavailable' } : { state: 'ready', data };
  } catch { return { state: 'unavailable' }; }
}
