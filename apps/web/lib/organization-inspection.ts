import { adminContract, adminUuid } from './admin-model';

export type OrganizationSection = 'members' | 'invitations' | 'events';
export type OrganizationInspection = { id: string; name: string; status: 'active' | 'suspended'; createdByPersonId: string;
  createdAt: string; activeMemberCount: number; activeOwnerCount: number; totalMembershipCount: number; totalInvitationCount: number };
export type OrganizationMember = { personId: string; personStatus: 'active' | 'suspended'; role: 'owner' | 'administrator' | 'member';
  membershipStatus: 'active' | 'left' | 'removed'; joinedAt: string; endedAt: string | null };
export type OrganizationInvitation = { id: string; personId: string; invitedByPersonId: string; role: 'administrator' | 'member';
  status: 'pending' | 'accepted' | 'declined' | 'revoked'; expiresAt: string; createdAt: string; decidedAt: string | null; pendingExpired: boolean };
export type OrganizationEvent = { id: string; actorPersonId: string; targetPersonId: string | null; action: keyof typeof organizationEventLabels; occurredAt: string };
export type OrganizationInspectionPage<T> = { organizationId: string; items: T[]; nextCursor: string | null };

export const organizationEventLabels = {
  'organization.created': 'Organization created', 'invitation.created': 'Invitation created', 'invitation.accepted': 'Invitation accepted',
  'invitation.declined': 'Invitation declined', 'invitation.revoked': 'Invitation revoked', 'membership.role.owner': 'Owner role assigned',
  'membership.role.administrator': 'Administrator role assigned', 'membership.role.member': 'Member role assigned',
  'membership.left': 'Member left', 'membership.removed': 'Member removed', 'organization.event': 'Other recorded event',
} as const;
export const organizationSectionLabels = { members: 'Members', invitations: 'Invitations', events: 'Organization history' } as const;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const nullableDate = (value: unknown): value is string | null => value === null || date(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const personStatus = (value: unknown): value is 'active' | 'suspended' => value === 'active' || value === 'suspended';
const eventId = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;

export function parseOrganizationInspection(value: unknown): OrganizationInspection | null {
  if (!record(value) || value.contract !== adminContract || !record(value.organization)) return null;
  const item = value.organization;
  if (!adminUuid(item.id) || typeof item.name !== 'string' || item.name.length < 2 || item.name.length > 120 || /[\x00-\x1f\x7f]/.test(item.name) ||
      !personStatus(item.status) || !adminUuid(item.createdByPersonId) || !date(item.createdAt) || !count(item.activeMemberCount) ||
      !count(item.activeOwnerCount) || !count(item.totalMembershipCount) || !count(item.totalInvitationCount) ||
      item.activeOwnerCount > item.activeMemberCount || item.activeMemberCount > item.totalMembershipCount) return null;
  return { id: item.id, name: item.name, status: item.status, createdByPersonId: item.createdByPersonId, createdAt: item.createdAt,
    activeMemberCount: item.activeMemberCount, activeOwnerCount: item.activeOwnerCount,
    totalMembershipCount: item.totalMembershipCount, totalInvitationCount: item.totalInvitationCount };
}

function page<T>(value: unknown, organizationId: string, key: OrganizationSection, parse: (value: unknown) => T | null): OrganizationInspectionPage<T> | null {
  if (!record(value) || value.contract !== adminContract || !adminUuid(organizationId) ||
      typeof value.organizationId !== 'string' || value.organizationId.toLowerCase() !== organizationId.toLowerCase() ||
      !Array.isArray(value[key]) || value[key].length > 25 ||
      !(value.nextCursor === null || (key === 'events' ? eventId(value.nextCursor) : adminUuid(value.nextCursor)))) return null;
  const items: T[] = [];
  for (const item of value[key]) { const result = parse(item); if (!result) return null; items.push(result); }
  // A continuation always names the final row actually rendered, never a hidden or caller-controlled row.
  if (value.nextCursor !== null && (items.length !== 25 || value.nextCursor !==
      (key === 'members' ? (items.at(-1) as OrganizationMember).personId : (items.at(-1) as OrganizationInvitation | OrganizationEvent).id))) return null;
  return { organizationId: value.organizationId, items, nextCursor: value.nextCursor };
}

export function parseOrganizationMembers(value: unknown, organizationId: string) {
  return page<OrganizationMember>(value, organizationId, 'members', item => {
    if (!record(item) || !adminUuid(item.personId) || !personStatus(item.personStatus) ||
        !(item.role === 'owner' || item.role === 'administrator' || item.role === 'member') ||
        !(item.membershipStatus === 'active' || item.membershipStatus === 'left' || item.membershipStatus === 'removed') ||
        !date(item.joinedAt) || !nullableDate(item.endedAt)) return null;
    return { personId: item.personId, personStatus: item.personStatus, role: item.role, membershipStatus: item.membershipStatus,
      joinedAt: item.joinedAt, endedAt: item.endedAt };
  });
}
export function parseOrganizationInvitations(value: unknown, organizationId: string) {
  return page<OrganizationInvitation>(value, organizationId, 'invitations', item => {
    if (!record(item) || !adminUuid(item.id) || !adminUuid(item.personId) || !adminUuid(item.invitedByPersonId) ||
        !(item.role === 'administrator' || item.role === 'member') ||
        !(item.status === 'pending' || item.status === 'accepted' || item.status === 'declined' || item.status === 'revoked') ||
        !date(item.expiresAt) || !date(item.createdAt) || !nullableDate(item.decidedAt) || typeof item.pendingExpired !== 'boolean' ||
        (item.status !== 'pending' && item.pendingExpired)) return null;
    return { id: item.id, personId: item.personId, invitedByPersonId: item.invitedByPersonId, role: item.role, status: item.status,
      expiresAt: item.expiresAt, createdAt: item.createdAt, decidedAt: item.decidedAt, pendingExpired: item.pendingExpired };
  });
}
export function parseOrganizationEvents(value: unknown, organizationId: string) {
  return page<OrganizationEvent>(value, organizationId, 'events', item => {
    if (!record(item) || !eventId(item.id) || !adminUuid(item.actorPersonId) || !(item.targetPersonId === null || adminUuid(item.targetPersonId)) ||
        typeof item.action !== 'string' || !Object.hasOwn(organizationEventLabels, item.action) || !date(item.occurredAt)) return null;
    return { id: item.id, actorPersonId: item.actorPersonId, targetPersonId: item.targetPersonId,
      action: item.action as OrganizationEvent['action'], occurredAt: item.occurredAt };
  });
}

export function organizationSection(value: unknown): OrganizationSection | null {
  return value === undefined ? 'members' : value === 'members' || value === 'invitations' || value === 'events' ? value : null;
}
export function organizationDetailPath(id: unknown): string | null {
  return adminUuid(id) ? `/v1/admin/organizations/${id.toLowerCase()}` : null;
}
export function organizationInspectionPath(id: unknown, section: unknown, after?: unknown): string | null {
  const base = organizationDetailPath(id);
  const selected = organizationSection(section);
  if (!base || !selected || (after !== undefined && !(selected === 'events' ? eventId(after) : adminUuid(after)))) return null;
  return `${base}/${selected}${typeof after === 'string' ? `?${new URLSearchParams({ after: after.toLowerCase() })}` : ''}`;
}
export function organizationInspectionHref(id: unknown, section: unknown, after?: unknown): string | null {
  const path = organizationInspectionPath(id, section, after);
  const selected = organizationSection(section);
  if (!path || !selected || !adminUuid(id)) return null;
  const query = new URLSearchParams({ section: selected });
  if (typeof after === 'string') query.set('after', after.toLowerCase());
  return `/admin/organizations/${id.toLowerCase()}?${query}`;
}
