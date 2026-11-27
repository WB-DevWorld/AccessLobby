import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminUuid } from '@/lib/admin-model';
import { parseAdminPersonDetail, personControlNotices } from '@/lib/person-controls-model';
import { AdminAccessState, AdminDate, AdminFrame, adminMetadata } from '../../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Person · Operator console' };

export default async function AdminPerson({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }>;
}) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const { id } = await params;
  if (!adminUuid(id)) notFound();
  const person = await getAdminData(`/v1/admin/people/${id}`, parseAdminPersonDetail);
  if (!person) return <AdminFrame active="people" title="Person" description="View this person’s AccessLobby record.">
    <AvailabilityPanel title="This person cannot be viewed" description="The record or your access may have changed. Try again." action={<RetryButton />} />
  </AdminFrame>;
  const noticeKey = (await searchParams).notice;
  const notice = typeof noticeKey === 'string' && Object.hasOwn(personControlNotices, noticeKey) ? personControlNotices[noticeKey] : null;
  const success = ['suspended', 'reenabled', 'unchanged'].includes(noticeKey ?? '');
  const canChange = context.access.capabilities.managePeople === true && context.personId !== person.id && !person.protectedOperator;
  return <AdminFrame active="people" title="Person record" description="View account status and participation.">
    <Link className="text-link" href="/admin/people">Back to people</Link>
    <p><Link className="text-link" href={`/admin/people/${id}/sessions`}>Inspect participating app sessions</Link></p>
    {notice && <p className="context-alert" role={success ? 'status' : 'alert'}>{notice}</p>}
    <section className="context-grid" aria-label="Person details">
      <SurfaceCard title="Durable identity"><dl className="admin-detail">
        <DataRow label="AccessLobby ID" mono>{person.id}</DataRow>
        <DataRow label="Status">{person.status === 'active' ? 'Active' : 'Suspended'}</DataRow>
        <DataRow label="Created"><AdminDate value={person.createdAt} /></DataRow>
        <DataRow label="Active organizations">{person.organizationCount}</DataRow>
        <DataRow label="Applications owned">{person.applicationCount}</DataRow>
        <DataRow label="Protected operator">{person.protectedOperator ? 'Yes' : 'No'}</DataRow>
      </dl></SurfaceCard>
      <SurfaceCard title="Person status">
        <p>Suspension blocks AccessLobby access. Apps apply their session checks and expiry rules. Re-enabling requires a fresh sign-in.</p>
        <details className="information-details"><summary>How suspension affects apps</summary>
          <p>Recorded app sessions end through each app’s checks and expiry rules. Identity links, organization records and app information are retained.</p>
        </details>
        {person.protectedOperator ? <p className="context-alert">This person holds a platform operator role. Use the protected operator offboarding process.</p> :
          context.personId === person.id ? <p>You cannot change your own person status here.</p> :
            !context.access.capabilities.managePeople ? <p>Person administration requires an identity operator grant.</p> : canChange &&
              <ActionForm className="context-form" action="/admin/people/action" method="post" pendingLabel="Saving person status…">
                <input type="hidden" name="intent" value="change-status" /><input type="hidden" name="personId" value={person.id} />
                <input type="hidden" name="expectedVersion" value={person.statusVersion} />
                <label htmlFor="person-change-reference">Change reference</label>
                <input id="person-change-reference" name="reference" required minLength={4} maxLength={120} pattern="[A-Za-z0-9._:/-]{4,120}" autoCapitalize="none" spellCheck={false} aria-describedby="person-change-help" />
                <small id="person-change-help">Use an issue or change reference. Do not enter credentials or personal information.</small>
                {person.status === 'active' ? <button className="button button-danger" type="submit" name="status" value="suspended"
                  data-confirm="Suspend this person? Current AccessLobby access and peer-session receipts will end. Their existing information is retained.">Suspend person</button> :
                  <button className="button button-primary" type="submit" name="status" value="active"
                    data-confirm="Re-enable this person? They must complete fresh authentication before using AccessLobby again.">Re-enable person</button>}
              </ActionForm>}
      </SurfaceCard>
    </section>
  </AdminFrame>;
}
