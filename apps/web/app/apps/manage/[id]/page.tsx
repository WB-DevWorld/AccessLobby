import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { RetryButton } from '@/components/retry-button';
import { AccountAccessState, AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { applicationLifecycleNotices, lifecycleUuid, ownerApplicationState, parseApplicationLifecycle } from '@/lib/application-lifecycle';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Manage application request', robots: { index: false, follow: false } };

export default async function ApplicationRequest({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }>;
}) {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  const { id } = await params;
  if (!lifecycleUuid(id)) notFound();
  let application = null;
  let response: Response | undefined;
  try { response = await identityApi(`/v1/applications/${id}`); } catch { /* Show a retryable registry state. */ }
  if (response?.status === 404) notFound();
  if (response?.ok) {
    try { application = parseApplicationLifecycle(await response.json()); } catch { /* Do not assert malformed registry data. */ }
  }
  if (!application) return <AppShell active="apps" title="Application request" description="Manage your app connection.">
    <AvailabilityPanel title="The application request could not be loaded" description="Your access may have changed, or the registry may be unavailable. Try again." action={<RetryButton />} />
  </AppShell>;
  const app = application;
  const editable = ['requested', 'cancelled'].includes(app.status) && app.trustClass === 'unreviewed';
  const noticeKey = (await searchParams).notice;
  const notice = typeof noticeKey === 'string' && Object.hasOwn(applicationLifecycleNotices, noticeKey) ? applicationLifecycleNotices[noticeKey] : null;
  const hidden = <><input type="hidden" name="applicationId" value={app.id} /><input type="hidden" name="expectedConfigurationHash" value={app.configurationHash} /></>;
  return <AppShell active="apps" title={app.name} description={editable ? 'Manage your inactive app request.' : 'Your registered app connection.'}
    actions={<Link className="button button-secondary button-compact" href="/apps/manage">Back to developer tools</Link>}>
    {notice && <p className="context-alert" role={['edited', 'cancelled', 'resubmitted', 'unchanged'].includes(noticeKey ?? '') ? 'status' : 'alert'}>{notice}</p>}
    <section className="context-grid" aria-label="Application request details">
      <SurfaceCard title="Current request"><dl>
        <DataRow label="Application ID" mono>{app.id}</DataRow><DataRow label="Client ID" mono>{app.clientId}</DataRow>
        <DataRow label="State">{ownerApplicationState(app.status)}</DataRow>
        <DataRow label="Current review">{app.status === 'active' || app.status === 'suspended' ? (app.reviewDecision === 'approved' ? 'Approved configuration' : 'Existing managed client') :
          app.reviewDecision === 'approved' ? 'Approved, awaiting activation' : app.reviewDecision === 'rejected' ? 'Rejected; edit or cancel this request' : 'Independent review required'}</DataRow>
        <DataRow label="Domain proof">{app.originVerifiedAt ? 'Previously checked; rechecked at activation' : 'Verification required'}</DataRow>
      </dl></SurfaceCard>
      <SurfaceCard title="Domain verification">
        <p>Add this TXT record for the callback host:</p>
        <p><code>{app.originVerificationHost}</code></p><p><code>{app.originVerificationValue}</code></p>
        {app.status === 'requested' ? <ActionForm action="/apps/action" method="post"><input type="hidden" name="applicationId" value={app.id} />
          <button className="button button-secondary" name="intent" value="verify" type="submit">Verify DNS record</button>
        </ActionForm> : app.status === 'cancelled' ? <p>Resubmit this request before verifying DNS.</p> : <p>Contact the operator to change an active or suspended client.</p>}
      </SurfaceCard>
    </section>
    {editable ? <SurfaceCard title="Edit inactive request">
      <p>Changes need new domain verification and approval.</p>
      <ActionForm className="context-form" action="/apps/action" method="post" pendingLabel="Saving request changes…">
        {hidden}<input type="hidden" name="intent" value="edit" />
        <label htmlFor="lifecycle-name">Application name</label><input id="lifecycle-name" name="name" required minLength={2} maxLength={120} defaultValue={app.name} />
        <label htmlFor="lifecycle-platform">Platform</label><select id="lifecycle-platform" name="platform" defaultValue={app.platform}><option value="web">Web application</option><option value="wordpress">WordPress</option></select>
        <label htmlFor="lifecycle-callback">Exact callback URL</label><input id="lifecycle-callback" name="redirectUri" type="url" required defaultValue={app.redirectUri} />
        <label htmlFor="lifecycle-logout">Exact logout return URL</label><input id="lifecycle-logout" name="logoutUri" type="url" required defaultValue={app.logoutUri} />
        <label htmlFor="lifecycle-backchannel">Backchannel logout URL (optional)</label><input id="lifecycle-backchannel" name="backchannelLogoutUri" type="url" defaultValue={app.backchannelLogoutUri ?? ''} />
        <p>Use exact HTTPS URLs. WordPress callback and logout actions must share one wp-login.php path.</p>
        <label htmlFor="lifecycle-visibility">Visibility</label><select id="lifecycle-visibility" name="visibility" defaultValue={app.visibility}><option value="discoverable">Discoverable</option><option value="hidden">Hidden</option></select>
        <label htmlFor="lifecycle-admission">Entry policy</label><select id="lifecycle-admission" name="admission" defaultValue={app.admission}><option value="grant_required">Requires a grant</option><option value="authenticated_open">Open to authenticated people</option></select>
        <label htmlFor="lifecycle-reference">Change reference</label><input id="lifecycle-reference" name="reference" required minLength={4} maxLength={120} pattern="[A-Za-z0-9._:/-]{4,120}" autoCapitalize="none" spellCheck={false} aria-describedby="lifecycle-reference-help" />
        <small id="lifecycle-reference-help">Issue/change reference. No credentials or personal data.</small>
        <button className="button button-primary" type="submit" data-confirm="Save these request changes? Current domain proof and review will be invalidated.">Save request changes</button>
      </ActionForm>
    </SurfaceCard> : <SurfaceCard title="Managed application"><p>Contact the platform operator for changes to this application.</p>
      <dl><DataRow label="Callback URL"><code>{app.redirectUri}</code></DataRow><DataRow label="Logout return URL"><code>{app.logoutUri}</code></DataRow></dl>
    </SurfaceCard>}
    {editable && <SurfaceCard title={app.status === 'cancelled' ? 'Resubmit request' : 'Cancel request'}>
      <p>{app.status === 'cancelled' ? 'Needs new domain verification and review. Up to ten requests can be pending.' : 'Frees a pending-request slot. Application IDs, review history and local app accounts are kept.'}</p>
      <ActionForm className="context-form" action="/apps/action" method="post" pendingLabel="Recording request action…">
        {hidden}<input type="hidden" name="intent" value={app.status === 'cancelled' ? 'resubmit' : 'cancel'} />
        <label htmlFor="lifecycle-state-reference">Action reference</label><input id="lifecycle-state-reference" name="reference" required minLength={4} maxLength={120} pattern="[A-Za-z0-9._:/-]{4,120}" autoCapitalize="none" spellCheck={false} />
        <button className={`button ${app.status === 'cancelled' ? 'button-primary' : 'button-danger'}`} type="submit"
          data-confirm={app.status === 'cancelled' ? 'Resubmit this application for fresh proof and review?' : 'Cancel this inactive request? Its identity and history will be retained.'}>{app.status === 'cancelled' ? 'Resubmit for review' : 'Cancel request'}</button>
      </ActionForm>
    </SurfaceCard>}
    <details className="information-details"><summary>About request changes</summary><p>The client ID stays reserved. Saving changes clears domain proof and review; changing the callback host creates a new TXT value. Changes do not activate the app.</p></details>
  </AppShell>;
}
