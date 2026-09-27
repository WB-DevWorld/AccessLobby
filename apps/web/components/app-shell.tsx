import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark, StatusBadge } from '@/components/ui';
import { formatIdentityStatus } from '@/lib/current-identity-model';

type ActiveSection = 'overview' | 'identity' | 'recovery';

type AppShellProps = {
  active: ActiveSection;
  title: string;
  description: string;
  personStatus: string;
  children: ReactNode;
  actions?: ReactNode;
};

const enabledNavigation = [
  { key: 'overview', label: 'Overview', href: '/account', icon: 'home' },
  { key: 'identity', label: 'Identity', href: '/identity', icon: 'person' },
  { key: 'recovery', label: 'Recovery', href: '/recovery', icon: 'recovery' },
] as const;

const plannedNavigation = [
  { label: 'Security', icon: 'shield' },
  { label: 'Apps & Access', icon: 'apps' },
  { label: 'Privacy', icon: 'privacy' },
] as const;

function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m4 11 8-7 8 7" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-6h4v6" /></>,
    person: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" /></>,
    recovery: <><path d="M5.2 8.2A8 8 0 1 1 4.4 15" /><path d="M4 5v4h4" /><path d="M12 8v4l2.5 1.5" /></>,
    shield: <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />,
    apps: <><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><rect x="14" y="14" width="6" height="6" rx="1.2" /></>,
    privacy: <><path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" /><path d="M9.5 12h5" /></>,
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function AppShell({ active, title, description, personStatus, children, actions }: AppShellProps) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <aside className="app-sidebar">
        <div className="sidebar-brand"><BrandMark /></div>
        <nav className="primary-nav" aria-label="Account navigation">
          <p className="nav-label">Your account</p>
          {enabledNavigation.map((item) => (
            <Link
              key={item.key}
              className={`nav-item ${active === item.key ? 'nav-item-active' : ''}`}
              href={item.href}
              aria-current={active === item.key ? 'page' : undefined}
            >
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}

          <p className="nav-label nav-label-spaced">Coming later</p>
          {plannedNavigation.map((item) => (
            <span className="nav-item nav-item-disabled" aria-disabled="true" key={item.label} title="Not available in this release">
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
              <span className="nav-soon">Later</span>
            </span>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="system-state"><span aria-hidden="true" /> Identity foundation online</div>
          <p>AccessLobby keeps identity separate from each app&apos;s permissions.</p>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="mobile-bar">
          <BrandMark />
          <StatusBadge>{formatIdentityStatus(personStatus)}</StatusBadge>
        </header>

        <header className="app-header">
          <div className="page-heading">
            <p className="eyebrow">AccessLobby Identity</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="header-actions">
            <StatusBadge>{formatIdentityStatus(personStatus)}</StatusBadge>
            {actions}
            <Link className="button button-secondary button-compact" href="/account#sign-out">Sign out</Link>
          </div>
        </header>

        <main className="app-main" id="main-content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile account navigation">
        {enabledNavigation.map((item) => (
          <Link
            key={item.key}
            className={active === item.key ? 'mobile-nav-active' : undefined}
            href={item.href}
            aria-current={active === item.key ? 'page' : undefined}
          >
            <NavigationIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        ))}
        <Link href="/account#sign-out"><NavigationIcon name="shield" /><span>Sign out</span></Link>
      </nav>
    </div>
  );
}
