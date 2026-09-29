import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { BrandMark, SkipLink, StatusBadge } from '@/components/ui';
import { formatIdentityStatus } from '@/lib/current-identity-model';

type ActiveSection = 'overview' | 'identity' | 'contexts' | 'apps' | 'recovery';

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
  { key: 'contexts', label: 'Contexts', href: '/contexts', icon: 'apps' },
  { key: 'apps', label: 'Apps', href: '/apps', icon: 'apps' },
  { key: 'recovery', label: 'Recovery', href: '/recovery', icon: 'recovery' },
] as const;

const plannedNavigation = [
  { label: 'Security', icon: 'shield' },
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
    signout: <><path d="M10 6V4.5H4.5v15H10V18" /><path d="M10 12h9" /><path d="m15.5 8.5 3.5 3.5-3.5 3.5" /></>,
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function AccountLinks({ active, itemClassName }: { active: ActiveSection; itemClassName: string }) {
  return enabledNavigation.map((item) => {
    const current = active === item.key;
    return (
      <Link
        key={item.key}
        className={`${itemClassName} ${current ? `${itemClassName}-active` : ''}`.trim()}
        href={item.href}
        aria-current={current ? 'page' : undefined}
      >
        <NavigationIcon name={item.icon} />
        <span>{item.label}</span>
      </Link>
    );
  });
}

export function AppShell({ active, title, description, personStatus, children, actions }: AppShellProps) {
  return (
    <div className="app-frame">
      <SkipLink />

      <aside className="app-sidebar" aria-label="AccessLobby Identity">
        <div className="sidebar-brand"><BrandMark /></div>
        <nav className="primary-nav" aria-label="Identity account navigation">
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

          <p className="nav-label nav-label-spaced">Planned modules</p>
          {plannedNavigation.map((item) => (
            <span className="nav-item nav-item-disabled" key={item.label}>
              <NavigationIcon name={item.icon} />
              <span>{item.label}</span>
              <span className="nav-soon">Planned</span>
            </span>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="system-state"><span aria-hidden="true" /> Signed in</div>
          <p>AccessLobby confirms your identity. Each app keeps its own account data and permissions.</p>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="app-header">
          <div className="mobile-bar">
            <BrandMark />
            <StatusBadge>{formatIdentityStatus(personStatus)}</StatusBadge>
          </div>
          <div className="page-heading">
            <p className="eyebrow">AccessLobby Identity</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="header-actions">
            <StatusBadge>{formatIdentityStatus(personStatus)}</StatusBadge>
            <ThemeToggle />
            {actions}
            <Link className="button button-secondary button-compact" href="/account#sign-out">Sign out</Link>
          </div>
        </header>

        <nav className="tablet-nav" aria-label="Identity account sections">
          <AccountLinks active={active} itemClassName="tablet-nav-item" />
          <Link className="tablet-nav-item" href="/account#sign-out">
            <NavigationIcon name="signout" />
            <span>Sign out</span>
          </Link>
        </nav>

        <main className="app-main" id="main-content">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile identity account navigation">
        <AccountLinks active={active} itemClassName="mobile-nav-item" />
        <Link className="mobile-nav-item" href="/account#sign-out">
          <NavigationIcon name="signout" />
          <span>Sign out</span>
        </Link>
      </nav>
    </div>
  );
}
