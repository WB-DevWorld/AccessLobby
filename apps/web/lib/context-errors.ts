const messages: Record<string, string> = {
  invalid_organization_name: 'Enter an organization name between 2 and 120 characters.',
  invalid_invitation: 'Enter a valid AccessLobby ID and choose a role.',
  person_not_found: 'That active AccessLobby ID could not be found.',
  already_a_member: 'This person is already a member.',
  invitation_pending: 'This person already has a pending invitation.',
  invitation_not_found: 'The invitation expired or is no longer available.',
  membership_permission_denied: 'Your current organization role cannot make this change.',
  member_not_found: 'This person is not an active member.',
  last_owner: 'Assign another owner before this owner leaves or changes role.',
  organization_not_found: 'This organization is unavailable to your account.',
  invalid_role: 'Choose a supported organization role.',
  identity_unavailable: 'Account information is temporarily unavailable. Please try again.',
};
export function contextError(code?: string): string | null { return code ? messages[code] ?? null : null; }

const notices: Record<string, string> = { selected: 'Account view updated.', created: 'Organization created. You are its first owner.', invite: 'Invitation created.', accept: 'Invitation accepted.', decline: 'Invitation declined.', revoke: 'Invitation revoked.', role: 'Organization role updated.', remove: 'Member removed.', leave: 'You have left the organization.' };
export function contextNotice(code?: string): string | null { return code ? notices[code] ?? null : null; }
