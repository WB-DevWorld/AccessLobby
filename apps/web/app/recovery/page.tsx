import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AccountAccessState, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity } from '@/lib/current-identity';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recovery & help', robots: { index: false, follow: false } };
export default async function RecoveryPage() {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  return <AppShell active="recovery" title="Recovery & help" description="Find the right help for your account." personStatus={identity.person.status}>
    <section className="context-grid"><SurfaceCard title="Need help signing in?"><p>Use “Forgot your password?” if offered, or contact the administrator who invited you.</p><Link className="button button-primary" href="/auth/login">Open sign-in</Link></SurfaceCard><SurfaceCard title="Need access to an app?"><p>Contact that app’s administrator for account or permission help.</p><Link className="text-link" href="/apps">View available apps →</Link></SurfaceCard></section>
    <Link className="text-link" href="/help#support">More account help →</Link>
  </AppShell>;
}
