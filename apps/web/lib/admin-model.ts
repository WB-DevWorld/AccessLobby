export const adminContract = 'accesslobby.admin.v0.1';
export type OperatorRole = 'support_reader' | 'application_reviewer';
export type AdminAccess = { contract: typeof adminContract; roles: OperatorRole[]; capabilities: { read: true; reviewApplications: boolean } };
export type AdminPerson = { id: string; status: 'active' | 'suspended'; createdAt: string; organizationCount: number; applicationCount: number };
export type AdminOrganization = { id: string; name: string; status: 'active' | 'suspended'; createdAt: string; memberCount: number; ownerCount: number };
export type AdminApplication = { id: string; clientId: string; name: string; ownerPersonId: string; status: 'requested' | 'active' | 'suspended'; trustClass: string; platform: string; originVerifiedAt: string | null; reviewDecision: 'approved' | 'rejected' | null };
export type ApplicationReview = { decision: 'approved' | 'rejected'; reference: string; reviewerPersonId: string; reviewedAt: string; configurationHash: string };
export type AdminApplicationDetail = Omit<AdminApplication, 'reviewDecision'> & { redirectUri: string; logoutUri: string; backchannelLogoutUri: string | null; visibility: string; admission: string; originVerifiedHost: string | null; configurationHash: string; review: ApplicationReview | null };
export type AdminAuditEvent = { id: string; actorPersonId: string | null; action: string; targetType: string; targetId: string; reference: string; occurredAt: string };
export type AdminPage<T> = { items: T[]; nextCursor: string | null };

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const adminUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const adminHash = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
const text = (value: unknown, max = 2048): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const nullableDate = (value: unknown): value is string | null => value === null || date(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const status = (value: unknown): value is 'active' | 'suspended' => value === 'active' || value === 'suspended';

export function parseAdminAccess(value: unknown): AdminAccess | null {
  if (!record(value) || value.contract !== adminContract || !Array.isArray(value.roles) || value.roles.length === 0 ||
      !value.roles.every(role => role === 'support_reader' || role === 'application_reviewer') ||
      new Set(value.roles).size !== value.roles.length || !record(value.capabilities) || value.capabilities.read !== true ||
      value.capabilities.reviewApplications !== value.roles.includes('application_reviewer')) return null;
  return { contract: adminContract, roles: value.roles, capabilities: { read: true, reviewApplications: value.capabilities.reviewApplications as boolean } };
}

function page<T>(value: unknown, key: string, parse: (item: unknown) => T | null): AdminPage<T> | null {
  if (!record(value) || value.contract !== adminContract || !Array.isArray(value[key]) || value[key].length > 25 ||
      !(value.nextCursor === null || text(value.nextCursor, 100))) return null;
  const items: T[] = [];
  for (const item of value[key]) { const parsed = parse(item); if (!parsed) return null; items.push(parsed); }
  return { items, nextCursor: value.nextCursor };
}

export function parseAdminPeople(value: unknown) {
  return page<AdminPerson>(value, 'people', item => record(item) && adminUuid(item.id) && status(item.status) && date(item.createdAt) &&
    count(item.organizationCount) && count(item.applicationCount) ? { id: item.id, status: item.status, createdAt: item.createdAt,
      organizationCount: item.organizationCount, applicationCount: item.applicationCount } : null);
}
export function parseAdminOrganizations(value: unknown) {
  return page<AdminOrganization>(value, 'organizations', item => record(item) && adminUuid(item.id) && text(item.name, 120) && status(item.status) && date(item.createdAt) &&
    count(item.memberCount) && count(item.ownerCount) ? { id: item.id, name: item.name, status: item.status, createdAt: item.createdAt,
      memberCount: item.memberCount, ownerCount: item.ownerCount } : null);
}
function application(item: unknown): AdminApplication | null {
  if (!record(item) || !adminUuid(item.id) || !text(item.clientId, 80) || !text(item.name, 120) || !adminUuid(item.ownerPersonId) ||
      !['requested', 'active', 'suspended'].includes(String(item.status)) || !['unreviewed', 'first_party', 'external'].includes(String(item.trustClass)) ||
      !['web', 'wordpress'].includes(String(item.platform)) || !nullableDate(item.originVerifiedAt) ||
      !(item.reviewDecision === null || item.reviewDecision === 'approved' || item.reviewDecision === 'rejected')) return null;
  return { id: item.id, clientId: item.clientId, name: item.name, ownerPersonId: item.ownerPersonId,
    status: item.status as AdminApplication['status'], trustClass: item.trustClass as string, platform: item.platform as string,
    originVerifiedAt: item.originVerifiedAt, reviewDecision: item.reviewDecision };
}
export function parseAdminApplications(value: unknown) { return page(value, 'applications', application); }
export function parseAdminApplication(value: unknown): AdminApplicationDetail | null {
  if (!record(value) || value.contract !== adminContract || !record(value.application)) return null;
  const source = value.application;
  const base = application({ ...source, reviewDecision: null });
  if (!base || !text(source.redirectUri) || !text(source.logoutUri) || !(source.backchannelLogoutUri === null || text(source.backchannelLogoutUri)) ||
      !['discoverable', 'hidden'].includes(String(source.visibility)) || !['authenticated_open', 'grant_required'].includes(String(source.admission)) ||
      !(source.originVerifiedHost === null || text(source.originVerifiedHost, 253)) || !adminHash(source.configurationHash)) return null;
  let review: ApplicationReview | null = null;
  if (source.review !== null) {
    const item = source.review;
    if (!record(item) || !['approved', 'rejected'].includes(String(item.decision)) || !text(item.reference, 120) ||
        !adminUuid(item.reviewerPersonId) || !date(item.reviewedAt) || !adminHash(item.configurationHash)) return null;
    review = { decision: item.decision as ApplicationReview['decision'], reference: item.reference,
      reviewerPersonId: item.reviewerPersonId, reviewedAt: item.reviewedAt, configurationHash: item.configurationHash };
  }
  const { reviewDecision: _unused, ...detail } = base;
  return { ...detail, redirectUri: source.redirectUri, logoutUri: source.logoutUri, backchannelLogoutUri: source.backchannelLogoutUri,
    visibility: source.visibility as string, admission: source.admission as string, originVerifiedHost: source.originVerifiedHost,
    configurationHash: source.configurationHash, review };
}
export function parseAdminAudit(value: unknown) {
  return page<AdminAuditEvent>(value, 'events', item => record(item) && text(item.id, 20) && /^\d+$/.test(item.id) &&
    (item.actorPersonId === null || adminUuid(item.actorPersonId)) && text(item.action, 120) && text(item.targetType, 80) &&
    text(item.targetId, 120) && text(item.reference, 120) && date(item.occurredAt) ? { id: item.id, actorPersonId: item.actorPersonId,
      action: item.action, targetType: item.targetType, targetId: item.targetId, reference: item.reference, occurredAt: item.occurredAt } : null);
}

export type AdminListKind = 'people' | 'organizations' | 'applications' | 'audit';
export function adminListPath(kind: AdminListKind, q: unknown, after: unknown): string | null {
  if (q !== undefined && (typeof q !== 'string' || q.length > 120 || /[\x00-\x1f\x7f]/.test(q))) return null;
  if (kind === 'people' && typeof q === 'string' && q.trim() && !/^[0-9a-f][0-9a-f-]{3,35}$/i.test(q.trim())) return null;
  if (after !== undefined && (typeof after !== 'string' || !(kind === 'audit' ? /^[1-9][0-9]{0,18}$/.test(after) : adminUuid(after)))) return null;
  const params = new URLSearchParams();
  if (typeof q === 'string' && q.trim()) params.set('q', q.trim());
  if (typeof after === 'string') params.set('after', after);
  return `/v1/admin/${kind}${params.size ? `?${params}` : ''}`;
}
export function adminNextHref(kind: AdminListKind, q: unknown, after: string): string | null {
  const path = adminListPath(kind, q, after);
  return path ? path.replace('/v1/admin/', '/admin/') : null;
}

export const adminNotices: Record<string, string> = {
  approved: 'First-party review approved. The application is still inactive until the private operator completes domain and Keycloak checks.',
  rejected: 'Application review rejected. This configuration cannot be activated.',
  stale_application_review: 'This application changed while you were reviewing it. Check the current details before deciding.',
  application_review_unavailable: 'This application cannot be reviewed in its current state.',
  independent_reviewer_required: 'The application owner cannot review their own request. Ask another authorized reviewer.',
  origin_proof_required: 'The application owner must verify the callback domain before approval.',
  review_already_recorded: 'A decision has already been recorded for this configuration. Review the recorded decision.',
  invalid_application_review: 'Check the review reference and submit again.',
  unavailable: 'The review could not be confirmed. Check its current status before retrying.',
};

export function applicationState(app: Pick<AdminApplication, 'status' | 'reviewDecision'>) {
  if (app.status === 'active') return 'Active';
  if (app.status === 'suspended') return 'Suspended';
  return app.reviewDecision === 'approved' ? 'Approved · awaiting private activation' : app.reviewDecision === 'rejected' ? 'Review rejected' : 'Awaiting review';
}
