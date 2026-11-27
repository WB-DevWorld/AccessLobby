import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminUuid } from '@/lib/admin-model';
import { applicationSuspensionNotices, parseApplicationSuspensionDetail } from '@/lib/application-suspension-model';
import { AdminAccessState, AdminDate, AdminFrame, adminMetadata } from '../../../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Application suspension · Operator console' };
export default async function ApplicationSuspension({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }>;
}) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const { id } = await params; if (!adminUuid(id)) notFound();
  const detail = await getAdminData(`/v1/admin/applications/${id}/suspension`, parseApplicationSuspensionDetail);
  if (!detail) return <AdminFrame active="applications" title="Application suspension" description="Manage this app’s AccessLobby access.">
    <AvailabilityPanel title="This application cannot be viewed" description="The record may be unavailable or your access may have changed." action={<RetryButton />} />
  </AdminFrame>;
  const app = detail.application, noticeKey = (await searchParams).notice;
  const notice = typeof noticeKey === 'string' && Object.hasOwn(applicationSuspensionNotices, noticeKey) ? applicationSuspensionNotices[noticeKey] : null;
  const success = ['suspended', 'unchanged'].includes(noticeKey ?? '') && app.status === 'suspended';
  return <AdminFrame active="applications" title="Application suspension" description="Manage this app’s AccessLobby access.">
    <Link className="text-link" href={`/admin/applications/${app.id}`}>Back to application</Link>
    {notice && <p className="context-alert" role={success ? 'status' : 'alert'}>{notice}</p>}
    <section className="context-grid" aria-label="Application suspension details">
      <SurfaceCard title={app.name}><dl className="admin-detail">
        <DataRow label="Application ID" mono>{app.id}</DataRow><DataRow label="Client ID" mono>{app.clientId}</DataRow>
        <DataRow label="Registry status">{app.status}</DataRow><DataRow label="Trust class">{app.trustClass}</DataRow>
        <DataRow label="Administration version" mono>{app.version}</DataRow>
        {app.suspendedAt && <DataRow label="Last suspended"><AdminDate value={app.suspendedAt} /></DataRow>}
        {app.suspensionReference && <DataRow label="Suspension reference" mono>{app.suspensionReference}</DataRow>}
      </dl></SurfaceCard>
      <SurfaceCard title="AccessLobby admission">
        <p>Suspension blocks this app’s AccessLobby access. Existing sessions follow the app’s checks and expiry rules. Reinstatement requires a private operator.</p>
        <details className="information-details"><summary>What suspension changes</summary>
          <p>Recorded session associations end and cannot revive after reinstatement. App records and history are retained; Keycloak clients and app cookies are managed separately.</p>
        </details>
        {!context.access.capabilities.activateApplications ? <p>Suspension requires an application operator grant.</p> :
          !detail.canSuspend ? <p className="context-alert">{app.status === 'suspended' ? 'This application is already suspended.' : ['accesslobby-web', 'accesslobby-api'].includes(app.clientId) ?
            'Core AccessLobby services require the protected private operator process.' : 'Only an active first-party application can be suspended here.'}</p> :
            <ActionForm className="context-form" method="post" action={`/admin/applications/${app.id}/suspension/action`} pendingLabel="Suspending application…">
              <input type="hidden" name="intent" value="suspend" /><input type="hidden" name="expectedStatus" value="active" />
              <input type="hidden" name="expectedVersion" value={app.version} />
              <label htmlFor="suspension-client">Confirm exact client ID</label>
              <input id="suspension-client" name="confirmationClientId" required maxLength={80} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="suspension-client-help" />
              <small id="suspension-client-help">Type {app.clientId} exactly to confirm this application.</small>
              <label htmlFor="suspension-reference">Change reference</label>
              <input id="suspension-reference" name="reference" required minLength={4} maxLength={120} pattern="[A-Za-z0-9._:/-]{4,120}" autoCapitalize="none" spellCheck={false} aria-describedby="suspension-reference-help" />
              <small id="suspension-reference-help">Use an issue or change reference. Do not enter credentials or personal information.</small>
              <button className="button button-danger" type="submit" data-confirm={`Suspend ${app.clientId} in AccessLobby? Admission and existing peer-session receipts will end. IAM clients and application cookies are managed separately.`}>Suspend application</button>
            </ActionForm>}
      </SurfaceCard>
    </section>
  </AdminFrame>;
}
