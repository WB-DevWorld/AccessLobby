import { AvailabilityPanel } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminListPath, parseAdminAudit } from '@/lib/admin-model';
import { AdminAccessState, AdminDate, AdminFrame, AdminPagination, AdminTable, InvalidAdminQuery, adminMetadata } from '../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Operator history · Operator console' };
export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const query = await searchParams;
  const path = adminListPath('audit', undefined, query.after);
  const page = path ? await getAdminData(path, parseAdminAudit) : null;
  return <AdminFrame active="audit" title="Operator history" description="View operator changes and application decisions.">
    {!path ? <InvalidAdminQuery /> : !page ? <AvailabilityPanel title="Operator history could not be loaded" description="Try again when the history service is available." action={<RetryButton />} /> : <>
      {page.items.length === 0 ? <p>No operator events have been recorded.</p> : <AdminTable label="Operator history results"><thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">Reference</th></tr></thead>
        <tbody>{page.items.map(event => <tr key={event.id}><td><AdminDate value={event.occurredAt} /></td><td>{event.action}</td><td className="admin-id">{event.actorPersonId ? <code>{event.actorPersonId}</code> : 'Private operator tooling'}</td><td className="admin-id">{event.targetType}<br /><code>{event.targetId}</code></td><td>{event.reference}</td></tr>)}</tbody></AdminTable>}
      <AdminPagination kind="audit" nextCursor={page.nextCursor} />
    </>}
    <details className="information-details"><summary>What this history includes</summary><p>Operator actions recorded by AccessLobby. Organizations, Keycloak and connected apps keep additional histories.</p></details>
  </AdminFrame>;
}
