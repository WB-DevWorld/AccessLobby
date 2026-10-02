import Link from 'next/link';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { AccountMenu } from '@/components/account-menu';
import { BrandMark, SkipLink } from '@/components/ui';

type ActiveSection = 'overview' | 'identity' | 'contexts' | 'apps' | 'recovery';
const enabledNavigation = [
  { key: 'overview', label: 'Home', href: '/account', icon: 'home' },
  { key: 'apps', label: 'Apps', href: '/apps', icon: 'apps' },
  { key: 'identity', label: 'Identity', href: '/identity', icon: 'person' },
  { key: 'contexts', label: 'Personal & organizations', href: '/contexts', icon: 'organizations' },
  { key: 'recovery', label: 'Recovery & help', href: '/recovery', icon: 'recovery' },
] as const;

function NavigationIcon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="m4 11 8-7 8 7" /><path d="M6.5 10.5V20h11v-9.5" /><path d="M10 20v-6h4v6" /></>,
    person: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" /></>,
    recovery: <><path d="M5.2 8.2A8 8 0 1 1 4.4 15" /><path d="M4 5v4h4" /><path d="M12 8v4l2.5 1.5" /></>,
    organizations: <><path d="M4 21V7l8-4v18M12 10h8v11M2 21h20" /><path d="M7 9h2M7 13h2M7 17h2M15 14h2M15 18h2" /></>,
    apps: <><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><rect x="14" y="14" width="6" height="6" rx="1.2" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function AccountLinks({ active, itemClassName, mobile = false }: { active: ActiveSection; itemClassName: string; mobile?: boolean }) {
  return enabledNavigation.filter(item => !mobile || ['overview', 'apps', 'identity'].includes(item.key)).map(item =>
    <Link key={item.key} className={`${itemClassName} ${active === item.key ? `${itemClassName}-active` : ''}`}
      href={item.href} aria-current={active === item.key ? 'page' : undefined}>
      <NavigationIcon name={item.icon} /><span>{item.label}</span>
    </Link>);
}

export function AppShell({ active, title, description, children, actions, contextName, loading = false }: {
  active: ActiveSection; title: string; description: string; personStatus?: string; children: ReactNode;
  actions?: ReactNode; contextName?: string; loading?: boolean;
}) {
  return <div className="app-frame">
    <SkipLink />
    <aside className="app-sidebar" aria-label="AccessLobby Identity">
      <Link className="sidebar-brand" href="/account"><BrandMark /></Link>
      <nav className="primary-nav" aria-label="Account navigation"><p className="nav-label">Your account</p>
        <AccountLinks active={active} itemClassName="nav-item" />
      </nav>
      <div className="sidebar-foot"><Link href="/help">Help & support</Link><Link href="/apps/manage">Developer tools <span aria-hidden="true">↗</span></Link></div>
    </aside>
    <div className="app-workspace">
      <header className="app-header">
        <div className="mobile-bar"><Link href="/account"><BrandMark /></Link></div>
        <div className="page-heading"><p className="eyebrow">AccessLobby Identity</p><h1>{title}</h1><p>{description}</p></div>
        <div className="header-actions">
          {!loading && <Link className="context-switch" href="/contexts" aria-label={`Personal and organization selection${contextName ? `: ${contextName}` : ''}`}>
            <span aria-hidden="true">◈</span><span>{contextName ?? 'Personal & organizations'}</span><span aria-hidden="true">⌄</span>
          </Link>}
          <ThemeToggle />{actions}{!loading && <AccountMenu />}
        </div>
      </header>
      <nav className="tablet-nav" aria-label="Account sections"><AccountLinks active={active} itemClassName="tablet-nav-item" /></nav>
      <main className="app-main" id="main-content">{children}</main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile account navigation"><AccountLinks active={active} itemClassName="mobile-nav-item" mobile /><AccountMenu mobile /></nav>
  </div>;
}
