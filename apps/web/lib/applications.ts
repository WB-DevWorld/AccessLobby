import { identityApi } from '@/lib/current-identity';
import { safeApplicationLaunchUrl } from '@/lib/application-launch';
export type AvailableApplication = { id: string; name: string; admission: 'authenticated_open' | 'grant_required';
  admitted?: boolean; launchUrl?: string };

export function parseAvailableApplications(value: unknown): AvailableApplication[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.contract !== 'accesslobby.applications.v0.1' || !Array.isArray(body.applications)) return null;
  const result: AvailableApplication[] = [];
  for (const source of body.applications) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const app = source as Record<string, unknown>;
    if (typeof app.id !== 'string' || typeof app.name !== 'string' ||
        (app.admission !== 'authenticated_open' && app.admission !== 'grant_required') ||
        (app.admitted !== undefined && typeof app.admitted !== 'boolean')) return null;
    // Old responses carry no admission result. Only open apps can infer entry;
    // an explicit denial always takes precedence over a navigation destination.
    const admitted = app.admitted === undefined ? app.admission === 'authenticated_open' : app.admitted;
    const launchUrl = admitted ? safeApplicationLaunchUrl(app.launchUrl) : null;
    result.push({ id: app.id, name: app.name, admission: app.admission, admitted,
      ...(launchUrl ? { launchUrl } : {}) });
  }
  return result;
}

export async function getAvailableApplications(): Promise<AvailableApplication[] | null> {
  try {
    const response = await identityApi('/v1/applications/visible');
    if (!response.ok) return null;
    return parseAvailableApplications(await response.json());
  } catch { return null; }
}
