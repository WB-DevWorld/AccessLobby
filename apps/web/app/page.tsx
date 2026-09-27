import Link from 'next/link';
import { AvailabilityPanel, BrandMark } from '@/components/ui';

const foundations = [
  {
    title: 'Durable identity',
    description: 'A stable AccessLobby person identity remains separate from changing contact details and IAM internals.',
  },
  {
    title: 'Standards-based sign-in',
    description: 'Compatible applications connect through OpenID Connect instead of sharing passwords or private databases.',
  },
  {
    title: 'Local app permissions',
    description: 'AccessLobby establishes who signed in. Each connected application still decides what that person may do.',
  },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <div className="public-page">
      <header className="public-header">
        <BrandMark />
        <Link className="text-link" href="/account">Account status</Link>
      </header>

      <main className="public-main" id="main-content">
        {error === 'shared_logout_unavailable' && (
          <AvailabilityPanel
            title="Shared sign-out could not be completed"
            description="This app signed out safely, but AccessLobby could not complete sign-out from connected apps. Try the shared sign-out again when the identity service is available."
          />
        )}

        <section className="public-hero">
          <div className="hero-copy">
            <p className="eyebrow">Common identity for connected applications</p>
            <h1>Your identity.<br />Your access.<br /><span>In your control.</span></h1>
            <p className="hero-lede">
              AccessLobby gives compatible applications one secure sign-in foundation while keeping each product independently responsible for its own data and permissions.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/auth/login">Sign in with AccessLobby</Link>
              <Link className="button button-secondary" href="/auth/login?intent=register">Create an account</Link>
            </div>
            <p className="hero-note">Account creation is available. Email verification and recovery depend on the services configured for this environment.</p>
          </div>

          <div className="hero-visual" aria-label="AccessLobby identity foundation">
            <div className="identity-orbit identity-orbit-one" />
            <div className="identity-orbit identity-orbit-two" />
            <div className="identity-core">
              <span className="identity-core-mark" aria-hidden="true">A</span>
              <strong>One identity</strong>
              <small>Standards-based SSO</small>
            </div>
            <div className="orbit-label orbit-label-one">Compatible apps</div>
            <div className="orbit-label orbit-label-two">Stable person ID</div>
            <div className="orbit-label orbit-label-three">Local permissions</div>
          </div>
        </section>

        <section className="foundation-grid" aria-labelledby="foundation-title">
          <div className="section-intro">
            <p className="eyebrow">Built as identity infrastructure</p>
            <h2 id="foundation-title">A small foundation designed to grow safely</h2>
          </div>
          {foundations.map((foundation, index) => (
            <article className="foundation-card" key={foundation.title}>
              <span className="foundation-number">0{index + 1}</span>
              <h3>{foundation.title}</h3>
              <p>{foundation.description}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="public-footer">
        <span>AccessLobby identity foundation</span>
        <span>Secure by design · truthful by default</span>
      </footer>
    </div>
  );
}
