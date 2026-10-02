import Link from 'next/link';
import { getAvailableApplications } from '@/lib/applications';
import { AppCards } from '@/components/app-cards';
import { SurfaceCard, AvailabilityPanel } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
export async function AvailableApps({ compact = false }: { compact?: boolean }) {
  const applications = await getAvailableApplications();
  return <SurfaceCard title="Available apps">
    {!applications ? <AvailabilityPanel title="App availability could not be checked" description="Please try again when the service is available." action={<RetryButton />} /> : applications.length === 0 ? <div className="empty-state"><span aria-hidden="true">▦</span><h3>No registered apps available yet</h3><p>Your pilot app may still use an earlier sign-in connection. Ask its administrator for the correct link.</p></div> : <AppCards applications={applications} compact={compact} />}
    <p className="hero-note">Each app checks its own roles and protected resources.</p>
    {compact && <Link className="text-link" href="/apps">View apps →</Link>}
  </SurfaceCard>;
}
