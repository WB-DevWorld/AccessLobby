import { AppShell } from '@/components/app-shell';
import { CopyIdentifier } from '@/components/copy-identifier';
import {
  AccountAccessState,
  AvailabilityPanel,
  DataRow,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui';
import { getCurrentIdentity } from '@/lib/current-identity';
import { formatIdentityStatus } from '@/lib/current-identity-model';

export const dynamic = 'force-dynamic';

export default async function IdentityProfile() {
  const identity = await getCurrentIdentity();

  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;

  const status = formatIdentityStatus(identity.person.status);

  return (
    <AppShell
      active="identity"
      title="Your identity profile"
      description="See the stable identity information AccessLobby can safely show you today."
      personStatus={identity.person.status}
    >
      <section className="profile-summary">
        <div className="identity-avatar identity-avatar-large" aria-hidden="true">AL</div>
        <div>
          <p className="eyebrow">AccessLobby Identity</p>
          <h2>One stable identity for supported apps</h2>
          <div className="profile-badges">
            <StatusBadge>{status}</StatusBadge>
            <StatusBadge tone="neutral">Stable ID</StatusBadge>
          </div>
        </div>
        <CopyIdentifier
          label="AccessLobby ID"
          value={identity.person.id}
          description="This stable ID identifies you in AccessLobby. It is separate from your email address, sign-in provider and each app's local account ID."
        />
      </section>

      <section className="profile-grid">
        <SurfaceCard title="Identity information" className="profile-primary-card">
          <dl className="data-list">
            <DataRow label="AccessLobby ID" mono>{identity.person.id}</DataRow>
            <DataRow label="Identity status"><StatusBadge>{status}</StatusBadge></DataRow>
            <DataRow label="Identity type">Individual</DataRow>
            <DataRow label="Identity owner">AccessLobby</DataRow>
          </dl>
        </SurfaceCard>

        <SurfaceCard title="How your identity stays the same">
          <div className="principle-stack">
            <div><span aria-hidden="true">01</span><p><strong>Your email can change</strong>You do not need a new AccessLobby identity just because a contact detail changes.</p></div>
            <div><span aria-hidden="true">02</span><p><strong>The sign-in system can change</strong>Your AccessLobby identity is kept separately from the technology that checks your password.</p></div>
            <div><span aria-hidden="true">03</span><p><strong>Apps keep their own accounts</strong>Each app can connect your AccessLobby ID to its own local account, profile and permissions.</p></div>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Personal details">
          <AvailabilityPanel
            title="More profile details are not available yet"
            description="Name, date of birth, nationality, language and address are not part of the current AccessLobby identity response. We will not guess or copy them from an unapproved source."
          />
        </SurfaceCard>

        <SurfaceCard title="Email and phone">
          <AvailabilityPanel
            title="Verified contact details are not shown here yet"
            description="An email address may be used during sign-in, but the current identity service does not yet provide verified contact details to this page."
          />
        </SurfaceCard>

        <SurfaceCard title="Identity checks" className="profile-wide-card">
          <AvailabilityPanel
            title="No approved identity-check result is available yet"
            description="AccessLobby may display verified information received from an approved verification service. It will not create, calculate or guess verification and trust results."
          />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
