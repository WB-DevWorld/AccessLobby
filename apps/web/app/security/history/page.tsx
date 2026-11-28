import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AccountAccessState, AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { accountSecurityEventsPath, parseAccountSecurityHistory, type AccountSecurityHistory } from '@/lib/account-sessions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recorded session history', robots: { index: false, follow: false } };

export default async function SecurityHistory({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  const query = await searchParams, path = accountSecurityEventsPath(query.after);
  let history: AccountSecurityHistory | null = null;
  if (path) {
    try { const response = await identityApi(path); if (response.ok) history = parseAccountSecurityHistory(await response.json()); }
    catch { /* No cached or invented security history replaces a failed read. */ }
  }
  return <AppShell active="security" title="Recorded session history" description="Your recorded app-session endings from the past 30 days.">
    <p>Only session endings initiated from your AccessLobby account appear here.</p>
    <Link className="text-link" href="/security">Back to recorded sessions</Link>
    {!path ? <p className="context-alert" role="alert">Use a valid history link.</p> : !history ?
      <AvailabilityPanel title="Session history could not be checked" description="Your account or the service may have changed. Try again." action={<RetryButton />} /> : <>
      {!history.events.length ? <p>No recorded session endings in the past 30 days.</p> : <section className="context-grid" aria-label="Your recorded session history">
        {history.events.map(event => <SurfaceCard title={event.applicationName ?? event.clientId} key={event.id}>
          <p>Recorded session ended</p>
          <dl><DataRow label="When"><time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</time></DataRow>
            <DataRow label="Recorded entries ended">{event.receiptCount}</DataRow></dl>
        </SurfaceCard>)}
      </section>}
      <div className="context-actions" aria-label="Session history pagination">
        {history.nextCursor && <Link className="button button-secondary" href={`/security/history?after=${encodeURIComponent(history.nextCursor)}`}>Older entries</Link>}
        {query.after && <Link className="text-link" href="/security/history">Latest entries</Link>}
      </div>
    </>}
    <details className="information-details"><summary>History scope and retention</summary>
      <p>Counts describe stored app-session entries. App names use the current registry label.</p>
      <p>This page shows the past 30 days. Older stored records are removed in batches during later session-ending activity, so storage retention can be longer.</p>
    </details>
  </AppShell>;
}
