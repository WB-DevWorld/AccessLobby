import { AvailabilityPanel } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminListPath, parseAdminOrganizations } from '@/lib/admin-model';
import { AdminAccessState, AdminDate, AdminFrame, AdminPagination, AdminSearch, AdminTable, InvalidAdminQuery, adminMetadata } from '../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Organizations · Operator console' };
export default async function AdminOrganizations({ searchParams }: { searchParams: Promise<{ q?: string; after?: string }> }) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const query = await searchParams;
  const path = adminListPath('organizations', query.q, query.after);
  const page = path ? await getAdminData(path, parseAdminOrganizations) : null;
  return <AdminFrame active="organizations" title="Organizations" description="Inspect organization records across the platform.">
    <AdminSearch kind="organizations" q={query.q} />
    {!path ? <InvalidAdminQuery /> : !page ? <AvailabilityPanel title="Organizations could not be loaded" description="Check your search or retry when the directory is available." action={<RetryButton />} /> : <>
      {page.items.length === 0 ? <p>No organizations match this search.</p> : <AdminTable label="Organization results"><thead><tr><th scope="col">Organization</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Active members</th><th scope="col">Owners</th></tr></thead>
        <tbody>{page.items.map(org => <tr key={org.id}><td className="admin-id"><strong>{org.name}</strong><br /><code>{org.id}</code></td><td>{org.status === 'active' ? 'Active' : 'Suspended'}</td><td><AdminDate value={org.createdAt} /></td><td>{org.memberCount}</td><td>{org.ownerCount}</td></tr>)}</tbody></AdminTable>}
      <AdminPagination kind="organizations" q={query.q} nextCursor={page.nextCursor} />
    </>}
    <p className="hero-note">Organization names are self-asserted. Directory presence does not verify legal ownership. Membership management remains in each organization’s account workflow.</p>
  </AdminFrame>;
}
