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
    description={section === 'members' ? 'No memberships were found on this results page.' : section === 'invitations' ?
      'No invitations were found on this results page.' : 'No organization events were found on this results page. This history contains stored organization events, not a complete cross-system security history.'} />;
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
  if (!section || !organizationInspectionPath(id, section, query.after)) return <AdminFrame active="organizations" title="Organization record" description="Inspect stored organization participation.">
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
  if (detail.state !== 'ready') return <AdminFrame active="organizations" title="Organization record" description="Inspect stored organization participation.">
    <AvailabilityPanel title="Organization details could not be loaded" description="No organization details have been confirmed. Try again when the service is available." action={<RetryButton />} />
    <Link className="text-link" href="/admin/organizations">Back to organizations</Link>
  </AdminFrame>;
  const organization = detail.data;
  return <AdminFrame active="organizations" title="Organization record" description="Inspect organization identity, participation and recorded history.">
    <Link className="text-link" href="/admin/organizations">Back to organizations</Link>
    <section className="context-grid" aria-label="Organization details">
      <SurfaceCard title={organization.name}><dl className="admin-detail">
        <DataRow label="Organization ID" mono>{organization.id}</DataRow>
        <DataRow label="Status">{organization.status === 'active' ? 'Active' : 'Suspended'}</DataRow>
        <DataRow label="Created"><AdminDate value={organization.createdAt} /></DataRow>
        <DataRow label="Created by"><PersonLink id={organization.createdByPersonId} /></DataRow>
      </dl><p className="hero-note">The name is the stored organization name. This record does not establish legal ownership or verified company status.</p></SurfaceCard>
      <SurfaceCard title="Participation"><dl className="admin-detail">
        <DataRow label="Active members">{organization.activeMemberCount}</DataRow>
        <DataRow label="Active owners">{organization.activeOwnerCount}</DataRow>
        <DataRow label="All membership records">{organization.totalMembershipCount}</DataRow>
        <DataRow label="All invitation records">{organization.totalInvitationCount}</DataRow>
      </dl><p className="hero-note">Active counts include active memberships whose person is active. The tables also retain left, removed and suspended-person records.</p></SurfaceCard>
    </section>
    <SurfaceCard title="Organization investigation">
      <p>This view is read-only. Organization ownership and membership changes use their authorized organization workflows.</p>
      <nav className="admin-sections" aria-label="Organization record sections">
        {(Object.keys(organizationSectionLabels) as OrganizationSection[]).map(key => <Link key={key}
          href={organizationInspectionHref(id, key)!} className={`button button-secondary button-compact${key === section ? ' admin-section-active' : ''}`}
          aria-current={key === section ? 'page' : undefined}>{organizationSectionLabels[key]}</Link>)}
      </nav>
      <h3>{organizationSectionLabels[section]}</h3>
      {section === 'members' ? <p className="hero-note">Membership status and person status are separate. This directory does not grant application permissions.</p> :
        section === 'invitations' ? <p className="hero-note">Stored status is shown separately from expiry. An overdue pending invitation cannot be accepted. No invitation credentials or acceptance links are displayed.</p> :
          <p className="hero-note">Newest stored organization events appear first. This is organization history; application and IAM activity have separate records.</p>}
      {records.state === 'ready' ? <>
        <InspectionTable section={section} page={records.data} />
        <div className="context-actions" aria-label="Organization results pagination">
          {records.data.nextCursor ? <Link className="button button-secondary" href={organizationInspectionHref(id, section, records.data.nextCursor)!}>Next page</Link> : <p className="hero-note">End of these results.</p>}
          <Link className="text-link" href={organizationInspectionHref(id, section)!}>First page</Link>
        </div>
      </> : records.state === 'invalid-query' ? <InvalidAdminQuery /> : <AvailabilityPanel title="These records could not be loaded"
        description="The organization details are available, but this section could not be confirmed. Try again to load its records." action={<RetryButton />} />}
    </SurfaceCard>
  </AdminFrame>;
}
