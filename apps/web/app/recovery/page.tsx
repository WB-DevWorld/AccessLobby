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
    title: 'Verified recovery email or phone',
    description: 'A confirmed contact method that can help you regain access safely.',
  },
  {
    title: 'Backup recovery codes',
    description: 'One-time codes you can store somewhere safe and use if your normal sign-in method is unavailable.',
  },
  {
    title: 'Trusted contacts',
    description: 'People you choose who may help confirm a recovery request without receiving access to your account.',
  },
  {
    title: 'Trusted device or passkey',
    description: 'A previously approved device or passkey that may help you recover access securely.',
  },
];

export default async function RecoveryPage() {
  const identity = await getCurrentIdentity();

  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;

  return (
    <AppShell
      active="recovery"
      title="Account recovery"
      description="Recovery options are not active yet. This page shows what is planned and what you can do now."
      personStatus={identity.person.status}
    >
      <section className="recovery-hero">
        <div className="recovery-shield" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />
            <path d="M12 8v5" />
            <path d="M12 16h.01" />
          </svg>
        </div>
        <div>
          <p className="eyebrow">Not active yet</p>
          <h2>{productFeatures.recovery.title}</h2>
          <p>{productFeatures.recovery.description}</p>
          <div className="profile-badges">
            <StatusBadge tone="warning">Planned</StatusBadge>
            <StatusBadge tone="neutral">No recovery data collected</StatusBadge>
          </div>
        </div>
      </section>

      <section className="recovery-grid">
        <SurfaceCard title="Available now">
          <ul className="check-list">
            <li>Sign in securely with AccessLobby</li>
            <li>Sign out and sign in again safely</li>
            <li>Return to the same AccessLobby account</li>
            <li>Ask an administrator for pilot-account help</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard title="Why we are waiting">
          <p className="card-copy">
            Recovery can give someone control of an account. We will activate it only after the checks, audit trail and emergency rules have been tested.
          </p>
          <Link className="text-link" href="/identity">Review your profile</Link>
        </SurfaceCard>

        <SurfaceCard title="Planned recovery options" className="recovery-wide-card">
          <div className="planned-methods">
            {plannedMethods.map((method, index) => (
              <article key={method.title}>
                <span>0{index + 1}</span>
                <div><h3>{method.title}</h3><p>{method.description}</p></div>
              </article>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard title="Trusted contacts will have limited authority" className="recovery-wide-card">
          <AvailabilityPanel
            title="A trusted contact will not become an account administrator"
            description="A future trusted contact may help confirm a recovery request, but will not automatically gain access to your apps, files, orders or other information."
          />
        </SurfaceCard>
      </section>
    </AppShell>
  );
}
