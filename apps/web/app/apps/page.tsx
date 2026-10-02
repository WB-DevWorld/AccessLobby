import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { AvailableApps } from '@/components/available-apps';
import { SectionSkeleton } from '@/components/skeleton';
import { AccountAccessState } from '@/components/ui';
import { getCurrentIdentity } from '@/lib/current-identity';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Apps', robots: { index: false, follow: false } };
export default async function AppsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  if (notice) redirect(`/apps/manage?notice=${encodeURIComponent(notice)}`);
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  return <AppShell active="apps" title="Your apps" description="Registered apps available to your AccessLobby identity." personStatus={identity.person.status}>
    <Suspense fallback={<SectionSkeleton label="Loading available apps" />}><AvailableApps /></Suspense>
    <div className="developer-link"><div><strong>Manage an application?</strong><p>Connection requests and entry grants live in developer tools.</p></div><Link className="button button-secondary" href="/apps/manage">Developer tools →</Link></div>
  </AppShell>;
}
