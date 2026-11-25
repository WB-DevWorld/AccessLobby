import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getAdminContext, getAdminData } from '@/lib/admin';
import { adminUuid } from '@/lib/admin-model';
import { parseSessionInspection, sessionInspectionNotices } from '@/lib/session-inspection-model';
import { AdminAccessState, AdminDate, AdminFrame, adminMetadata } from '../../../_components';

export const dynamic = 'force-dynamic';
export const metadata = { ...adminMetadata, title: 'Participating app sessions · Operator console' };
export default async function PersonSessions({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ after?: string; notice?: string }>;
}) {
  const context = await getAdminContext();
  if (context.state !== 'ready') return <AdminAccessState context={context} />;
  const { id } = await params; if (!adminUuid(id)) notFound();
  const query = await searchParams;
  const validCursor = query.after === undefined || adminUuid(query.after);
  const result = validCursor ? await getAdminData(`/v1/admin/people/${id}/sessions${query.after ? `?after=${encodeURIComponent(query.after)}` : ''}`, parseSessionInspection) : null;
  const notice = typeof query.notice === 'string' && Object.hasOwn(sessionInspectionNotices, query.notice) ? sessionInspectionNotices[query.notice] : null;
  const canEnd = result && context.access.capabilities.managePeople === true && context.personId !== id && !result.person.protectedOperator;
  return <AdminFrame active="people" title="Participating app sessions" description="Inspect currently recorded, unexpired app receipt associations for this person.">
    <Link className="text-link" href={`/admin/people/${id}`}>Back to person</Link>
    <p>These are centrally recorded associations from participating apps. Browser activity, devices, ordinary IAM sessions and apps without receipts are outside this list.</p>
    <p>Ending an association invalidates its recorded receipts. Participating apps apply this on their next session check, using their existing outage grace and expiry rules. IAM browser sign-out and other app associations remain separate operations.</p>
    {notice && <p className="context-alert" role={['ended', 'unchanged'].includes(query.notice ?? '') ? 'status' : 'alert'}>{notice}</p>}
    {!validCursor ? <p className="context-alert" role="alert">Use a valid results link.</p> : !result ? <AvailabilityPanel title="App associations could not be loaded" description="The record may be unavailable or your access may have changed. Try again when the session service is available." action={<RetryButton />} /> : <>
      {result.person.protectedOperator ? <p>Protected operator associations require the protected offboarding process.</p> : context.personId === id ? <p>Use your account sign-out controls for your own sessions.</p> : !canEnd && <p>Your current role allows inspection. Ending associations requires an identity operator grant.</p>}
      {!result.sessions.length ? <p>No unexpired participating app receipt associations are recorded for this person.</p> : <section className="context-grid" aria-label="Recorded app associations">
        {result.sessions.map(session => <SurfaceCard title={session.applicationName ?? session.clientId} key={session.handle}>
          <dl className="admin-detail"><DataRow label="Client ID" mono>{session.clientId}</DataRow>
            <DataRow label="First receipt recorded"><AdminDate value={session.createdAt} /></DataRow>
            <DataRow label="Last receipt expires"><AdminDate value={session.expiresAt} /></DataRow>
            <DataRow label="Receipt records">{session.receiptCount}</DataRow></dl>
          {canEnd && <ActionForm action={`/admin/people/${id}/sessions/action`} method="post" className="context-form" pendingLabel="Ending app association…">
            <input type="hidden" name="intent" value="end-association" /><input type="hidden" name="handle" value={session.handle} />
            <input type="hidden" name="expectedState" value={session.expectedState} />
            <label htmlFor={`session-reference-${session.handle}`}>Change reference for {session.applicationName ?? session.clientId}</label>
            <input id={`session-reference-${session.handle}`} name="reference" required minLength={4} maxLength={120} pattern="[A-Za-z0-9._:/-]{4,120}" autoCapitalize="none" spellCheck={false} />
            <button className="button button-danger" type="submit"
              data-confirm="End this recorded app association? Participating apps apply the change on their next session check. Freshly changed records require another review.">End app association</button>
          </ActionForm>}
        </SurfaceCard>)}
      </section>}
      <div className="context-actions" aria-label="Association pagination">
        {result.nextCursor ? <Link className="button button-secondary" href={`/admin/people/${id}/sessions?after=${encodeURIComponent(result.nextCursor)}`}>Next page</Link> : <p className="hero-note">End of these recorded associations.</p>}
        <Link className="text-link" href={`/admin/people/${id}/sessions`}>First page</Link>
      </div>
    </>}
  </AdminFrame>;
}
