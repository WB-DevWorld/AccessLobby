import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { ActionForm } from '@/components/action-form';
import { RetryButton } from '@/components/retry-button';
import { AccountAccessState, AvailabilityPanel, SurfaceCard } from '@/components/ui';
import { getCurrentIdentity, identityApi } from '@/lib/current-identity';
import { lifecycleUuid } from '@/lib/application-lifecycle';
import { applicationGrantNotices, applicationGrantsHref, parseApplicationGrants, type ApplicationGrantsPage } from '@/lib/application-grants';
import './grants.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'App entry grants', robots: { index: false, follow: false } };
function UtcDate({ value }: { value: string }) { return <time dateTime={value}>{new Date(value).toISOString().replace('.000Z', 'Z')} UTC</time>; }
export default async function ApplicationGrantPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; after?: string | string[]; personId?: string | string[] }>;
}) {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  const { id } = await params; if (!lifecycleUuid(id)) notFound();
  const query = await searchParams;
  if (!applicationGrantsHref(id, query.after, query.personId)) return <AppShell active="apps" title="App entry grants" description="Manage access to your app.">
    <p className="context-alert" role="alert">Use a valid grants page link.</p><Link className="text-link" href={`/apps/manage/${id}/grants`}>First page</Link>
  </AppShell>;
  let data: ApplicationGrantsPage | null = null, response: Response | undefined;
  try { response = await identityApi(`/v1/applications/${id}/grants${typeof query.after === 'string' ? `?${new URLSearchParams({ after: query.after })}` : ''}`); } catch { /* Retry below. */ }
  if (response?.status === 404) notFound();
  if (response?.status === 401) return <AccountAccessState result={{ state: 'signed-out' }} />;
  if (response?.status === 403) return <AccountAccessState result={{ state: 'restricted' }} />;
  if (response?.ok) { try { data = parseApplicationGrants(await response.json(), id); } catch { /* Do not display unconfirmed grants. */ } }
  if (!data) return <AppShell active="apps" title="App entry grants" description="Manage access to your app.">
    <AvailabilityPanel title="Entry grants unavailable" description={response?.status === 409 ? 'Use an active, restricted first-party app.' : 'Your grants could not be confirmed. Try again.'} action={<RetryButton />} />
    <Link className="text-link" href="/apps/manage">Back to developer tools</Link>
  </AppShell>;
  const page = data, selected = page.grants.find(row => row.personId === query.personId), notice = typeof query.notice === 'string' && Object.hasOwn(applicationGrantNotices, query.notice) ? applicationGrantNotices[query.notice] : null;
  return <AppShell active="apps" title="App entry grants" description={page.application.name}
    actions={<Link className="button button-secondary button-compact" href="/apps/manage">Back to developer tools</Link>}>
    {notice && <p className="context-alert" role={['granted', 'revoked'].includes(query.notice ?? '') ? 'status' : 'alert'}>{notice}</p>}
    <SurfaceCard title="Grant or renew entry">
      <ActionForm key={typeof query.personId === 'string' ? query.personId : 'new-grant'} className="context-form" action="/apps/action" method="post" pendingLabel="Saving entry grant…" id="grant-editor">
        <input type="hidden" name="intent" value="grant" /><input type="hidden" name="applicationId" value={page.application.id} /><input type="hidden" name="grantView" value="detail" />
        <label htmlFor="entry-person">Person ID</label><input id="entry-person" name="personId" defaultValue={typeof query.personId === 'string' ? query.personId : ''} required pattern="[0-9a-fA-F-]{36}" autoCapitalize="none" spellCheck={false} />
        <label htmlFor="entry-expiry">Expiry (UTC, optional)</label><input id="entry-expiry" name="expiresAt" type="text" defaultValue={selected?.expiresAt ?? ''} maxLength={24}
          pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z" placeholder="2027-01-01T18:30:00Z" autoCapitalize="none" spellCheck={false} aria-describedby="entry-expiry-help" />
        <small id="entry-expiry-help">Blank means no expiry. Use UTC with Z, for example 2027-01-01T18:30:00Z.</small>
        <button className="button button-primary" type="submit" data-confirm="Grant or renew entry for this person? The app retains its own roles.">Grant or renew entry</button>
      </ActionForm>
    </SurfaceCard>
    <SurfaceCard title="Recorded grants">
      <p className="hero-note">Expiry and person status affect entry. Changes apply to the selected person; app sessions follow their existing checks and expiry.</p>
      {!page.grants.length ? <p role="status">No grants on this results page.</p> : <div className="grant-results" role="region" aria-label="Application entry grants" tabIndex={0}>
        <table><thead><tr>{['Person', 'Person status', 'Stored grant status', 'Expiry (UTC)', 'Granted / revoked', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>{page.grants.map(row => <tr key={row.personId}>
            <th scope="row"><code>{row.personId}</code></th><td>{row.personStatus}</td><td>{row.status}{row.expired && <><br /><strong>Expired</strong></>}</td>
            <td>{row.expiresAt ? <UtcDate value={row.expiresAt} /> : 'No expiry'}</td>
            <td><UtcDate value={row.grantedAt} />{row.revokedAt && <><br />Revoked: <UtcDate value={row.revokedAt} /></>}</td>
            <td><Link className="text-link" href={`${applicationGrantsHref(id, query.after, row.personId)}#grant-editor`}>Renew</Link>
              {row.status === 'active' && <ActionForm action="/apps/action" method="post" pendingLabel="Revoking entry…">
                <input type="hidden" name="intent" value="revoke" /><input type="hidden" name="applicationId" value={page.application.id} /><input type="hidden" name="personId" value={row.personId} /><input type="hidden" name="grantView" value="detail" />
                <button className="button button-secondary button-compact" type="submit" aria-label={`Revoke entry for ${row.personId}`} data-confirm="Revoke this person’s entry? Existing app sessions follow that app’s expiry and recheck policy.">Revoke entry</button>
              </ActionForm>}</td>
          </tr>)}</tbody></table>
      </div>}
      <div className="context-actions" aria-label="Grant results pagination">
        {page.nextCursor ? <Link className="button button-secondary" href={applicationGrantsHref(id, page.nextCursor)!}>Next page</Link> : <p className="hero-note">End of these results.</p>}
        <Link className="text-link" href={applicationGrantsHref(id)!}>First page</Link>
      </div>
    </SurfaceCard>
  </AppShell>;
}
