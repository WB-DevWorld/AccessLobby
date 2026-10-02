import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AccountAccessState } from '@/components/ui';
import { SignOutChoices } from '@/components/sign-out-choices';
import { getCurrentIdentity } from '@/lib/current-identity';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign out', robots: { index: false, follow: false } };
export default async function SignOut() {
  const identity = await getCurrentIdentity();
  if (identity.state === 'signed-out') return <AccountAccessState result={identity} />;
  // An unavailable/restricted identity must still be able to clear its local session.
  return <AppShell active="overview" title="How would you like to sign out?" description="Choose what to end in this browser.">
    <SignOutChoices /><Link className="text-link" href="/account">Back to your account</Link>
  </AppShell>;
}
