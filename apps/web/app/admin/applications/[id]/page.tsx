import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { RetryButton } from '@/components/retry-button';
import { AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminNotices, adminUuid, applicationState, parseAdminApplication } from '@/lib/admin-model';
import { activationNotices } from '@/lib/activation-model';
import { AdminAccessState, AdminDate, AdminFrame, adminMetadata } from '../../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Application request · Operator console' };

export default async function AdminApplication({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }>;
}) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const { id } = await params;
  if (!adminUuid(id)) notFound();
  const app = await getAdminData(`/v1/admin/applications/${id}`, parseAdminApplication);
  if (!app) return <AdminFrame active="applications" title="Application request" description="Review the app request.">
    <AvailabilityPanel title="This application cannot be viewed" description="The request or your access may have changed. Try again." action={<RetryButton />} />
  </AdminFrame>;
  const noticeKey = (await searchParams).notice;
  const notices={...adminNotices,...activationNotices};
  const notice = typeof noticeKey === 'string' && Object.hasOwn(notices, noticeKey) ? notices[noticeKey] : null;
  const currentReview = app.review?.configurationHash === app.configurationHash ? app.review : null;
  const reviewAuthorityCurrent=currentReview?.authorizationCurrent===true;
  const requested = app.status === 'requested' && app.trustClass === 'unreviewed';
  const independent = context.personId !== app.ownerPersonId;
  const canReview = requested && independent && context.access.capabilities.reviewApplications && !currentReview;
  return <AdminFrame active="applications" title={app.name} description="Review this app and its connection settings.">
    {notice && <p className={`context-alert${noticeKey === 'approved' || noticeKey === 'rejected' ? ' context-success' : ''}`} role={noticeKey === 'approved' || noticeKey === 'rejected' ? 'status' : 'alert'}>{notice}</p>}
    <p><Link className="text-link" href={`/admin/applications/${id}/suspension`}>Application suspension controls</Link></p>
    <section className="context-grid" aria-label="Application configuration">
      <SurfaceCard title="Registered request"><dl className="admin-detail">
        <DataRow label="Application ID" mono>{app.id}</DataRow><DataRow label="Client ID" mono>{app.clientId}</DataRow>
        <DataRow label="Owner AccessLobby ID" mono>{app.ownerPersonId}</DataRow>
        <DataRow label="Platform">{app.platform === 'wordpress' ? 'WordPress' : 'Web application'}</DataRow>
        <DataRow label="State">{applicationState({ status: app.status, reviewDecision: currentReview?.decision==='approved'&&!reviewAuthorityCurrent?null:currentReview?.decision ?? null })}</DataRow>
        <DataRow label="Classification">{app.trustClass === 'first_party' ? 'First party' : app.trustClass === 'external' ? 'External' : 'Unreviewed'}</DataRow>
        <DataRow label="Visibility">{app.visibility === 'discoverable' ? 'Discoverable' : 'Hidden'}</DataRow>
        <DataRow label="Entry policy">{app.admission === 'grant_required' ? 'Requires an individual grant' : 'Open to authenticated people'}</DataRow>
      </dl></SurfaceCard>
      <SurfaceCard title="Callback, logout and domain proof"><dl className="admin-detail">
        <DataRow label="Exact callback URL"><code>{app.redirectUri}</code></DataRow>
        <DataRow label="Logout return URL"><code>{app.logoutUri}</code></DataRow>
        <DataRow label="Backchannel logout URL">{app.backchannelLogoutUri ? <code>{app.backchannelLogoutUri}</code> : 'Not registered'}</DataRow>
        <DataRow label="Verified callback host">{app.originVerifiedHost ? <code>{app.originVerifiedHost}</code> : 'Not verified'}</DataRow>
        <DataRow label="Domain proof checked">{app.originVerifiedAt ? <AdminDate value={app.originVerifiedAt} /> : 'Waiting for the app owner to verify DNS'}</DataRow>
      </dl></SurfaceCard>
    </section>
    {app.review && <SurfaceCard title={currentReview ? 'Recorded decision' : 'Earlier configuration decision'}>
      <dl className="admin-detail"><DataRow label="Decision">{app.review.decision === 'approved' ? 'Approved' : 'Rejected'}</DataRow>
        <DataRow label="Review reference">{app.review.reference}</DataRow>
        <DataRow label="Reviewer AccessLobby ID" mono>{app.review.reviewerPersonId}</DataRow>
        <DataRow label="Recorded"><AdminDate value={app.review.reviewedAt} /></DataRow></dl>
      {!currentReview && <p className="context-alert">The app has changed. This earlier decision no longer applies.</p>}
      {currentReview?.decision === 'approved' && requested && (reviewAuthorityCurrent?
        <p>Approved; awaiting private activation.</p>:
        <p className="context-alert">Reviewer access has changed. The app owner must verify DNS again before a fresh independent review. This decision cannot be reused.</p>)}
    </SurfaceCard>}
    {requested&&currentReview?.decision==='approved'&&reviewAuthorityCurrent&&<SurfaceCard title="Private activation request">
      <p>The app stays inactive until its approval, domain and connection settings pass.</p>
      {context.access.capabilities.activateApplications?<ActionForm action="/admin/activations/action" method="post" pendingLabel="Queuing activation…">
        <input type="hidden" name="intent" value="queue"/><input type="hidden" name="applicationId" value={app.id}/>
        <input type="hidden" name="configurationHash" value={app.configurationHash}/><input type="hidden" name="reviewReference" value={currentReview.reference}/>
        <button className="button button-primary" type="submit" data-confirm="Queue private activation for this exact reviewed configuration? The application stays inactive until all protected checks pass.">Queue private activation</button>
      </ActionForm>:<p>An application operator grant is required to queue activation.</p>}
      <Link className="text-link" href="/admin/activations">View activation jobs</Link>
    </SurfaceCard>}
    {requested && !currentReview && <SurfaceCard title="Independent first-party review">
      <p>Check the owner, domain and exact URLs. Approval does not activate the app.</p>
      {!context.access.capabilities.reviewApplications ? <p>A reviewer grant is required to record a decision.</p> :
        !independent ? <p>The application owner cannot review their own request. Ask another authorized reviewer.</p> : canReview &&
          <ActionForm action="/admin/action" method="post" className="context-form admin-review-reference" pendingLabel="Recording decision…">
            <input type="hidden" name="intent" value="review" /><input type="hidden" name="applicationId" value={app.id} />
            <input type="hidden" name="configurationHash" value={app.configurationHash} />
            <label htmlFor="review-reference">Review reference</label>
            <input id="review-reference" name="reference" required minLength={4} maxLength={120} pattern="[A-Za-z0-9._:/-]{4,120}" aria-describedby="review-reference-help" autoCapitalize="none" spellCheck={false} />
            <small id="review-reference-help">Use a ticket or review reference. Do not enter credentials or personal information.</small>
            {!app.originVerifiedAt && <p className="context-alert">The app owner must verify the callback domain before approval. You can still reject this request.</p>}
            <div className="context-actions">
              <button className="button button-primary" type="submit" name="decision" value="approved" disabled={!app.originVerifiedAt}
                data-confirm="Approve this exact first-party application configuration? The application will remain inactive until private activation succeeds.">Approve first-party review</button>
              <button className="button button-danger" type="submit" name="decision" value="rejected"
                data-confirm="Reject this request? This decision will block activation of the current configuration.">Reject request</button>
            </div>
          </ActionForm>}
    </SurfaceCard>}
    <details className="information-details"><summary>How activation works</summary><ol className="admin-stage-list">
      <li>The owner proves control of the callback domain.</li>
      <li>An independent reviewer approves the exact connection settings.</li>
      <li>Private checks confirm current approval, DNS proof and Keycloak settings before activation.</li>
    </ol><p>Apps manage their own permissions. External customers and additional realms require separate setup.</p></details>
  </AdminFrame>;
}
