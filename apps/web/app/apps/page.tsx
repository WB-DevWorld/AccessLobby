import { AppShell } from '@/components/app-shell';
import { AccountAccessState, AvailabilityPanel, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';

export const dynamic = 'force-dynamic';

type App = { id: string; clientId: string; name: string; status?: string;
  visibility: 'discoverable' | 'hidden'; admission: 'authenticated_open' | 'grant_required' };

async function list(path: string): Promise<App[] | null> {
  try {
    const response = await identityApi(path);
    if (!response.ok) return null;
    const body = await response.json() as { contract?: string; applications?: App[] };
    return body.contract === 'accesslobby.applications.v0.1' && Array.isArray(body.applications)
      ? body.applications.filter(app => typeof app.id === 'string' && typeof app.clientId === 'string' && typeof app.name === 'string') : null;
  } catch { return null; }
}

const notices: Record<string, string> = {
  requested: 'Application request saved. It is inactive until its domain and first-party status are reviewed and its OIDC client is verified.',
  granted: 'App entry granted. The app still controls its own resources and roles.',
  revoked: 'App entry revoked. Existing sessions inside that app follow its own expiry and recheck policy.',
  invalid_application_url: 'Use an exact HTTPS URL for the callback and logout on the same origin.',
  application_origin_mismatch: 'The callback and logout URLs must have the same origin.',
  invalid_client_id: 'Choose a unique lowercase client ID with letters, digits, hyphen or underscore.',
  invalid_application_name: 'Use an application name between 2 and 120 characters.',
  invalid_visibility: 'Choose a valid visibility setting.',
  invalid_admission: 'Choose a valid entry policy.',
  client_id_taken: 'That client ID is already in use.',
  too_many_application_requests: 'You have ten pending app requests. Complete or resolve one before requesting another.',
  person_not_found: 'That active AccessLobby person ID was not found.',
  application_not_found: 'This application is unavailable to you.',
  application_grants_unavailable: 'Grants can be managed only for an active, grant-required application.',
  grant_not_found: 'There is no active grant for that person.',
  identity_unavailable: 'The identity service is unavailable. Please try again.'
};

export default async function AppsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  const [available, mine] = await Promise.all([list('/v1/applications/visible'), list('/v1/applications/mine')]);
  const notice = notices[(await searchParams).notice ?? ''];
  return <AppShell active="apps" title="Apps and access"
    description="Discover supported apps and request a connection for an application you manage."
    personStatus={identity.person.status}>
    {notice && <p className="context-alert" role="status">{notice}</p>}
    <section className="context-grid" aria-label="Application access">
      <SurfaceCard title="Available to you">
        {!available ? <AvailabilityPanel title="App availability cannot be checked" description="Try again when AccessLobby is available." /> :
          available.length === 0 ? <p>No active apps are available in this registry yet. Existing pilot clients may still use their earlier integration contract.</p> :
            <ul className="context-list">{available.map(app => <li key={app.id}>
              <strong>{app.name}</strong> · {app.admission === 'authenticated_open' ? 'Open entry' : 'Entry granted'}
              <p>Each app checks its own roles and protected resources.</p>
            </li>)}</ul>}
      </SurfaceCard>
      <SurfaceCard title="Request an app connection">
        <p>Requests stay inactive until a controlled first-party review and client registration. External integrations need a separate identifier and data-sharing contract.</p>
        <form className="context-form" action="/apps/action" method="post">
          <input type="hidden" name="intent" value="request" />
          <label htmlFor="app-name">Application name</label><input id="app-name" name="name" required minLength={2} maxLength={120} />
          <label htmlFor="app-client">Client ID</label><input id="app-client" name="clientId" required pattern="[a-z0-9_-]+" maxLength={80} />
          <label htmlFor="app-callback">Exact HTTPS callback URL</label><input id="app-callback" name="redirectUri" type="url" required />
          <label htmlFor="app-logout">Exact HTTPS logout return URL</label><input id="app-logout" name="logoutUri" type="url" required />
          <label htmlFor="app-visibility">Visibility</label><select id="app-visibility" name="visibility">
            <option value="discoverable">Discoverable</option><option value="hidden">Hidden until granted</option>
          </select>
          <label htmlFor="app-admission">Entry policy</label><select id="app-admission" name="admission">
            <option value="grant_required">Requires a grant</option><option value="authenticated_open">Open to authenticated people</option>
          </select>
          <button className="button button-primary" type="submit">Save app request</button>
        </form>
      </SurfaceCard>
    </section>
    <section aria-label="Applications you manage">
      <h2>Applications you manage</h2>
      {!mine ? <AvailabilityPanel title="Your applications cannot be checked" description="Try again when AccessLobby is available." /> :
        mine.length === 0 ? <p>You have not requested an application yet.</p> :
          <div className="context-grid">{mine.map(app => <SurfaceCard title={app.name} key={app.id}>
            <p>Client ID: <code>{app.clientId}</code></p>
            <p>Status: <strong>{app.status === 'active' ? 'Active' : app.status === 'suspended' ? 'Suspended' : 'Requested'}</strong>. Entry: {app.admission === 'grant_required' ? 'Grant required' : 'Authenticated open'}.</p>
            {app.status === 'active' && app.admission === 'grant_required' && <>
              <p>Grant or revoke broad entry using an existing person’s AccessLobby ID. This does not assign a role inside the app.</p>
              <form className="context-form" action="/apps/action" method="post">
                <input type="hidden" name="applicationId" value={app.id} />
                <label htmlFor={`grant-${app.id}`}>Person ID</label>
                <input id={`grant-${app.id}`} name="personId" required pattern="[0-9a-fA-F-]{36}" />
                <div className="context-actions">
                  <button className="button button-primary" type="submit" name="intent" value="grant">Grant entry</button>
                  <button className="button button-secondary" type="submit" name="intent" value="revoke">Revoke entry</button>
                </div>
              </form>
            </>}
          </SurfaceCard>)}</div>}
    </section>
  </AppShell>;
}
