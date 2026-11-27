import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminUuid } from '@/lib/admin-model';
import { activationErrors, activationNotices, activationStatus, parseActivationJob } from '@/lib/activation-model';
import { AdminAccessState, AdminDate, AdminFrame, adminMetadata } from '../../_components';
export const dynamic='force-dynamic';
export const metadata={...adminMetadata,title:'Private activation · Operator console'};
export default async function ActivationJob({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{notice?:string}>}){
  const context=await getAdminContext();if(context.state!=='ready')return <AdminAccessState context={context}/>;
  const {id}=await params;if(!adminUuid(id))notFound();
  const job=await getAdminData(`/v1/admin/activation-jobs/${id}`,parseActivationJob);
  if(!job)return <AdminFrame active="activations" title="Private activation" description="Inspect the current job."><AvailabilityPanel title="Activation job could not be loaded" description="Your access or this job may have changed." action={<RetryButton/>}/></AdminFrame>;
  const key=(await searchParams).notice;const notice=typeof key==='string'&&Object.hasOwn(activationNotices,key)?activationNotices[key]:null;
  return <AdminFrame active="activations" title="Private activation" description="Track this app’s activation.">
    {notice&&<p className="context-alert" role={key==='queued'||key==='retried'?'status':'alert'}>{notice}</p>}
    <SurfaceCard title={job.applicationName}><dl className="admin-detail">
      <DataRow label="Job ID" mono>{job.id}</DataRow><DataRow label="Client ID" mono>{job.clientId}</DataRow>
      <DataRow label="Job state">{activationStatus(job.status)}</DataRow><DataRow label="Application state">{job.applicationStatus}</DataRow>
      <DataRow label="Attempt">{job.attempt} of {job.maxAttempts}</DataRow><DataRow label="Review reference">{job.reviewReference}</DataRow>
      <DataRow label="Requested by" mono>{job.requestedBy}</DataRow><DataRow label="Requested"><AdminDate value={job.createdAt}/></DataRow><DataRow label="Updated"><AdminDate value={job.updatedAt}/></DataRow>
    </dl><Link className="text-link" href={`/admin/applications/${job.applicationId}`}>Inspect application configuration</Link></SurfaceCard>
    {job.status==='queued'&&<p>Queued for private checks. The app remains inactive.</p>}
    {job.status==='running'&&<p>Activation is in progress. Refresh for updates.</p>}
    {job.status==='succeeded'&&<p>Activated. Test the app’s sign-in, access and sign-out.</p>}
    {job.status==='failed'&&<SurfaceCard title="Activation did not complete"><p>{job.lastError&&activationErrors[job.lastError]?activationErrors[job.lastError]:'A private operator must inspect the current job before further action.'}</p>
      <p>Check the application state above before retrying.</p>
      {job.retryable&&context.access.capabilities.activateApplications?<ActionForm action="/admin/activations/action" method="post">
        <input type="hidden" name="intent" value="retry"/><input type="hidden" name="jobId" value={job.id}/><input type="hidden" name="expectedAttempt" value={job.attempt}/>
        <button className="button button-primary" type="submit" data-confirm="Queue another private activation attempt? Current review, authority, domain proof and exact client settings must pass again.">Retry activation</button>
      </ActionForm>:<p>{job.retryable?'An application operator grant is required to retry.':'This job is not eligible for a browser retry.'}</p>}
    </SurfaceCard>}
    <details className="information-details"><summary>Activation details</summary>
      <p>Private checks confirm approval, authority, domain proof and connection settings. Interrupted work can resume after its claim expires; failed recovery does not automatically repair or enable a Keycloak client.</p>
    </details>
    <div className="context-actions"><RetryButton/><Link className="text-link" href="/admin/activations">All activation jobs</Link></div>
  </AdminFrame>;
}
