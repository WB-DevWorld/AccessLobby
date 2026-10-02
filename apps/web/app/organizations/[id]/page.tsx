import { ActionForm } from '@/components/action-form';
import { RetryButton } from '@/components/retry-button';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { AccountAccessState, AvailabilityPanel, SurfaceCard } from '@/components/ui';
import { contextError, contextNotice } from '@/lib/context-errors';
import { getOrganization } from '@/lib/contexts';
import { getCurrentIdentity } from '@/lib/current-identity';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Personal & organizations', robots: { index: false, follow: false } };

export default async function OrganizationPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }>
}) {
  const identity = await getCurrentIdentity();
  if (identity.state !== 'ready') return <AccountAccessState result={identity} />;
  const { id } = await params;
  const data = await getOrganization(id);
  const error = contextError((await searchParams).error);
  const notice = contextNotice((await searchParams).notice);

  return <AppShell active="contexts" title={data?.name ?? 'Organization unavailable'}
    description="Manage the people who can represent this organization in AccessLobby."
    personStatus={identity.person.status} actions={<Link className="button button-secondary button-compact" href="/contexts">Personal & organizations</Link>}>
    {error && <p className="context-alert" role="alert">{error}</p>}
    {notice && <p className="context-alert context-success" role="status">{notice}</p>}
    {!data ? <AvailabilityPanel title="Organization unavailable" description="You may no longer be a member, or the service may be unavailable." action={<RetryButton />} /> : <>
      <p className="hero-note">Your role: <strong>{data.role}</strong>. Organization ID: <code>{data.id}</code>. App entry, billing and app-specific permissions remain separate.</p>
      <section className="context-grid">
        <SurfaceCard title="Members">
          <ul className="context-list">{data.members.map(member => <li key={member.personId}>
            <div><code>{member.personId}</code><br /><strong>{member.role}</strong>{member.personId === identity.person.id ? ' · You' : ''}</div>
            {data.role === 'owner' && <ActionForm className="context-actions" action="/contexts/action" method="post">
              <input type="hidden" name="intent" value="role" /><input type="hidden" name="organizationId" value={id} />
              <input type="hidden" name="personId" value={member.personId} />
              <label>Change organization role <select name="role" defaultValue={member.role} aria-label={`Role for ${member.personId}`}>
                <option value="owner">Owner</option><option value="administrator">Administrator</option><option value="member">Member</option>
              </select></label>
              <button className="button button-secondary" type="submit" data-confirm="Change this person’s organization role? Ownership changes affect who can manage this organization.">Save role</button>
            </ActionForm>}
            {(member.personId === identity.person.id || data.role === 'owner' || (data.role === 'administrator' && member.role === 'member')) &&
              <ActionForm action="/contexts/action" method="post">
                <input type="hidden" name="intent" value={member.personId === identity.person.id ? 'leave' : 'remove'} />
                <input type="hidden" name="organizationId" value={id} /><input type="hidden" name="personId" value={member.personId} />
                <button className="button button-secondary" type="submit" data-confirm={member.personId === identity.person.id ? "Leave this organization? Your membership will end." : "Remove this member? Their organization membership will end."}>{member.personId === identity.person.id ? 'Leave organization' : 'Remove member'}</button>
              </ActionForm>}
          </li>)}</ul>
        </SurfaceCard>
        {data.role !== 'member' && <SurfaceCard title="Invite an existing person">
          <p>Ask the person for their AccessLobby ID. The invitation appears only in their signed-in account and expires in seven days.</p>
          <ActionForm className="context-form" action="/contexts/action" method="post">
            <input type="hidden" name="intent" value="invite" /><input type="hidden" name="organizationId" value={id} />
            <label htmlFor="invite-person">AccessLobby ID</label><input id="invite-person" name="personId" type="text" required pattern="[0-9a-fA-F-]{36}" />
            <label htmlFor="invite-role">Organization role</label><select id="invite-role" name="role">
              <option value="member">Member</option>{data.role === 'owner' && <option value="administrator">Administrator</option>}
            </select>
            <button className="button button-primary" type="submit">Create invitation</button>
          </ActionForm>
          <h3>Pending invitations</h3>
          {data.invitations.length === 0 ? <p>None pending.</p> : <ul className="context-list">{data.invitations.map(invite => <li key={invite.id}>
            <code>{invite.personId}</code> · {invite.role}
            {(data.role === 'owner' || invite.role === 'member') && <ActionForm action="/contexts/action" method="post">
              <input type="hidden" name="intent" value="revoke" /><input type="hidden" name="organizationId" value={id} />
              <input type="hidden" name="invitationId" value={invite.id} /><button className="button button-secondary" type="submit" data-confirm="Revoke this invitation? The person will no longer be able to accept it.">Revoke invitation</button>
            </ActionForm>}
          </li>)}</ul>}
        </SurfaceCard>}
      </section>
      <p className="hero-note">Only an owner can assign ownership or administrator roles. The last owner must appoint another owner before leaving.</p>
    </>}
  </AppShell>;
}
