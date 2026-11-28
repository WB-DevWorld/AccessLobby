import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { AccountAccessState, AvailabilityPanel, DataRow, SurfaceCard } from '@/components/ui';
import { RetryButton } from '@/components/retry-button';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { accountSessionNotices, accountSessionsPath, parseAccountSessions, type AccountSessions } from '@/lib/account-sessions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recorded app sessions', robots: { index: false, follow: false } };

function SessionDate({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC</time>;
}

export default async function Security({ searchParams }: { searchParams: Promise<{ after?: string; notice?: string }> }) {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  const query = await searchParams, path = accountSessionsPath(query.after);
  let result: AccountSessions | null = null;
  if (path) {
    try { const response = await identityApi(path); if (response.ok) result = parseAccountSessions(await response.json()); }
    catch { /* Never fill an unavailable list with cached identity/session data. */ }
  }
  const notice = typeof query.notice === 'string' && Object.hasOwn(accountSessionNotices, query.notice) ? accountSessionNotices[query.notice] : null;
  return <AppShell active="security" title="Recorded app sessions" description="Your unexpired sessions recorded by participating apps.">
    <p>This is not a list of every device or sign-in. Apps apply an ending on their next session check.</p>
    <details className="information-details"><summary>How ending a recorded session works</summary>
      <p>Ending removes this app’s recorded session. The app’s check interval, outage grace and expiry still apply.</p>
      <p>It does not sign you out of AccessLobby, remove app access or end other apps’ sessions. You may sign in to the app again.</p>
      <p>A changed session needs a fresh review. Retrying a completed request leaves newer sign-ins alone.</p>
    </details>
    {notice && <p className="context-alert" role={['ended', 'unchanged'].includes(query.notice ?? '') ? 'status' : 'alert'}>{notice}</p>}
    {!path ? <p className="context-alert" role="alert">Use a valid results link.</p> : !result ?
      <AvailabilityPanel title="Recorded sessions could not be checked" description="Your account or the service may have changed. Try again." action={<RetryButton />} /> : <>
      {!result.sessions.length ? <p>No unexpired app sessions are recorded.</p> : <section className="context-grid" aria-label="Your recorded app sessions">
        {result.sessions.map(session => <SurfaceCard title={session.applicationName ?? session.clientId} key={session.handle}>
          {session.currentBrowser && <p className="hero-note">This browser’s sign-in</p>}
          <dl><DataRow label="Recorded"><SessionDate value={session.createdAt} /></DataRow>
            <DataRow label="Expires"><SessionDate value={session.expiresAt} /></DataRow></dl>
          <details className="information-details"><summary>End recorded session</summary>
            <ActionForm action="/security/action" method="post" className="context-form" pendingLabel="Ending recorded session…"
              confirmMessage="End this recorded app session? The app applies the change on its next session check. You can sign in again.">
              <input type="hidden" name="intent" value="end-recorded-session" /><input type="hidden" name="handle" value={session.handle} />
              <input type="hidden" name="expectedState" value={session.expectedState} />
              <label htmlFor={`confirm-session-${session.handle}`} style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <input id={`confirm-session-${session.handle}`} type="checkbox" name="confirmEnd" value="yes" required
                  style={{ width: '1.1rem', minHeight: '1.1rem', padding: 0, flexShrink: 0 }} /> Confirm ending this recorded session
              </label>
              <button className="button button-danger" type="submit">End recorded session</button>
            </ActionForm>
          </details>
        </SurfaceCard>)}
      </section>}
      <div className="context-actions" aria-label="Recorded session pagination">
        {result.nextCursor && <Link className="button button-secondary" href={`/security?after=${encodeURIComponent(result.nextCursor)}`}>Next page</Link>}
        {query.after && <Link className="text-link" href="/security">First page</Link>}
      </div>
    </>}
    <div className="context-actions"><Link className="text-link" href="/security/history">Session history</Link><Link className="text-link" href="/sign-out">Sign-out choices</Link><Link className="text-link" href="/account">Your account</Link></div>
  </AppShell>;
}
