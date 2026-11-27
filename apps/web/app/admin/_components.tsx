import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { RetryButton } from '@/components/retry-button';
import { BrandMark, SkipLink } from '@/components/ui';
import { ThemeToggle } from '@/components/theme-toggle';
import type { AdminContext } from '@/lib/admin';
import { adminNextHref, type AdminListKind } from '@/lib/admin-model';
import './admin.css';

export const adminMetadata = { title: 'Operator console', robots: { index: false, follow: false } };
const sections = [
  { key: 'overview', href: '/admin', label: 'Overview' },
  { key: 'people', href: '/admin/people', label: 'People' },
  { key: 'organizations', href: '/admin/organizations', label: 'Organizations' },
  { key: 'applications', href: '/admin/applications', label: 'Applications' },
  { key: 'activations', href: '/admin/activations', label: 'Activation progress' },
  { key: 'audit', href: '/admin/audit', label: 'Operator history' },
] as const;

// Pages await identity, current grants and records before returning this frame.
// Keep primary admin content outside route-wide loading boundaries: a deferred
// client reveal must not hide already-authorized server-rendered records.
export function AdminFrame({ active, title, description, children }: {
  active: typeof sections[number]['key']; title: string; description: string; children: ReactNode;
}) {
  return <AppShell active="admin" title={title} description={description}>
    <nav className="admin-sections" aria-label="Operator console sections">
      {sections.map(section => <Link key={section.key} href={section.href} className={`button button-secondary button-compact${section.key === active ? ' admin-section-active' : ''}`}
        aria-current={section.key === active ? 'page' : undefined}>{section.label}</Link>)}
    </nav>
    {children}
  </AppShell>;
}

export function AdminAccessState({ context }: { context: Exclude<AdminContext, { state: 'ready' }> }) {
  const signedOut = context.state === 'signed-out';
  const unavailable = context.state === 'unavailable';
  return <div className="state-page"><SkipLink />
    <header className="state-page-header"><BrandMark /><ThemeToggle /></header>
    <main className="state-panel" id="main-content">
      <p className="eyebrow">AccessLobby operator console</p>
      <h1>{signedOut ? 'Sign in to continue' : unavailable ? 'Operator access could not be checked' : 'Operator access required'}</h1>
      <p>{signedOut ? 'Sign in with an authorized operator account.' : unavailable ?
        'Operator access is unavailable. Please try again.' :
        'This account needs a platform operator grant.'}</p>
      <div className="state-actions">
        {unavailable ? <RetryButton /> : <Link className="button button-primary" href={signedOut ? '/auth/login' : '/auth/login?intent=switch'}>{signedOut ? 'Sign in' : 'Use a different account'}</Link>}
        <Link className="button button-secondary" href="/account">Your account</Link>
      </div>
    </main>
  </div>;
}

export function AdminSearch({ kind, q }: { kind: Exclude<AdminListKind, 'audit'>; q: unknown }) {
  return <form className="context-form admin-search" method="get" action={`/admin/${kind}`} role="search">
    <label htmlFor="admin-query">{kind === 'people' ? 'AccessLobby ID or beginning of ID' : kind === 'organizations' ? 'Organization name or ID' : 'Application name or client ID'}</label>
    <div className="admin-search-controls"><input id="admin-query" name="q" type="search" maxLength={120} autoCapitalize="none" spellCheck={false}
      defaultValue={typeof q === 'string' && q.length <= 120 ? q : ''} />
      <button className="button button-primary" type="submit">Search</button><Link className="button button-secondary" href={`/admin/${kind}`}>Clear</Link></div>
    {kind === 'people' && <small>Enter at least four ID characters.</small>}
  </form>;
}

export function AdminPagination({ kind, q, nextCursor }: { kind: AdminListKind; q?: unknown; nextCursor: string | null }) {
  const href = nextCursor ? adminNextHref(kind, q, nextCursor) : null;
  return <div className="context-actions" aria-label="Results pagination">
    {href ? <Link className="button button-secondary" href={href}>Next page</Link> : <p className="hero-note">End of these results.</p>}
    <Link className="text-link" href={`/admin/${kind}${typeof q === 'string' && q.trim() ? `?${new URLSearchParams({ q: q.trim() })}` : ''}`}>First page</Link>
  </div>;
}

export function AdminTable({ label, children }: { label: string; children: ReactNode }) {
  return <div className="admin-table-wrap" role="region" aria-label={label} tabIndex={0}><table className="admin-table">{children}</table></div>;
}
export function AdminDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</time>;
}
export function InvalidAdminQuery() {
  return <p className="context-alert" role="alert">Check your search text or use a valid results link.</p>;
}
