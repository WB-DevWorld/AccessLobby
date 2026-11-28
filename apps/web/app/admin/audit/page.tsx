import Link from 'next/link';
import { AvailabilityPanel } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { parseAdminAudit } from '@/lib/admin-model';
import { auditExportHref, auditListApiPath, auditPageHref, parseAuditFilters, type AuditFilters } from '@/lib/audit-tools';
import { AdminAccessState, AdminDate, AdminFrame, AdminTable, InvalidAdminQuery, adminMetadata } from '../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Operator history · Operator console' };

function AuditFiltersForm({ filters }: { filters: AuditFilters }) {
  return <details className="information-details"><summary>Filters</summary>
    <form className="context-form admin-search" method="get" action="/admin/audit" role="search" aria-label="Filter operator history">
      <label htmlFor="audit-action">Exact action</label><input id="audit-action" name="action" maxLength={100} defaultValue={filters.action ?? ''} autoCapitalize="none" spellCheck={false} />
      <label htmlFor="audit-actor">Actor AccessLobby ID</label><input id="audit-actor" name="actorPersonId" maxLength={36} defaultValue={filters.actorPersonId ?? ''} autoCapitalize="none" spellCheck={false} />
      <label htmlFor="audit-target">Target ID</label><input id="audit-target" name="targetId" maxLength={36} defaultValue={filters.targetId ?? ''} autoCapitalize="none" spellCheck={false} />
      <label htmlFor="audit-reference">Reference contains</label><input id="audit-reference" name="reference" maxLength={120} defaultValue={filters.reference ?? ''} />
      <label htmlFor="audit-from">From (UTC)</label><input id="audit-from" name="from" type="date" defaultValue={filters.from ?? ''} />
      <label htmlFor="audit-to">Through (UTC)</label><input id="audit-to" name="to" type="date" defaultValue={filters.to ?? ''} />
      <small>Dates include the whole UTC day.</small>
      <div className="context-actions"><button className="button button-primary" type="submit">Apply filters</button><Link className="button button-secondary" href="/admin/audit">Clear filters</Link></div>
    </form>
  </details>;
}
function AuditPagination({ filters, nextCursor }: { filters: AuditFilters; nextCursor: string | null }) {
  return <div className="context-actions" aria-label="Results pagination">
    {nextCursor ? <Link className="button button-secondary" href={auditPageHref(filters, nextCursor)}>Next page</Link> : <p className="hero-note">End of these results.</p>}
    <Link className="text-link" href={auditPageHref(filters)}>First page</Link>
  </div>;
}

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const filters = parseAuditFilters(await searchParams);
  const page = filters ? await getAdminData(auditListApiPath(filters), parseAdminAudit) : null;
  const filtered = filters && Object.keys(filters).some(key => key !== 'after');
  return <AdminFrame active="audit" title="Operator history" description="View operator changes and application decisions.">
    <AuditFiltersForm filters={filters ?? {}} />
    {!filters ? <InvalidAdminQuery /> : !page ? <AvailabilityPanel title="Operator history could not be loaded" description="Try again when the history service is available." action={<RetryButton />} /> : <>
      <div className="context-actions"><a className="button button-secondary" href={auditExportHref(filters)}>Export CSV</a><small>First 1,000 matching events.</small>{filtered && <small>Filters applied.</small>}</div>
      {page.items.length === 0 ? <p>{filtered ? 'No operator events match these filters.' : 'No operator events have been recorded.'}</p> : <AdminTable label="Operator history results"><thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th><th scope="col">Reference</th></tr></thead>
        <tbody>{page.items.map(event => <tr key={event.id}><td><AdminDate value={event.occurredAt} /></td><td>{event.action}</td><td className="admin-id">{event.actorPersonId ? <code>{event.actorPersonId}</code> : 'Private operator tooling'}</td><td className="admin-id">{event.targetType}<br /><code>{event.targetId}</code></td><td>{event.reference}</td></tr>)}</tbody></AdminTable>}
      <AuditPagination filters={filters} nextCursor={page.nextCursor} />
    </>}
    <details className="information-details"><summary>What this history includes</summary><p>Operator actions recorded by AccessLobby. Organizations, Keycloak and connected apps keep additional histories. CSV export includes at most 1,000 matching events from the first page and does not add an event to this history.</p></details>
  </AdminFrame>;
}
