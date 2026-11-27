import Link from 'next/link';
import { cache, Suspense } from 'react';
import { PublicShell } from '@/components/public-shell';
import { AvailabilityPanel } from '@/components/ui';
import { getCurrentIdentity } from '@/lib/current-identity';
import { isPublicRegistrationEnabled } from '@/lib/features';

export const metadata = { title: 'Your identity. Your apps. One sign-in.', description: 'Use AccessLobby to sign in to supported apps with one identity and fewer passwords to manage.' };
const landingIdentity = cache(getCurrentIdentity);
const errors: Record<string, { title: string; description: string }> = {
  shared_logout_unavailable: { title: 'You are signed out of this app', description: 'Shared sign-out could not finish. Your shared AccessLobby sign-in may still be active. Try again when the service is available.' },
  issuer_unavailable: { title: 'Sign-in is temporarily unavailable', description: 'Please try again in a moment.' },
  registration_unavailable: { title: 'Account creation is not open here yet', description: 'Existing invited users can still sign in.' },
  account_unavailable: { title: 'Your account could not be checked', description: 'Please try again later. Your account information has not been changed.' },
  account_restricted: { title: 'This account cannot continue', description: 'Contact your account administrator, or sign in as another person.' },
  login_failed: { title: 'Sign-in could not be completed', description: 'Start sign-in again to continue.' },
};

async function EntryActions({ compact = false }: { compact?: boolean }) {
  const identity = await landingIdentity();
  if (identity.state === 'ready') return <Link className="button button-primary" href="/account">Open your account <span aria-hidden="true">↗</span></Link>;
  return <><Link className={`button button-primary ${compact ? 'button-compact' : ''}`} href="/auth/login">Sign in <span aria-hidden="true">→</span></Link>
    {!compact && isPublicRegistrationEnabled() && <Link className="button button-secondary" href="/auth/login?intent=register">Create account</Link>}</>;
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const notice = error ? errors[error] : undefined;
  return <PublicShell action={<Suspense fallback={<Link className="button button-primary button-compact" href="/auth/login">Sign in</Link>}><EntryActions compact /></Suspense>}>
    {notice && <div className="public-alert" role="alert"><AvailabilityPanel {...notice} /></div>}
    <section className="public-hero">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Welcome to AccessLobby</p>
        <h1 aria-label="Your identity. Your apps. One sign-in.">Your identity.<br />Your apps.<br /><span>One sign-in.</span></h1>
        <p className="hero-lede">Sign in to supported apps with one lasting identity.</p>
        <div className="hero-actions"><Suspense fallback={<Link className="button button-primary" href="/auth/login">Sign in →</Link>}><EntryActions /></Suspense></div>
        <p className="hero-note">{isPublicRegistrationEnabled() ? 'New to AccessLobby? Create an account to get started.' : 'Access is currently by invitation.'}</p>
      </div>
      <div className="product-illustration" role="img" aria-label="Illustration: one AccessLobby identity connects to supported apps, each with its own account and permissions.">
        <div className="illustration-caption">ONE IDENTITY <span>Illustration</span></div>
        <div className="illustration-identity"><span className="illustration-avatar">A</span><div><strong>Your AccessLobby identity</strong><small>Across supported apps</small></div><span className="illustration-check" aria-hidden="true">↗</span></div>
        <div className="illustration-connector" aria-hidden="true" />
        <div className="illustration-apps">{['Your workspace', 'Your files', 'Your services'].map((name, index) => <div key={name}><span className={`illustration-app-icon illustration-icon-${index}`}>{['◈', '▤', '▦'][index]}</span><strong>{name}</strong><small>Supported apps</small></div>)}</div>
        <p>Shared sign-in. Each app keeps its own permissions.</p>
      </div>
    </section>
    <section className="benefit-grid" aria-label="Why AccessLobby">
      <article><span className="benefit-icon" aria-hidden="true">↗</span><h2>Easier access</h2><p>Use the same sign-in across supported apps.</p></article>
      <article><span className="benefit-icon" aria-hidden="true">◈</span><h2>An identity that lasts</h2><p>Keep your ID when your email changes.</p></article>
      <article><span className="benefit-icon" aria-hidden="true">✓</span><h2>Clear account choices</h2><p>Choose personal or organization use and how to sign out.</p></article>
    </section>
    <section className="how-section" id="how-it-works" aria-labelledby="how-title">
      <div><p className="eyebrow">How it works</p><h2 id="how-title">Sign in.<br />Get to your app.</h2></div>
      <ol className="how-steps"><li><span>01</span><div><h3>Open your app</h3><p>Choose AccessLobby sign-in.</p></div></li><li><span>02</span><div><h3>Sign in</h3><p>Use your AccessLobby account.</p></div></li><li><span>03</span><div><h3>Continue</h3><p>Return to your app and its account.</p></div></li></ol>
    </section>
    <section className="audience-strip" aria-label="Choose your next step"><div><h2>Need help?</h2><p>Find sign-in and account answers.</p><Link className="text-link" href="/help">Get help →</Link></div><div><h2>Connecting an app?</h2><p>Register it, verify its domain and request review.</p><Link className="text-link" href="/apps/manage">Open developer tools →</Link></div></section>
    <section className="faq-section" aria-labelledby="faq-title"><div><p className="eyebrow">Good to know</p><h2 id="faq-title">A few clear answers.</h2><Link className="text-link" href="/help">More help →</Link></div><div className="faq-list">
      <details><summary>Which apps can I use?</summary><p>Your signed-in Apps page shows active registered apps available to you. An app still checks its own permissions.</p></details>
      <details><summary>Can I connect an existing app account?</summary><p>Where the app supports linking, you must prove control of both accounts. Matching email addresses alone never joins accounts.</p></details>
      <details><summary>What happens when I sign out?</summary><p>Choose this app only or AccessLobby and supported apps in this browser. Independent app sessions may take time to end.</p></details>
    </div></section>
  </PublicShell>;
}
