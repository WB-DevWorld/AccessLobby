import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { AccountAccessState, AvailabilityPanel, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { isExternalConnectionPreviewEnabled } from '@/lib/features';
import { connectionId, parseConnectionReview } from '@/lib/external-connections';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review site connection', robots: { index: false, follow: false } };
export default async function ConnectionPage({ params }: { params: Promise<{ applicationId: string }> }) {
  if (!isExternalConnectionPreviewEnabled()) notFound();
  const { applicationId } = await params;
  if (!connectionId(applicationId)) notFound();
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} returnTo={`/connections/${applicationId}`} />;
  let site = null;
  try { const response = await identityApi(`/v1/preview/external-profiles/${applicationId}`);
    if (response.ok) site = parseConnectionReview(await response.json(), applicationId);
  } catch { /* No unverified configuration is rendered as an approval form. */ }
  return <AppShell active="apps" title="Review site connection" description="Choose whether to approve this site’s identity request." actions={<Link className="button button-secondary" href="/connections">Site connections</Link>}>
    {!site ? <AvailabilityPanel title="This site cannot be approved" description="It may be unavailable, suspended or waiting for a new review. You can still withdraw an earlier approval from Site connections." action={<Link className="button button-secondary" href="/connections">View your approvals</Link>} /> :
      <SurfaceCard title={site.name}>
        <p>Site: <strong><code>{site.origin}</code></strong></p>
        <p>Preview: external site sign-in remains inactive. Approval alone does not enable access.</p>
        <h3>Requested identity information</h3>
        <ul><li>A separate account identifier for this site.</li><li>No email address, profile or organization information.</li></ul>
        <p>The site keeps its own accounts, roles and business records. You can withdraw this approval in Site connections.</p>
        {site.state === 'granted' ? <><p role="status">You have approved this reviewed configuration.</p>
          <ActionForm action="/connections/action" method="post" pendingLabel="Withdrawing approval…">
            <input type="hidden" name="applicationId" value={site.applicationId} />
            <button className="button button-secondary" type="submit" name="intent" value="withdraw">Withdraw approval</button>
          </ActionForm></> : <ActionForm className="context-form" action="/connections/action" method="post" pendingLabel="Saving approval…">
          <input type="hidden" name="applicationId" value={site.applicationId} />
          <input type="hidden" name="policyVersion" value={site.policyVersion} />
          <input type="hidden" name="fingerprint" value={site.fingerprint} />
          <label className="checkbox-label"><input type="checkbox" name="approval" value="openid" required /> I approve the identity request for this site.</label>
          <div className="context-actions"><button className="button button-primary" type="submit" name="intent" value="grant">Approve site</button>
            <Link className="button button-secondary" href="/connections">Cancel</Link></div>
        </ActionForm>}
      </SurfaceCard>}
  </AppShell>;
}
