import { AppShell } from '@/components/app-shell';
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
      title="Your profile"
      description="The account information AccessLobby can safely show you today."
      personStatus={identity.person.status}
    >
      <section className="profile-summary">
        <div className="identity-avatar identity-avatar-large" aria-hidden="true">AL</div>
        <div>
          <p className="eyebrow">Your AccessLobby account</p>
          <h2>One account that can work across supported apps</h2>
          <div className="profile-badges">
            <StatusBadge>{status}</StatusBadge>
            <StatusBadge tone="neutral">Account ID available</StatusBadge>
          </div>
        </div>
      </section>

      <section className="profile-grid">
        <SurfaceCard title="Account information" className="profile-primary-card">
          <dl className="data-list">
            <DataRow label="Account status"><StatusBadge>{status}</StatusBadge></DataRow>
            <DataRow label="Account type">Personal account</DataRow>
            <DataRow label="Managed by">AccessLobby</DataRow>
          </dl>
        </SurfaceCard>

        <SurfaceCard title="How your account stays the same">
          <div className="principle-stack">
            <div><span aria-hidden="true">01</span><p><strong>Your email can change</strong>You do not need a completely new AccessLobby account just because a contact detail changes.</p></div>
            <div><span aria-hidden="true">02</span><p><strong>The sign-in system can change</strong>Your AccessLobby account is kept separately from the technology that checks your password.</p></div>
            <div><span aria-hidden="true">03</span><p><strong>Apps keep their own records</strong>Each app can connect your AccessLobby account to its own local profile and permissions.</p></div>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Personal details">
          <AvailabilityPanel
            title="More profile details are not available yet"
            description="Name, date of birth, nationality, language and address are not part of the current AccessLobby account response. We will not guess or copy them from an unapproved source."
          />
        </SurfaceCard>

        <SurfaceCard title="Email and phone">
          <AvailabilityPanel
            title="Contact details are not shown here yet"
            description="An email address may be used during sign-in, but the current account service does not yet provide verified contact details to this page."
          />
        </SurfaceCard>

        <SurfaceCard title="Identity checks" className="profile-wide-card">
          <AvailabilityPanel
            title="No identity-check result is available yet"
            description="Document checks, business checks and trust information will appear only after an approved verification service is connected."
          />
        </SurfaceCard>

        <SurfaceCard title="Technical details" className="profile-wide-card">
          <details>
            <summary>Show your AccessLobby account ID</summary>
            <dl className="data-list">
              <DataRow label="AccessLobby account ID" mono>{identity.person.id}</DataRow>
              <DataRow label="Identity record status"><StatusBadge>{status}</StatusBadge></DataRow>
            </dl>
          </details>
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
