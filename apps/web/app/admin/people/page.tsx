import { AvailabilityPanel } from '@/components/ui';
import Link from 'next/link';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminListPath, parseAdminPeople } from '@/lib/admin-model';
import { AdminAccessState, AdminDate, AdminFrame, AdminPagination, AdminSearch, AdminTable, InvalidAdminQuery, adminMetadata } from '../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'People · Operator console' };
export default async function AdminPeople({ searchParams }: { searchParams: Promise<{ q?: string; after?: string }> }) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const query = await searchParams;
  const path = adminListPath('people', query.q, query.after);
  const page = path ? await getAdminData(path, parseAdminPeople) : null;
  return <AdminFrame active="people" title="People" description="Find people by AccessLobby ID.">
    <AdminSearch kind="people" q={query.q} />
    {!path ? <InvalidAdminQuery /> : !page ? <AvailabilityPanel title="People could not be loaded" description="Check your search or try again when the directory is available." action={<RetryButton />} /> : <>
      {page.items.length === 0 ? <p>No people match this search.</p> : <AdminTable label="People results"><thead><tr><th scope="col">AccessLobby ID</th><th scope="col">Status</th><th scope="col">Created</th><th scope="col">Organizations</th><th scope="col">Applications owned</th></tr></thead>
        <tbody>{page.items.map(person => <tr key={person.id}><td className="admin-id"><Link href={`/admin/people/${person.id}`}><code>{person.id}</code></Link></td><td>{person.status === 'active' ? 'Active' : 'Suspended'}</td><td><AdminDate value={person.createdAt} /></td><td>{person.organizationCount}</td><td>{person.applicationCount}</td></tr>)}</tbody></AdminTable>}
      <AdminPagination kind="people" q={query.q} nextCursor={page.nextCursor} />
    </>}
    <details className="information-details"><summary>About this directory</summary><p>Search uses AccessLobby IDs. Names, email addresses and application-local accounts are not included.</p></details>
  </AdminFrame>;
}
