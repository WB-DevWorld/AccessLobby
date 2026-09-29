import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AccountAccessState, AvailabilityPanel, SurfaceCard } from '@/components/ui';
import { contextError } from '@/lib/context-errors';
import { getContexts, selectedContext } from '@/lib/contexts';
import { getCurrentIdentity } from '@/lib/current-identity';

export const dynamic = 'force-dynamic';

export default async function ContextPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  const data = await getContexts();
  const error = contextError((await searchParams).error);
  const active = data ? await selectedContext(identity.person.id, data.contexts) : null;

  return <AppShell active="contexts" title="Personal and organization contexts"
    description="Use one personal identity when acting for yourself or for an organization you have joined."
    personStatus={identity.person.status}>
    {error && <p className="context-alert" role="alert">{error}</p>}
    {!data ? <AvailabilityPanel title="Contexts are unavailable" description="Try again when the identity service is available." /> : <>
      <section className="context-grid" aria-label="Your contexts">
        <SurfaceCard title="For yourself">
          <p>Your personal identity is always available. It stays the same when you join or leave an organization.</p>
          <form action="/contexts/action" method="post">
            <input type="hidden" name="intent" value="select" />
            <button className="button button-secondary" type="submit" disabled={!active}>{!active ? 'Current context' : 'Use personal context'}</button>
          </form>
        </SurfaceCard>
        {data.contexts.filter(c => c.type === 'organization').map(org => org.type === 'organization' &&
          <SurfaceCard title={org.name} key={org.id}>
            <p>Your organization role: <strong>{org.role}</strong>. This membership does not itself grant access inside connected apps.</p>
            <form action="/contexts/action" method="post">
              <input type="hidden" name="intent" value="select" />
              <input type="hidden" name="organizationId" value={org.id} />
              <button className="button button-secondary" type="submit" disabled={active === org.id}>{active === org.id ? 'Current context' : 'Use this context'}</button>
            </form>
            <p><Link className="text-link" href={`/organizations/${org.id}`}>View members and invitations</Link></p>
          </SurfaceCard>)}
      </section>
      <section className="context-grid" aria-label="Organization actions">
        <SurfaceCard title="Create an organization">
          <p>You will become its first owner. You can invite people who already have an AccessLobby ID.</p>
          <form action="/contexts/action" method="post" className="context-form">
            <input type="hidden" name="intent" value="create" />
            <label htmlFor="organization-name">Organization name</label>
            <input id="organization-name" name="name" type="text" minLength={2} maxLength={120} required />
            <button className="button button-primary" type="submit">Create organization</button>
          </form>
        </SurfaceCard>
        <SurfaceCard title="Invitations for you">
          {data.invitations.length === 0 ? <p>You have no pending invitations.</p> :
            <ul className="context-list">{data.invitations.map(invite => <li key={invite.id}>
              <strong>{invite.organizationName}</strong> · {invite.role}
              <p>Expires {new Date(invite.expiresAt).toLocaleDateString('en-US', { timeZone: 'UTC' })} UTC</p>
              <div className="context-actions">
                <form action="/contexts/action" method="post"><input type="hidden" name="intent" value="accept" /><input type="hidden" name="invitationId" value={invite.id} /><button className="button button-primary" type="submit">Accept</button></form>
                <form action="/contexts/action" method="post"><input type="hidden" name="intent" value="decline" /><input type="hidden" name="invitationId" value={invite.id} /><button className="button button-secondary" type="submit">Decline</button></form>
              </div>
            </li>)}</ul>}
        </SurfaceCard>
      </section>
      <p className="hero-note">This selection changes your AccessLobby account view. Connected apps must check your current membership and their own access rules separately.</p>
    </>}
  </AppShell>;
}
