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
  return <AppShell active="identity" title="Your identity" description="One lasting AccessLobby identity, wherever you use it." personStatus={identity.person.status}>
    <section className="identity-hero compact-identity"><div className="identity-avatar" aria-hidden="true">AL</div><div className="identity-hero-copy"><h2>Your personal identity</h2><StatusBadge>{formatIdentityStatus(identity.person.status)}</StatusBadge></div><CopyIdentifier label="AccessLobby ID" value={identity.person.id} description="Separate from your email, sign-in provider and each app’s local account ID." /></section>
    <section className="context-grid">
      <SurfaceCard title="Identity details"><dl className="data-list"><DataRow label="Identity type">Individual</DataRow><DataRow label="Identity owner">AccessLobby</DataRow></dl><p className="hero-note">Your ID stays independent of changes to your contact details or the sign-in system.</p></SurfaceCard>
      <SurfaceCard title="Apps keep their own accounts"><p>Apps link this identity to their own profiles, information and permissions. Your AccessLobby ID does not replace an app’s local account ID.</p></SurfaceCard>
    </section>
    <details className="information-details"><summary>About profile and verification information</summary><p>Name, contact details and identity-check results are not available in the current identity response. This page shows only confirmed AccessLobby information. Further controls will appear when their services are ready.</p></details>
  </AppShell>;
}
