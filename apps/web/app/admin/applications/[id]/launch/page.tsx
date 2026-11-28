import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminUuid } from '@/lib/admin-model';
import { applicationLaunchNotices, parseApplicationLaunch } from '@/lib/application-launch';
import { AdminAccessState, AdminDate, AdminFrame, adminMetadata } from '../../../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'App launch link · Operator console' };
export default async function ApplicationLaunch({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }>;
}) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const { id } = await params; if (!adminUuid(id)) notFound();
  const detail = await getAdminData(`/v1/admin/applications/${id}/launch`, parseApplicationLaunch);
  if (!detail || detail.application.id !== id.toLowerCase()) return <AdminFrame active="applications" title="App launch link" description="Manage the app’s entry link.">
    <AvailabilityPanel title="Launch details unavailable" description="Try loading this application again." action={<RetryButton />} />
  </AdminFrame>;
  const { application: app, launch } = detail, key = (await searchParams).notice;
  const notice = typeof key === 'string' && Object.hasOwn(applicationLaunchNotices, key) ? applicationLaunchNotices[key] : null;
  return <AdminFrame active="applications" title="App launch link" description="Choose where Open app takes a person.">
    <Link className="text-link" href={`/admin/applications/${app.id}`}>Back to application</Link>
    {notice && <p className="context-alert" role={['saved', 'removed', 'unchanged'].includes(key ?? '') ? 'status' : 'alert'}>{notice}</p>}
    <section className="context-grid" aria-label="App launch details">
      <SurfaceCard title={app.name}><dl className="admin-detail">
        <DataRow label="Client ID" mono>{app.clientId}</DataRow><DataRow label="Status">{app.status}</DataRow>
        <DataRow label="Callback origin" mono>{new URL(app.redirectUri).origin}</DataRow>
        <DataRow label="Current launch link" mono>{launch.needsReview ? 'Needs review' : launch.launchUrl ?? 'No launch link'}</DataRow>
        {launch.updatedAt && <DataRow label="Last updated"><AdminDate value={launch.updatedAt} /></DataRow>}
        {launch.reference && <DataRow label="Change reference" mono>{launch.reference}</DataRow>}
      </dl></SurfaceCard>
      <SurfaceCard title="Entry link">
        {!context.access.capabilities.activateApplications ? <p>Changing a launch link requires an application operator grant.</p> :
          !detail.canManage ? <p>{['accesslobby-web', 'accesslobby-api'].includes(app.clientId) ? 'Core services use the protected operator process.' : 'Launch links are available for active first-party apps.'}</p> :
            <ActionForm className="context-form" method="post" action={`/admin/applications/${app.id}/launch/action`} pendingLabel="Saving launch link…">
              <input type="hidden" name="expectedVersion" value={launch.version} />
              <label htmlFor="launch-url">Launch URL</label>
              <input id="launch-url" type="url" name="launchUrl" defaultValue={launch.launchUrl ?? ''} maxLength={2048} autoCapitalize="none" spellCheck={false} aria-describedby="launch-url-help" />
              <small id="launch-url-help">Use an HTTPS page on {new URL(app.redirectUri).origin}, without a query or fragment. Leave blank to remove the link.</small>
              <label htmlFor="launch-reference">Change reference</label>
              <input id="launch-reference" name="reference" required minLength={4} maxLength={120} pattern="[A-Za-z0-9._:/-]{4,120}" autoCapitalize="none" spellCheck={false} />
              <button className="button button-primary" type="submit" data-confirm={`Save the reviewed launch link for ${app.name}?`}>Save launch link</button>
            </ActionForm>}
        <details className="information-details"><summary>Link and access</summary><p>The link appears only where discovery and entry rules already allow it. App roles and sign-in settings are managed separately. Keep credentials out of the URL and change reference.</p></details>
      </SurfaceCard>
    </section>
  </AdminFrame>;
}
