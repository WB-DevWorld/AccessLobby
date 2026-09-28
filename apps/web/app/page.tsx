import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { AvailabilityPanel, BrandMark, SkipLink } from '@/components/ui';
import { isPublicRegistrationEnabled } from '@/lib/features';

const foundations = [
  {
    title: 'One account for supported apps',
    description: 'Use the same AccessLobby account to sign in wherever AccessLobby is supported.',
  },
  {
    title: 'Your account stays with you',
    description: 'Changing an email address or sign-in method does not have to create a completely new account.',
  },
  {
    title: 'Each app keeps control',
    description: 'AccessLobby signs you in. Each app still decides what you can see and do inside that app.',
  },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const registrationEnabled = isPublicRegistrationEnabled();

  return (
    <div className="public-page">
      <SkipLink />
      <header className="public-header">
        <BrandMark />
        <div className="public-header-actions">
          <ThemeToggle />
          <Link className="text-link" href="/account">My account</Link>
        </div>
      </header>

      <main className="public-main" id="main-content">
        {error === 'shared_logout_unavailable' && (
          <div className="public-alert">
            <AvailabilityPanel
              title="You are signed out of this app"
              description="We could not also sign you out of the shared AccessLobby session. You can try signing out of all apps again later."
            />
          </div>
        )}
        {error === 'issuer_unavailable' && (
          <div className="public-alert">
            <AvailabilityPanel
              title="Sign-in is temporarily unavailable"
              description="AccessLobby could not reach the sign-in service. Please try again in a moment."
            />
          </div>
        )}
        {error === 'registration_unavailable' && (
          <div className="public-alert">
            <AvailabilityPanel
              title="New account registration is not open here yet"
              description="Existing invited users can still sign in. Registration will appear only after it is enabled and tested for this environment."
            />
          </div>
        )}

        <section className="public-hero">
          <div className="hero-copy">
            <p className="eyebrow">One account for supported apps</p>
            <h1>One secure sign-in.<br />Your account across apps.<br /><span>You stay in control.</span></h1>
            <p className="hero-lede">
              Use AccessLobby to sign in to supported apps without creating a different password for every app. Each app still controls its own information and permissions.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/auth/login">Sign in</Link>
              {registrationEnabled && (
                <Link className="button button-secondary" href="/auth/login?intent=register">Create an account</Link>
              )}
            </div>
            <p className="hero-note">
              {registrationEnabled
                ? 'New account registration is open in this environment.'
                : 'Access is currently limited to users whose accounts have already been created.'}
            </p>
          </div>

          <div className="hero-visual" role="img" aria-label="One AccessLobby account can be used with supported apps while each app keeps its own permissions.">
            <div className="identity-orbit identity-orbit-one" />
            <div className="identity-orbit identity-orbit-two" />
            <div className="identity-core">
              <span className="identity-core-mark" aria-hidden="true">A</span>
              <strong>One account</strong>
              <small>Secure sign-in</small>
            </div>
            <div className="orbit-label orbit-label-one">Supported apps</div>
            <div className="orbit-label orbit-label-two">Same account</div>
            <div className="orbit-label orbit-label-three">App permissions</div>
          </div>
        </section>

        <section className="foundation-grid" aria-labelledby="foundation-title">
          <div className="section-intro">
            <p className="eyebrow">Simple for you, secure underneath</p>
            <h2 id="foundation-title">A sign-in foundation that can grow with you</h2>
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
        <span>AccessLobby</span>
        <span>Secure sign-in · clear choices</span>
      </footer>
    </div>
  );
}
