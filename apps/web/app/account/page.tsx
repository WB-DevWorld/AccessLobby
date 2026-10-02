import Link from 'next/link';
import { Suspense } from 'react';
import { AppShell } from '@/components/app-shell';
import { CopyIdentifier } from '@/components/copy-identifier';
import { AccountAccessState, ArrowLink, AvailabilityPanel, StatusBadge, SurfaceCard } from '@/components/ui';
import { SectionSkeleton } from '@/components/skeleton';
import { RetryButton } from '@/components/retry-button';
import { AvailableApps } from '@/components/available-apps';
import { getCurrentIdentity } from '@/lib/current-identity';
import { formatIdentityStatus } from '@/lib/current-identity-model';
import { getContexts, selectedContext } from '@/lib/contexts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your account', robots: { index: false, follow: false } };

async function WorkingContext({ personId }: { personId: string }) {
  const data = await getContexts(personId);
  if (!data) return <SurfaceCard title="Personal & organizations"><AvailabilityPanel title="Memberships could not be checked" description="Try again before acting for an organization." action={<RetryButton />} /></SurfaceCard>;
  const selected = await selectedContext(personId, data.contexts);
  const organizations = data.contexts.filter(context => context.type === 'organization');
  const current = organizations.find(org => org.id === selected);
  return <SurfaceCard title="Personal & organizations">
    <p className="selected-context"><span className="context-emblem" aria-hidden="true">◈</span><span><strong>{current?.name ?? 'Personal use'}</strong><small>{current ? `${current.role} · Selected for this account view` : 'Acting for yourself'}</small></span></p>
    {data.invitations.length > 0 && <div className="invitation-notice"><strong>{data.invitations.length} invitation{data.invitations.length === 1 ? '' : 's'} waiting</strong><Link href="/contexts">Review invitations →</Link></div>}
    <p>{organizations.length} organization{organizations.length === 1 ? '' : 's'} linked to your identity.</p>
    <ArrowLink href="/contexts">Switch or manage organizations</ArrowLink>
    <p className="hero-note">Organization membership does not grant app entry or app-specific permissions.</p>
  </SurfaceCard>;
}

export default async function Account() {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  return <AppShell active="overview" title="Your account" description="Your identity and next steps, in one place." personStatus={identity.person.status}>
    <section className="identity-hero compact-identity">
      <div className="identity-avatar" aria-hidden="true">AL</div>
      <div className="identity-hero-copy"><p className="eyebrow">Your personal identity</p><h2>You&apos;re signed in</h2><StatusBadge>{formatIdentityStatus(identity.person.status)}</StatusBadge></div>
      <CopyIdentifier label="AccessLobby ID" value={identity.person.id} description="Your lasting identity across supported apps." />
    </section>
    <section className="dashboard-grid account-overview">
      <Suspense fallback={<SectionSkeleton label="Loading organizations and invitations" rows={2} />}><WorkingContext personId={identity.person.id} /></Suspense>
      <Suspense fallback={<SectionSkeleton label="Loading available apps" />}><AvailableApps compact /></Suspense>
      <SurfaceCard title="Useful next steps"><div className="action-list"><ArrowLink href="/identity">View identity</ArrowLink><ArrowLink href="/recovery">Recovery & help</ArrowLink><ArrowLink href="/help">Get help</ArrowLink></div></SurfaceCard>
      <SurfaceCard title="One identity, separate app accounts"><p>Each app may keep its own local account, information, roles and permissions linked to your AccessLobby identity.</p><Link className="text-link" href="/help">How it works →</Link></SurfaceCard>
    </section>
    <div id="sign-out" className="account-sign-out"><span>Finished here?</span><Link className="text-link" href="/sign-out">Choose how to sign out →</Link></div>
  </AppShell>;
}
