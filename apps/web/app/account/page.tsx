import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { CopyIdentifier } from '@/components/copy-identifier';
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
      description="See your identity status, stable AccessLobby ID, and sign-out choices."
      personStatus={identity.person.status}
      actions={<Link className="button button-secondary button-compact" href="/identity">View identity</Link>}
    >
      <section className="identity-hero">
        <div className="identity-avatar" aria-hidden="true">AL</div>
        <div className="identity-hero-copy">
          <div className="identity-title-line">
            <h2>You&apos;re signed in</h2>
            <StatusBadge>{status}</StatusBadge>
          </div>
          <p>Your AccessLobby identity is active and ready to use with supported apps.</p>
        </div>
        <div className="identity-live-state">
          <span className="live-dot" aria-hidden="true" />
          <div><strong>Account status checked</strong><small>Loaded securely from AccessLobby</small></div>
        </div>
        <CopyIdentifier
          label="AccessLobby ID"
          value={identity.person.id}
          description="This stable ID identifies you in AccessLobby and stays the same when your email address or sign-in method changes."
        />
      </section>

      <section className="metric-grid" aria-label="Current identity facts">
        <SurfaceCard eyebrow="Identity status" className="metric-card">
          <strong className="metric-value">{status}</strong>
          <p>Your AccessLobby identity can be used to sign in to supported apps.</p>
        </SurfaceCard>
        <SurfaceCard eyebrow="Your identity" className="metric-card">
          <strong className="metric-value">Stays the same</strong>
          <p>Changing contact details does not have to create a different AccessLobby identity.</p>
        </SurfaceCard>
        <SurfaceCard eyebrow="Inside each app" className="metric-card">
          <strong className="metric-value">The app decides</strong>
          <p>Each app may keep its own local account, information, roles and permissions.</p>
        </SurfaceCard>
      </section>

      <section className="dashboard-grid">
        <SurfaceCard title="Account at a glance" className="dashboard-span-two">
          <dl className="data-list">
            <DataRow label="AccessLobby ID" mono>{identity.person.id}</DataRow>
            <DataRow label="Identity status"><StatusBadge>{status}</StatusBadge></DataRow>
            <DataRow label="Identity type">Individual</DataRow>
            <DataRow label="Sign-in">Secure AccessLobby sign-in</DataRow>
            <DataRow label="Accounts inside apps">Created or connected separately by each app</DataRow>
            <DataRow label="Permissions inside apps">Managed by each app</DataRow>
          </dl>
        </SurfaceCard>

        <SurfaceCard title="Quick actions">
          <div className="action-list">
            <ArrowLink href="/identity">Review your identity profile</ArrowLink>
            <ArrowLink href="/contexts">Personal and organization contexts</ArrowLink>
            <ArrowLink href="/recovery">Review recovery status</ArrowLink>
            <ArrowLink href="#sign-out">Choose how to sign out</ArrowLink>
          </div>
        </SurfaceCard>

        <SurfaceCard title="What you can do now">
          <ul className="check-list">
            <li>Sign in securely with AccessLobby</li>
            <li>Return to the same AccessLobby identity</li>
            <li>View and copy your stable AccessLobby ID</li>
            <li>Choose whether to sign out of this app or the shared sign-in session</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard title="More identity controls are coming" className="dashboard-span-two">
          <AvailabilityPanel
            title="Profile details, recovery and session controls are still being added"
            description="We will show more identity information only after the matching data contracts, security rules and services are ready."
            action={<Link className="text-link" href="/identity">View your identity profile</Link>}
          />
        </SurfaceCard>

        <div id="sign-out" className="dashboard-span-two" tabIndex={-1}>
          <SurfaceCard title="How would you like to sign out?" className="decision-card">
            <p className="card-copy">
              Sign out of this app only, or also end the shared AccessLobby sign-in session used by supported apps. Some apps may keep a separate local session until they receive or process the shared sign-out.
            </p>
            <div className="decision-actions" role="group" aria-label="Sign-out choice">
              <form action="/auth/logout" method="post">
                <input type="hidden" name="scope" value="current" />
                <button className="button button-secondary" type="submit">Sign out of this app</button>
              </form>
              <form action="/auth/logout" method="post">
                <input type="hidden" name="scope" value="all" />
                <button className="button button-primary" type="submit">Sign out of AccessLobby and supported apps</button>
              </form>
            </div>
            <p className="hero-note">Signing out of this app keeps the shared AccessLobby session active, so returning may sign you in again without asking for your password.</p>
          </SurfaceCard>
        </div>
      </section>
    </AppShell>
  );
}
