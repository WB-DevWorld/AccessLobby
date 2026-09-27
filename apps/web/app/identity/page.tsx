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
      title="Identity Profile"
      description="The authoritative identity facts AccessLobby can safely resolve for this account today."
      personStatus={identity.person.status}
    >
      <section className="profile-summary">
        <div className="identity-avatar identity-avatar-large" aria-hidden="true">AL</div>
        <div>
          <p className="eyebrow">AccessLobby person</p>
          <h2>Provider-independent identity</h2>
          <div className="profile-badges">
            <StatusBadge>{status}</StatusBadge>
            <StatusBadge tone="neutral">Durable ID</StatusBadge>
          </div>
        </div>
        <div className="profile-id">
          <span>Person ID</span>
          <code>{identity.person.id}</code>
        </div>
      </section>

      <section className="profile-grid">
        <SurfaceCard title="Core identity" className="profile-primary-card">
          <dl className="data-list">
            <DataRow label="AccessLobby person ID" mono>{identity.person.id}</DataRow>
            <DataRow label="Lifecycle status"><StatusBadge>{status}</StatusBadge></DataRow>
            <DataRow label="Identity type">Human person</DataRow>
            <DataRow label="Canonical owner">AccessLobby</DataRow>
          </dl>
        </SurfaceCard>

        <SurfaceCard title="Why this identity is durable">
          <div className="principle-stack">
            <div><span aria-hidden="true">01</span><p><strong>Not an email address</strong>Contact details may change without creating a different person.</p></div>
            <div><span aria-hidden="true">02</span><p><strong>Not a Keycloak private ID</strong>The IAM engine can be replaced without replacing the canonical person.</p></div>
            <div><span aria-hidden="true">03</span><p><strong>Not an app-local user ID</strong>Each application can maintain its own linked domain record.</p></div>
          </div>
        </SurfaceCard>

        <SurfaceCard title="Personal information">
          <AvailabilityPanel
            title="Profile attributes are not available yet"
            description="The current identity API does not expose legal name, date of birth, nationality, language or address. AccessLobby will not guess or copy those values from unapproved sources."
          />
        </SurfaceCard>

        <SurfaceCard title="Contact methods">
          <AvailabilityPanel
            title="Contact data is not exposed yet"
            description="Email and phone may be used by the authentication engine, but they are not the canonical person identity and are not part of the current product API response."
          />
        </SurfaceCard>

        <SurfaceCard title="Verification and identity claims" className="profile-wide-card">
          <AvailabilityPanel
            title="No verification assertion is available to this UI"
            description="Government documents, KYC/KYB results, assurance levels and trust claims will appear only when an authoritative verification provider and versioned assertion contract are approved."
          />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
