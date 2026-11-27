import { AppShell } from '@/components/app-shell';
import { CopyIdentifier } from '@/components/copy-identifier';
import { AccountAccessState, DataRow, StatusBadge, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity } from '@/lib/current-identity';
import { formatIdentityStatus } from '@/lib/current-identity-model';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your identity', robots: { index: false, follow: false } };
export default async function IdentityProfile() {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  return <AppShell active="identity" title="Your identity" description="Your AccessLobby ID and status." personStatus={identity.person.status}>
    <section className="identity-hero compact-identity"><div className="identity-avatar" aria-hidden="true">AL</div><div className="identity-hero-copy"><h2>Your personal identity</h2><StatusBadge>{formatIdentityStatus(identity.person.status)}</StatusBadge></div><CopyIdentifier label="AccessLobby ID" value={identity.person.id} description="Your lasting ID, separate from app account IDs." /></section>
    <section className="context-grid">
      <SurfaceCard title="Identity details"><dl className="data-list"><DataRow label="Identity type">Individual</DataRow><DataRow label="Identity owner">AccessLobby</DataRow></dl></SurfaceCard>
    </section>
    <details className="information-details"><summary>About your ID and profile</summary><p>Your ID stays the same when contact details or sign-in methods change. Apps keep their own accounts and permissions.</p><p>Profile editing and identity-check results are unavailable here.</p></details>
  </AppShell>;
}
