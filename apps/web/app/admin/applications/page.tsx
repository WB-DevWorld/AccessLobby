import Link from 'next/link';
import { AvailabilityPanel } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminListPath, applicationState, parseAdminApplications } from '@/lib/admin-model';
import { AdminAccessState, AdminFrame, AdminPagination, AdminSearch, AdminTable, InvalidAdminQuery, adminMetadata } from '../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Applications · Operator console' };
export default async function AdminApplications({ searchParams }: { searchParams: Promise<{ q?: string; after?: string }> }) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const query = await searchParams;
  const path = adminListPath('applications', query.q, query.after);
  const page = path ? await getAdminData(path, parseAdminApplications) : null;
  return <AdminFrame active="applications" title="Applications" description="Review connected apps and new requests.">
    <AdminSearch kind="applications" q={query.q} />
    {!path ? <InvalidAdminQuery /> : !page ? <AvailabilityPanel title="Applications could not be loaded" description="Check your search or retry when the registry is available." action={<RetryButton />} /> : <>
      {page.items.length === 0 ? <p>No applications match this search.</p> : <AdminTable label="Application results"><thead><tr><th scope="col">Application</th><th scope="col">State</th><th scope="col">Domain proof</th><th scope="col">Owner</th><th scope="col">Details</th></tr></thead>
        <tbody>{page.items.map(app => <tr key={app.id}><td><strong>{app.name}</strong><br /><code>{app.clientId}</code><p>{app.platform === 'wordpress' ? 'WordPress' : 'Web application'}</p></td><td>{applicationState(app)}</td><td>{app.originVerifiedAt ? 'Previously verified' : 'Not verified'}</td><td className="admin-id"><code>{app.ownerPersonId}</code></td><td><Link className="text-link" href={`/admin/applications/${app.id}`} aria-label={`Inspect ${app.name}`}>Inspect request</Link></td></tr>)}</tbody></AdminTable>}
      <AdminPagination kind="applications" q={query.q} nextCursor={page.nextCursor} />
    </>}
    <details className="information-details"><summary>About app approval</summary><p>Review approves a request; activation enables it after fresh domain and connection checks. Each app manages its own roles.</p></details>
  </AdminFrame>;
}
