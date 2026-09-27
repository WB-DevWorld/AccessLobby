import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import {
  AccountAccessState,
  AvailabilityPanel,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui';
import { getCurrentIdentity } from '@/lib/current-identity';
import { productFeatures } from '@/lib/features';

export const dynamic = 'force-dynamic';

const plannedMethods = [
  {
    title: 'Verified recovery contact',
    description: 'A carefully verified email or phone recovery method with lifecycle and change protection.',
  },
  {
    title: 'Backup recovery codes',
    description: 'One-time codes generated, stored and rotated through an approved secure workflow.',
  },
  {
    title: 'Trusted contacts',
    description: 'Explicitly invited people with limited, auditable recovery authority—not account access.',
  },
  {
    title: 'Trusted device or passkey recovery',
    description: 'Recovery using an approved authenticator without turning a device into the canonical identity.',
  },
];

export default async function RecoveryPage() {
  const identity = await getCurrentIdentity();

  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;

  return (
    <AppShell
      active="recovery"
      title="Recovery & Trusted Contacts"
      description="A truthful preview of the recovery controls planned for AccessLobby."
      personStatus={identity.person.status}
    >
      <section className="recovery-hero">
        <div className="recovery-shield" aria-hidden="true">+</div>
        <div>
          <p className="eyebrow">Feature state</p>
          <h2>{productFeatures.recovery.title}</h2>
          <p>{productFeatures.recovery.description}</p>
          <div className="profile-badges">
            <StatusBadge tone="warning">Planned</StatusBadge>
            <StatusBadge tone="neutral">No data collected</StatusBadge>
          </div>
        </div>
      </section>

      <section className="recovery-grid">
        <SurfaceCard title="Available now">
          <ul className="check-list">
            <li>Standards-based AccessLobby sign-in</li>
            <li>Safe sign-out and re-entry</li>
            <li>Durable person identity resolution</li>
            <li>Controlled pilot account administration</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard title="Why recovery is gated">
          <p className="card-copy">
            Recovery changes who can regain control of an identity. The UI will not collect contacts, generate codes or imply authority before the backend security model, audit rules and revocation behavior are approved.
          </p>
          <Link className="text-link" href="/identity">Review your current identity facts</Link>
        </SurfaceCard>

        <SurfaceCard title="Planned recovery methods" className="recovery-wide-card">
          <div className="planned-methods">
            {plannedMethods.map((method, index) => (
              <article key={method.title}>
                <span>0{index + 1}</span>
                <div><h3>{method.title}</h3><p>{method.description}</p></div>
              </article>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard title="Trusted contacts are not app administrators" className="recovery-wide-card">
          <AvailabilityPanel
            title="Recovery authority will be narrow and auditable"
            description="A future trusted contact may help confirm recovery under an approved process. That role must not grant access to connected apps, files, orders, knowledge or other domain resources."
          />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
