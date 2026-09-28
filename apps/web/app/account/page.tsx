import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import {
  AccountAccessState,
  ArrowLink,
  AvailabilityPanel,
  DataRow,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui';
import { getCurrentIdentity } from '@/lib/current-identity';
import { formatIdentityStatus } from '@/lib/current-identity-model';

export const dynamic = 'force-dynamic';

export default async function Account() {
  const identity = await getCurrentIdentity();

  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;

  const status = formatIdentityStatus(identity.person.status);

  return (
    <AppShell
      active="overview"
      title="Your AccessLobby account"
      description="See your account status, review your profile, and choose how you want to sign out."
      personStatus={identity.person.status}
      actions={<Link className="button button-secondary button-compact" href="/identity">View profile</Link>}
    >
      <section className="identity-hero">
        <div className="identity-avatar" aria-hidden="true">AL</div>
        <div className="identity-hero-copy">
          <div className="identity-title-line">
            <h2>You&apos;re signed in</h2>
            <StatusBadge>{status}</StatusBadge>
          </div>
          <p>Your AccessLobby account is active and ready to use with supported apps.</p>
        </div>
        <div className="identity-live-state">
          <span className="live-dot" aria-hidden="true" />
          <div><strong>Account information is up to date</strong><small>Loaded securely from AccessLobby</small></div>
        </div>
      </section>

      <section className="metric-grid" aria-label="Current account facts">
        <SurfaceCard eyebrow="Account status" className="metric-card">
          <strong className="metric-value">{status}</strong>
          <p>Your account can be used to sign in to supported apps.</p>
        </SurfaceCard>
        <SurfaceCard eyebrow="Your account" className="metric-card">
          <strong className="metric-value">Stays the same</strong>
          <p>Changing contact details does not have to create a different AccessLobby account.</p>
        </SurfaceCard>
        <SurfaceCard eyebrow="Inside each app" className="metric-card">
          <strong className="metric-value">The app decides</strong>
          <p>Each app controls its own information, roles and permissions.</p>
        </SurfaceCard>
      </section>

      <section className="dashboard-grid">
        <SurfaceCard title="Account at a glance" className="dashboard-span-two">
          <dl className="data-list">
            <DataRow label="Account status"><StatusBadge>{status}</StatusBadge></DataRow>
            <DataRow label="Account type">Personal AccessLobby account</DataRow>
            <DataRow label="Sign-in">Secure AccessLobby sign-in</DataRow>
            <DataRow label="Permissions inside apps">Managed by each app</DataRow>
          </dl>
        </SurfaceCard>

        <SurfaceCard title="Quick actions">
          <div className="action-list">
            <ArrowLink href="/identity">Review your profile</ArrowLink>
            <ArrowLink href="/recovery">See recovery plans</ArrowLink>
            <ArrowLink href="#sign-out">Choose how to sign out</ArrowLink>
          </div>
        </SurfaceCard>

        <SurfaceCard title="What you can do now">
          <ul className="check-list">
            <li>Sign in securely with AccessLobby</li>
            <li>Use the same account again when you return</li>
            <li>Review the account information currently available</li>
            <li>Choose whether to sign out here or from the shared sign-in session</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard title="More account controls are coming" className="dashboard-span-two">
          <AvailabilityPanel
            title="Profile details, recovery and session controls are still being added"
            description="We will show more account information only after the matching security rules and services are ready."
            action={<Link className="text-link" href="/identity">View the information available now</Link>}
          />
        </SurfaceCard>

        <SurfaceCard title="Technical account details" className="dashboard-span-two">
          <details>
            <summary>Show technical details</summary>
            <dl className="data-list">
              <DataRow label="AccessLobby account ID" mono>{identity.person.id}</DataRow>
              <DataRow label="Identity record status"><StatusBadge>{status}</StatusBadge></DataRow>
            </dl>
          </details>
        </SurfaceCard>

        <div id="sign-out" className="dashboard-span-two" tabIndex={-1}>
          <SurfaceCard title="How would you like to sign out?" className="decision-card">
            <p className="card-copy">
              Sign out only from AccessLobby on this device, or also end the shared AccessLobby sign-in session used by supported apps. Other apps may still keep their own local sessions until they also process the sign-out.
            </p>
            <div className="decision-actions" role="group" aria-label="Sign-out choice">
              <form action="/auth/logout" method="post">
                <input type="hidden" name="scope" value="current" />
                <button className="button button-secondary" type="submit">Sign out of AccessLobby only</button>
              </form>
              <form action="/auth/logout" method="post">
                <input type="hidden" name="scope" value="all" />
                <button className="button button-primary" type="submit">End the shared sign-in session</button>
              </form>
            </div>
          </SurfaceCard>
        </div>
      </section>
    </AppShell>
  );
}
