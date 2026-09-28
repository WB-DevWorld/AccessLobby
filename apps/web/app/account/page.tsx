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
      title="Personal Account Overview"
      description="Your live AccessLobby identity and the controls currently available to this account."
      personStatus={identity.person.status}
      actions={<Link className="button button-secondary button-compact" href="/identity">View identity</Link>}
    >
      <section className="identity-hero">
        <div className="identity-avatar" aria-hidden="true">AL</div>
        <div className="identity-hero-copy">
          <div className="identity-title-line">
            <h2>AccessLobby identity resolved</h2>
            <StatusBadge>{status}</StatusBadge>
          </div>
          <p>Your durable person identity is active and available to compatible applications through the approved integration contract.</p>
          <div className="person-id-block">
            <span>Person ID</span>
            <code>{identity.person.id}</code>
          </div>
        </div>
        <div className="identity-live-state">
          <span className="live-dot" aria-hidden="true" />
          <div><strong>Live account data</strong><small>Resolved from the AccessLobby API</small></div>
        </div>
      </section>

      <section className="metric-grid" aria-label="Current account facts">
        <SurfaceCard eyebrow="Identity status" className="metric-card">
          <strong className="metric-value">{status}</strong>
          <p>The current person lifecycle state returned by AccessLobby.</p>
        </SurfaceCard>
        <SurfaceCard eyebrow="Identity continuity" className="metric-card">
          <strong className="metric-value">Stable person</strong>
          <p>The person ID is separate from mutable email, phone and IAM internals.</p>
        </SurfaceCard>
        <SurfaceCard eyebrow="App authorization" className="metric-card">
          <strong className="metric-value">Kept local</strong>
          <p>Connected apps remain responsible for their own resources and permissions.</p>
        </SurfaceCard>
      </section>

      <section className="dashboard-grid">
        <SurfaceCard title="Account at a glance" className="dashboard-span-two">
          <dl className="data-list">
            <DataRow label="AccessLobby person ID" mono>{identity.person.id}</DataRow>
            <DataRow label="Lifecycle status"><StatusBadge>{status}</StatusBadge></DataRow>
            <DataRow label="Authentication">OpenID Connect sign-in</DataRow>
            <DataRow label="Domain permissions">Managed by each connected application</DataRow>
          </dl>
        </SurfaceCard>

        <SurfaceCard title="Quick actions">
          <div className="action-list">
            <ArrowLink href="/identity">Review identity profile</ArrowLink>
            <ArrowLink href="/recovery">See recovery roadmap</ArrowLink>
            <ArrowLink href="#sign-out">Choose sign-out scope</ArrowLink>
          </div>
        </SurfaceCard>

        <SurfaceCard title="What works today">
          <ul className="check-list">
            <li>Secure sign-in through the AccessLobby issuer</li>
            <li>Durable person resolution through `/v1/me`</li>
            <li>Repeat sign-in with the same person identity</li>
            <li>Standards-based onboarding for compatible applications</li>
          </ul>
        </SurfaceCard>

        <SurfaceCard title="Capabilities being added" className="dashboard-span-two">
          <AvailabilityPanel
            title="Identity details, recovery and session controls are still expanding"
            description="The current API intentionally exposes a small set of authoritative identity facts. Additional account data will appear here only after its contracts and security rules are implemented."
            action={<Link className="text-link" href="/identity">Open the truthful profile view</Link>}
          />
        </SurfaceCard>

        <div id="sign-out" className="dashboard-span-two" tabIndex={-1}>
          <SurfaceCard title="Where would you like to sign out?" className="decision-card">
            <p className="card-copy">
              Choose whether to end only this AccessLobby web session or also end the shared browser SSO session used by participating connected apps. Signing out of this app only may allow a quick sign-in again while the shared AccessLobby session remains active.
            </p>
            <div className="decision-actions" role="group" aria-label="Sign-out scope">
              <form action="/auth/logout" method="post">
                <input type="hidden" name="scope" value="current" />
                <button className="button button-secondary" type="submit">Sign out of this app only</button>
              </form>
              <form action="/auth/logout" method="post">
                <input type="hidden" name="scope" value="all" />
                <button className="button button-primary" type="submit">Sign out of all connected apps</button>
              </form>
            </div>
          </SurfaceCard>
        </div>
      </section>
    </AppShell>
  );
}
