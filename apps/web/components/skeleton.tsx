import { AppShell } from '@/components/app-shell';

export function SectionSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <section className="surface-card skeleton-section" aria-busy="true" aria-label={label}>
    <span className="sr-only" role="status">{label}</span>
    <div aria-hidden="true">
      <div className="skeleton skeleton-heading" />
      {Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index}>
        <div className="skeleton skeleton-avatar" /><div className="skeleton-lines"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line-short" /></div>
      </div>)}
    </div>
  </section>;
}

export function AccountSkeleton({ active = 'overview', title = 'Loading your account' }: {
  active?: 'overview' | 'identity' | 'contexts' | 'apps' | 'recovery'; title?: string;
}) {
  return <AppShell active={active} title={title} description="Checking the latest account information…" loading>
    {active === 'overview' && <section className="surface-card skeleton-identity" aria-busy="true" aria-label="Loading identity">
      <span className="sr-only" role="status">Loading identity</span><div aria-hidden="true" className="skeleton-row"><div className="skeleton skeleton-avatar" /><div className="skeleton-lines"><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-line-short" /></div></div>
    </section>}
    <div className={active === 'overview' ? 'dashboard-grid account-overview' : 'context-grid'}>
      <SectionSkeleton label="Loading account details" rows={2} /><SectionSkeleton label="Loading available information" />
      {active === 'overview' && <><SectionSkeleton label="Loading next steps" rows={2} /><SectionSkeleton label="Loading account guidance" rows={2} /></>}
    </div>
  </AppShell>;
}
