import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { RetryButton } from '@/components/retry-button';
import { AccountAccessState, AvailabilityPanel, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { isExternalConnectionPreviewEnabled } from '@/lib/features';
import { parseConnections } from '@/lib/external-connections';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Site connections', robots: { index: false, follow: false } };
const notices: Record<string, string> = {
  granted: 'Your approval was saved. The site remains inactive during this preview.',
  withdrawn: 'Your approval was withdrawn. Future use requires your approval again.',
  external_review_required: 'The site details changed or the connection was suspended. Review is required before you can approve it again.',
  unavailable: 'The change could not be completed. Refresh to check its status and try again.'
};
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  if (!isExternalConnectionPreviewEnabled()) notFound();
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} returnTo="/connections" />;
  let connections = null;
  try { const response = await identityApi('/v1/preview/external-consents');
    if (response.ok) connections = parseConnections(await response.json());
  } catch { /* The availability panel preserves an honest error state. */ }
  const notice = notices[(await searchParams).notice ?? ''];
  return <AppShell active="apps" title="Site connections" description="Review approvals for independently operated sites." actions={<Link className="button button-secondary" href="/apps">Your apps</Link>}>
    <p className="context-alert">Preview: external site sign-in is not enabled. These approvals do not activate a site.</p>
    {notice && <p role="status" className="context-alert">{notice}</p>}
    <p>Each site receives a separate account identifier. This preview requests no email, profile or organization data.</p>
    {!connections ? <AvailabilityPanel title="Site connections cannot be checked" description="Reconnect and try again before changing an approval." action={<RetryButton />} /> :
      connections.length === 0 ? <p>You have no site approvals yet. Review a site using its AccessLobby approval link.</p> :
        <div className="context-grid">{connections.map(site => <SurfaceCard title={site.name} key={site.applicationId}>
          <p>Reviewed site: <code>{site.origin ?? 'Unavailable for this earlier preview approval'}</code></p>
          <p>Status: <strong>{site.state === 'withdrawn' ? 'Withdrawn' : site.consentCurrent ? 'Approved for the reviewed configuration' : 'Review required'}</strong></p>
          {!site.reviewAvailable && <p>The site is unavailable or its details have changed. An earlier approval cannot authorize the changed site.</p>}
          {site.reviewAvailable && <Link className="button button-secondary" href={`/connections/${site.applicationId}`}>Review site</Link>}
          {site.state === 'granted' && <ActionForm method="post" action="/connections/action" pendingLabel="Withdrawing approval…">
            <input type="hidden" name="applicationId" value={site.applicationId} />
            <button className="button button-secondary" type="submit" name="intent" value="withdraw">Withdraw approval</button>
          </ActionForm>}
        </SurfaceCard>)}</div>}
    <p>Withdrawal prevents future identity use through this connection. It does not delete an account or commerce records held by that site.</p>
  </AppShell>;
}
