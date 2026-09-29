import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import type { CurrentIdentityResult } from '@/lib/current-identity-model';

export function SkipLink() {
  return <a className="skip-link" href="#main-content">Skip to main content</a>;
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="AccessLobby">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" role="img">
          <path d="M16 2 25 7.2v10.4L16 30 7 24.8V14.4L16 2Z" fill="currentColor" opacity=".18" />
          <path d="m16 5.5 5.8 3.3-5.8 3.4-5.8-3.4L16 5.5Zm-7 5.7 5.7 3.3v6.7L9 17.9v-6.7Zm14 0v6.7l-5.7 3.3v-6.7L23 11.2Zm-12.3 9.3 4 2.3v4.6l-4-2.3v-4.6Zm10.6 0v4.6l-4 2.3v-4.6l4-2.3Z" fill="currentColor" />
        </svg>
      </span>
      {compact ? <span className="sr-only">AccessLobby</span> : <span>AccessLobby</span>}
    </span>
  );
}

export function StatusBadge({ children, tone = 'success' }: { children: ReactNode; tone?: 'success' | 'neutral' | 'warning' }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function SurfaceCard({
  title,
  eyebrow,
  children,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card ${className}`.trim()}>
      {(title || eyebrow) && (
        <header className="card-heading">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {title && <h2>{title}</h2>}
        </header>
      )}
      {children}
    </section>
  );
}

export function DataRow({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="data-row">
      <dt>{label}</dt>
      <dd className={mono ? 'data-mono' : undefined}>{children}</dd>
    </div>
  );
}

export function AvailabilityPanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="availability-panel">
      <span className="availability-icon" aria-hidden="true">i</span>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {action && <div className="availability-action">{action}</div>}
      </div>
    </div>
  );
}

export function AccountAccessState({ result }: { result: Exclude<CurrentIdentityResult, { state: 'ready' }> }) {
  const signedOut = result.state === 'signed-out';
  const restricted = result.state === 'restricted';
  return (
    <div className="state-page">
      <SkipLink />
      <header className="state-page-header">
        <BrandMark />
        <ThemeToggle />
      </header>
      <main className="state-panel" id="main-content">
        <div className="state-icon" aria-hidden="true">{signedOut ? '→' : '!'}</div>
        <p className="eyebrow">Your AccessLobby account</p>
        <h1>{signedOut ? 'Sign in to continue' : restricted ? 'This account cannot continue' : 'We cannot load your account right now'}</h1>
        <p>
          {signedOut
            ? 'Sign in to view your AccessLobby account and account controls.'
            : restricted
              ? 'AccessLobby cannot make this identity available. Contact the account administrator for help, or sign in as a different person.'
            : 'Your account information was not changed or replaced. Please try again when the service is available.'}
        </p>
        <div className="state-actions">
          <Link className="button button-primary" href={restricted ? '/auth/login?intent=switch' : '/auth/login'}>
            {restricted ? 'Sign in as a different person' : signedOut ? 'Sign in' : 'Try again'}
          </Link>
          <Link className="button button-secondary" href="/">Return home</Link>
        </div>
      </main>
    </div>
  );
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="arrow-link" href={href}>{children}<span aria-hidden="true">→</span></Link>;
}
