import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { RetryButton } from '@/components/retry-button';
import { AppShell } from '@/components/app-shell';
import { AccountAccessState, AvailabilityPanel, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { lifecycleUuid } from '@/lib/application-lifecycle';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Developer tools', robots: { index: false, follow: false } };

type App = { id: string; clientId: string; name: string; status?: string; platform?: 'web' | 'wordpress';
  visibility: 'discoverable' | 'hidden'; admission: 'authenticated_open' | 'grant_required';
  originVerificationHost?: string; originVerificationValue?: string; originVerifiedAt?: string | null;
  backchannelLogoutUri?: string | null };

async function list(path: string): Promise<App[] | null> {
  try {
    const response = await identityApi(path);
    if (!response.ok) return null;
    const body = await response.json() as { contract?: string; applications?: App[] };
    return body.contract === 'accesslobby.applications.v0.1' && Array.isArray(body.applications)
      ? body.applications.filter(app => lifecycleUuid(app.id) && typeof app.clientId === 'string' && typeof app.name === 'string') : null;
  } catch { return null; }
}

const notices: Record<string, string> = {
  requested: 'Request saved. Domain verification and first-party approval are required before activation.',
  verified: 'Domain verified. First-party approval is still required.',
  origin_proof_missing: 'DNS record not found. Check the TXT value and allow time for propagation.',
  origin_verification_unavailable: 'DNS verification is unavailable. Please try again.',
  application_verification_unavailable: 'This application’s current state does not allow verification.',
  public_domain_required: 'Use a public HTTPS callback hostname.',
  granted: 'Entry granted. The app manages its own roles.',
  revoked: 'Entry revoked. Existing sessions follow the app’s expiry and recheck policy.',
  invalid_application_url: 'Use an exact HTTPS URL for the callback and logout on the same origin.',
  application_origin_mismatch: 'The callback and logout URLs must have the same origin.',
  application_path_mismatch: 'WordPress callback and logout URLs must use the same wp-login.php path.',
  invalid_application_platform: 'Choose Web application or WordPress.',
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
  const mine = await list('/v1/applications/mine');
  const notice = notices[(await searchParams).notice ?? ''];
  return <AppShell active="apps" title="Developer tools"
    description="Connect and manage applications you own." actions={<Link className="button button-secondary button-compact" href="/apps">Back to apps</Link>}
    personStatus={identity.person.status}>
    {notice && <p className="context-alert" role={["requested", "verified", "granted", "revoked"].includes((await searchParams).notice ?? "") ? "status" : "alert"}>{notice}</p>}
    <section className="context-grid" aria-label="Application access">
      <SurfaceCard title="Connect your app">
        <p>Requests need domain verification and first-party approval.</p>
        <ActionForm className="context-form" action="/apps/action" method="post">
          <input type="hidden" name="intent" value="request" />
          <label htmlFor="app-name">Application name</label><input id="app-name" name="name" required minLength={2} maxLength={120} />
          <label htmlFor="app-client">Client ID</label><input id="app-client" name="clientId" required pattern="[a-z0-9_-]+" maxLength={80} autoCapitalize="none" spellCheck={false} aria-describedby="client-help" /><small id="client-help">Lowercase letters, numbers, hyphens and underscores.</small>
          <label htmlFor="app-platform">Platform</label><select id="app-platform" name="platform">
            <option value="web">Web application</option><option value="wordpress">WordPress</option>
          </select>
          <p>WordPress: copy URLs from the plugin settings.</p>
          <label htmlFor="app-callback">Exact HTTPS callback URL</label><input id="app-callback" name="redirectUri" type="url" pattern="https://.+" required />
          <label htmlFor="app-logout">Exact HTTPS logout return URL</label><input id="app-logout" name="logoutUri" type="url" pattern="https://.+" required />
          <details className="information-details"><summary>Shared sign-out (optional)</summary><label htmlFor="app-backchannel">Backchannel logout URL (optional)</label>
          <input id="app-backchannel" name="backchannelLogoutUri" type="url" pattern="https://.+" />
          <p>Use the callback origin. Validate signed logout tokens before registering.</p></details>
          <label htmlFor="app-visibility">Visibility</label><select id="app-visibility" name="visibility">
            <option value="discoverable">Discoverable</option><option value="hidden">Hidden</option>
          </select>
          <label htmlFor="app-admission">Entry policy</label><select id="app-admission" name="admission">
            <option value="grant_required">Requires a grant</option><option value="authenticated_open">Open to authenticated people</option>
          </select>
          <button className="button button-primary" type="submit">Save app request</button>
        </ActionForm>
      </SurfaceCard>
    </section>
    <section aria-label="Applications you manage">
      <h2>Applications you manage</h2>
      {!mine ? <AvailabilityPanel title="Your applications cannot be checked" description="Try again when AccessLobby is available." action={<RetryButton />} /> :
        mine.length === 0 ? <p>You have not requested an application yet.</p> :
          <div className="context-grid">{mine.map(app => <SurfaceCard title={app.name} key={app.id}>
            <p>Status: <strong>{app.status === 'active' ? 'Active' : app.status === 'suspended' ? 'Suspended' : app.status === 'cancelled' ? 'Cancelled' : 'Requested'}</strong>. Entry: {app.admission === 'grant_required' ? 'Grant required' : 'Authenticated open'}.</p>
            <p><Link className="text-link" href={`/apps/manage/${app.id}`}>{app.status === 'requested' || app.status === 'cancelled' ? 'Manage request' : 'View request'}</Link></p>
            <details className="information-details"><summary>Connection details</summary>
              <p>Client ID: <code>{app.clientId}</code></p>
              <p>Platform: {app.platform === 'wordpress' ? 'WordPress' : 'Web application'}</p>
              <p>Backchannel logout: {app.backchannelLogoutUri ? <code>{app.backchannelLogoutUri}</code> : 'Not registered'}</p>
            </details>
            {app.status === 'requested' && app.originVerificationHost && app.originVerificationValue && <>
              <p>Add this DNS TXT record:</p>
              <p><code>{app.originVerificationHost}</code> → <code>{app.originVerificationValue}</code></p>
              <p>Domain proof: <strong>{app.originVerifiedAt ? 'Verified' : 'Waiting for verification'}</strong></p>
              <ActionForm action="/apps/action" method="post"><input type="hidden" name="applicationId" value={app.id} />
                <button className="button button-secondary" name="intent" value="verify" type="submit">Verify DNS record</button></ActionForm>
            </>}
            {app.status === 'active' && app.admission === 'grant_required' && <>
              <p>Use an AccessLobby ID. The app’s roles stay unchanged.</p>
              <ActionForm className="context-form" action="/apps/action" method="post">
                <input type="hidden" name="applicationId" value={app.id} />
                <label htmlFor={`grant-${app.id}`}>Person ID</label>
                <input id={`grant-${app.id}`} name="personId" required pattern="[0-9a-fA-F-]{36}" autoCapitalize="none" spellCheck={false} placeholder="AccessLobby ID" />
                <div className="context-actions">
                  <button className="button button-primary" type="submit" name="intent" value="grant">Grant entry</button>
                  <button className="button button-secondary" type="submit" name="intent" value="revoke" data-confirm="Revoke this person’s entry? Existing app sessions follow that app’s expiry and recheck policy.">Revoke entry</button>
                </div>
              </ActionForm>
            </>}
          </SurfaceCard>)}</div>}
    </section>
    <details className="information-details"><summary>External integrations</summary><p>External apps require a separate identity and data-sharing contract before activation.</p></details>
  </AppShell>;
}
