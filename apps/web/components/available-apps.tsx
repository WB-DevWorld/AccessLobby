import Link from 'next/link';
import { getAvailableApplications } from '@/lib/applications';
import { AppCards } from '@/components/app-cards';
import { SurfaceCard, AvailabilityPanel } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
export async function AvailableApps({ compact = false }: { compact?: boolean }) {
  const applications = await getAvailableApplications();
  return <SurfaceCard title="Available apps">
    {!applications ? <AvailabilityPanel title="Apps could not be checked" description="Please try again." action={<RetryButton />} /> : applications.length === 0 ? <div className="empty-state"><span aria-hidden="true">▦</span><h3>No apps listed</h3><p>Ask your app’s administrator for its sign-in link.</p></div> : <AppCards applications={applications} compact={compact} />}
    {compact && <Link className="text-link" href="/apps">View apps →</Link>}
  </SurfaceCard>;
}
