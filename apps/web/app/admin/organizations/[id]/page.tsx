import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext } from '@/lib/admin';
import { adminUuid } from '@/lib/admin-model';
import { identityApi } from '@/lib/current-identity';
import { loadOrganizationInspection } from '@/lib/organization-inspection-data';
import { organizationEventLabels, organizationInspectionHref, organizationInspectionPath, organizationSection, organizationSectionLabels,
  parseOrganizationEvents, parseOrganizationInspection, parseOrganizationInvitations, parseOrganizationMembers,
  type OrganizationEvent, type OrganizationInspectionPage, type OrganizationInvitation, type OrganizationMember, type OrganizationSection } from '@/lib/organization-inspection';
import { AdminAccessState, AdminDate, AdminFrame, AdminTable, adminMetadata, InvalidAdminQuery } from '../../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Organization · Operator console' };
type InspectionRow = OrganizationMember | OrganizationInvitation | OrganizationEvent;

function PersonLink({ id }: { id: string }) {
  return <Link className="text-link data-mono" href={`/admin/people/${id}`}>{id}</Link>;
}
function InspectionTable({ section, page }: { section: OrganizationSection; page: OrganizationInspectionPage<InspectionRow> }) {
  if (!page.items.length) return <AvailabilityPanel title={section === 'members' ? 'No membership records' : section === 'invitations' ? 'No invitation records' : 'No recorded organization events'}
    description={section === 'members' ? 'No memberships on this page.' : section === 'invitations' ?
      'No invitations on this page.' : 'No organization events on this page.'} />;
  return <AdminTable label={organizationSectionLabels[section]}>
    <thead><tr>{(section === 'members' ? ['Person', 'Role', 'Membership status', 'Person status', 'Joined', 'Ended'] : section === 'invitations' ?
      ['Invitation / person', 'Invited by', 'Role', 'Stored status', 'Expires', 'Created / decided'] : ['Event', 'Actor', 'Target', 'Recorded']).map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
    <tbody>{page.items.map(row => 'membershipStatus' in row ? <tr key={row.personId}>
      <th scope="row" className="admin-id"><PersonLink id={row.personId} /></th><td>{row.role}</td><td>{row.membershipStatus}</td><td>{row.personStatus}</td>
      <td><AdminDate value={row.joinedAt} /></td><td>{row.endedAt ? <AdminDate value={row.endedAt} /> : 'No end recorded'}</td>
    </tr> : 'pendingExpired' in row ? <tr key={row.id}>
      <th scope="row" className="admin-id"><span className="data-mono">{row.id}</span><br /><PersonLink id={row.personId} /></th>
      <td><PersonLink id={row.invitedByPersonId} /></td><td>{row.role}</td>
      <td>{row.status}{row.pendingExpired && <><br /><small>Expired; no longer actionable</small></>}</td>
      <td><AdminDate value={row.expiresAt} /></td><td><AdminDate value={row.createdAt} /><br />{row.decidedAt ? <>Decision: <AdminDate value={row.decidedAt} /></> : 'No decision recorded'}</td>
    </tr> : <tr key={row.id}>
      <th scope="row">{organizationEventLabels[row.action]}<br /><small>Event {row.id}</small></th>
      <td><PersonLink id={row.actorPersonId} /></td><td>{row.targetPersonId ? <PersonLink id={row.targetPersonId} /> : 'No person target'}</td>
      <td><AdminDate value={row.occurredAt} /></td>
    </tr>)}</tbody>
  </AdminTable>;
}

export default async function AdminOrganization({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ section?: string | string[]; after?: string | string[] }>;
}) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const { id } = await params;
  if (!adminUuid(id)) notFound();
  const query = await searchParams;
  const section = organizationSection(query.section);
  if (!section || !organizationInspectionPath(id, section, query.after)) return <AdminFrame active="organizations" title="Organization record" description="View members, invitations and history.">
    <InvalidAdminQuery /><Link className="text-link" href={`/admin/organizations/${id}`}>Start with this organization</Link>
  </AdminFrame>;
  const parser = (value: unknown): OrganizationInspectionPage<InspectionRow> | null => section === 'members' ? parseOrganizationMembers(value, id) :
    section === 'invitations' ? parseOrganizationInvitations(value, id) : parseOrganizationEvents(value, id);
  const [detail, records] = await Promise.all([
    loadOrganizationInspection(id, 'detail', undefined, parseOrganizationInspection, identityApi),
    loadOrganizationInspection(id, section, query.after, parser, identityApi),
  ]);
  // A revoked grant or ended session between requests must replace the whole inspection view.
  for (const result of [detail, records]) {
    if (result.state === 'signed-out' || result.state === 'forbidden') return <AdminAccessState context={{ state: result.state }} />;
    if (result.state === 'not-found') notFound();
  }
  if (detail.state !== 'ready') return <AdminFrame active="organizations" title="Organization record" description="View members, invitations and history.">
    <AvailabilityPanel title="Organization details could not be loaded" description="Try again when the service is available." action={<RetryButton />} />
    <Link className="text-link" href="/admin/organizations">Back to organizations</Link>
  </AdminFrame>;
  const organization = detail.data;
  return <AdminFrame active="organizations" title="Organization record" description="View members, invitations and history.">
    <Link className="text-link" href="/admin/organizations">Back to organizations</Link>
    <section className="context-grid" aria-label="Organization details">
      <SurfaceCard title={organization.name}><dl className="admin-detail">
        <DataRow label="Organization ID" mono>{organization.id}</DataRow>
        <DataRow label="Status">{organization.status === 'active' ? 'Active' : 'Suspended'}</DataRow>
        <DataRow label="Created"><AdminDate value={organization.createdAt} /></DataRow>
        <DataRow label="Created by"><PersonLink id={organization.createdByPersonId} /></DataRow>
      </dl><details className="information-details"><summary>About this organization</summary><p>The name is self-asserted; this record does not verify company status or legal ownership.</p></details></SurfaceCard>
      <SurfaceCard title="Participation"><dl className="admin-detail">
        <DataRow label="Active members">{organization.activeMemberCount}</DataRow>
        <DataRow label="Active owners">{organization.activeOwnerCount}</DataRow>
        <DataRow label="All membership records">{organization.totalMembershipCount}</DataRow>
        <DataRow label="All invitation records">{organization.totalInvitationCount}</DataRow>
      </dl><details className="information-details"><summary>Count details</summary><p>Active counts require an active membership and person. Historical and suspended-person records remain in the tables.</p></details></SurfaceCard>
    </section>
    <SurfaceCard title="Organization investigation">
      <p>Read-only records.</p>
      <nav className="admin-sections" aria-label="Organization record sections">
        {(Object.keys(organizationSectionLabels) as OrganizationSection[]).map(key => <Link key={key}
          href={organizationInspectionHref(id, key)!} className={`button button-secondary button-compact${key === section ? ' admin-section-active' : ''}`}
          aria-current={key === section ? 'page' : undefined}>{organizationSectionLabels[key]}</Link>)}
      </nav>
      <h3>{organizationSectionLabels[section]}</h3>
      {section === 'invitations' && <p className="hero-note">Expired invitations cannot be accepted.</p>}
      {records.state === 'ready' ? <>
        <InspectionTable section={section} page={records.data} />
        <div className="context-actions" aria-label="Organization results pagination">
          {records.data.nextCursor ? <Link className="button button-secondary" href={organizationInspectionHref(id, section, records.data.nextCursor)!}>Next page</Link> : <p className="hero-note">End of these results.</p>}
          <Link className="text-link" href={organizationInspectionHref(id, section)!}>First page</Link>
        </div>
      </> : records.state === 'invalid-query' ? <InvalidAdminQuery /> : <AvailabilityPanel title="These records could not be loaded"
        description="This section is unavailable. Try again." action={<RetryButton />} />}
      <details className="information-details"><summary>About these records</summary>
        <p>Manage ownership and memberships from the organization’s account. Membership does not grant application permissions.</p>
        {section === 'members' ? <p>Membership and person status are shown separately.</p> : section === 'invitations' ?
          <p>Invitation status and expiry are shown separately. Acceptance links are not included.</p> :
          <p>Newest organization events appear first. Keycloak and apps keep separate histories.</p>}
      </details>
    </SurfaceCard>
  </AdminFrame>;
}
