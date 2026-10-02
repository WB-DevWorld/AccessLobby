import { identityApi } from '@/lib/current-identity';
export type AvailableApplication = { id: string; name: string; admission: 'authenticated_open' | 'grant_required' };
export async function getAvailableApplications(): Promise<AvailableApplication[] | null> {
  try {
    const response = await identityApi('/v1/applications/visible');
    if (!response.ok) return null;
    const value = await response.json();
    if (value.contract !== 'accesslobby.applications.v0.1' || !Array.isArray(value.applications)) return null;
    if (!value.applications.every((app: AvailableApplication) => app && typeof app.id === 'string' && typeof app.name === 'string' && ['authenticated_open', 'grant_required'].includes(app.admission))) return null;
    return value.applications.map(({ id, name, admission }: AvailableApplication) => ({ id, name, admission }));
  } catch { return null; }
}
