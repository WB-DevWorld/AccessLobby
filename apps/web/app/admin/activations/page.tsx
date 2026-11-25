import Link from 'next/link';
import { AvailabilityPanel } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminUuid } from '@/lib/admin-model';
import { activationStatus, parseActivationJobs } from '@/lib/activation-model';
import { AdminAccessState, AdminDate, AdminFrame, AdminTable, InvalidAdminQuery, adminMetadata } from '../_components';
export const dynamic='force-dynamic';
export const metadata={...adminMetadata,title:'Activation jobs · Operator console'};
export default async function ActivationJobs({searchParams}:{searchParams:Promise<{after?:string}>}){
  const context=await getAdminContext();if(context.state!=='ready')return <AdminAccessState context={context}/>;
  const {after}=await searchParams;const valid=after===undefined || adminUuid(after);
  const data=valid?await getAdminData(`/v1/admin/activation-jobs${after?`?after=${encodeURIComponent(after)}`:''}`,parseActivationJobs):null;
  return <AdminFrame active="activations" title="Activation jobs" description="Track reviewed application requests through the private activation worker.">
    <p>Queuing work leaves the application inactive. Only a protected worker with a scoped credential can check current authority, domain proof and exact authentication-client settings.</p>
    {!valid?<InvalidAdminQuery/>:!data?<AvailabilityPanel title="Activation jobs could not be loaded" description="Try again when the operator service is available." action={<RetryButton/>}/>:<>
      {!data.jobs.length?<p>No activation jobs have been requested.</p>:<AdminTable label="Activation jobs"><thead><tr><th scope="col">Application</th><th scope="col">Job state</th><th scope="col">Attempt</th><th scope="col">Updated</th><th scope="col">Details</th></tr></thead>
        <tbody>{data.jobs.map(job=><tr key={job.id}><td>{job.applicationName}<br/><code>{job.clientId}</code></td><td>{activationStatus(job.status)}</td><td>{job.attempt} of {job.maxAttempts}</td><td><AdminDate value={job.updatedAt}/></td><td><Link href={`/admin/activations/${job.id}`}>View activation</Link></td></tr>)}</tbody></AdminTable>}
      <div className="context-actions">{data.nextCursor&&<Link className="button button-secondary" href={`/admin/activations?after=${encodeURIComponent(data.nextCursor)}`}>Next page</Link>}<Link className="text-link" href="/admin/activations">First page</Link></div>
    </>}
  </AdminFrame>;
}
