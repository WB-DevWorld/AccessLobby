export const applicationLifecycleContract = 'accesslobby.application-lifecycle.v0.1';
export type OwnerApplication = { id: string; clientId: string; name: string; platform: 'web' | 'wordpress';
  status: 'requested' | 'active' | 'suspended' | 'cancelled'; trustClass: 'unreviewed' | 'first_party' | 'external';
  redirectUri: string; logoutUri: string; backchannelLogoutUri: string | null;
  visibility: 'discoverable' | 'hidden'; admission: 'authenticated_open' | 'grant_required';
  originVerificationHost: string; originVerificationValue: string; originVerifiedAt: string | null;
  configurationHash: string; reviewDecision: 'approved' | 'rejected' | null };

export const lifecycleUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const lifecycleHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);

export function parseApplicationLifecycle(value: unknown): OwnerApplication | null {
  if (!record(value) || value.contract !== applicationLifecycleContract || !record(value.application)) return null;
  const a = value.application;
  if (!lifecycleUuid(a.id) || !text(a.clientId, 80) || !/^[a-z0-9_-]+$/.test(a.clientId) || !text(a.name, 120) ||
      !['web', 'wordpress'].includes(String(a.platform)) || !['requested', 'active', 'suspended', 'cancelled'].includes(String(a.status)) ||
      !['unreviewed', 'first_party', 'external'].includes(String(a.trustClass)) || !text(a.redirectUri, 2048) || !text(a.logoutUri, 2048) ||
      !(a.backchannelLogoutUri === null || text(a.backchannelLogoutUri, 2048)) ||
      !['discoverable', 'hidden'].includes(String(a.visibility)) || !['authenticated_open', 'grant_required'].includes(String(a.admission)) ||
      !text(a.originVerificationHost, 253) || !text(a.originVerificationValue, 160) ||
      !(a.originVerifiedAt === null || (text(a.originVerifiedAt, 40) && Number.isFinite(Date.parse(a.originVerifiedAt)))) ||
      !lifecycleHash(a.configurationHash) || !(a.reviewDecision === null || a.reviewDecision === 'approved' || a.reviewDecision === 'rejected')) return null;
  return { id: a.id, clientId: a.clientId, name: a.name, platform: a.platform as OwnerApplication['platform'],
    status: a.status as OwnerApplication['status'], trustClass: a.trustClass as OwnerApplication['trustClass'],
    redirectUri: a.redirectUri, logoutUri: a.logoutUri, backchannelLogoutUri: a.backchannelLogoutUri,
    visibility: a.visibility as OwnerApplication['visibility'], admission: a.admission as OwnerApplication['admission'],
    originVerificationHost: a.originVerificationHost, originVerificationValue: a.originVerificationValue,
    originVerifiedAt: a.originVerifiedAt, configurationHash: a.configurationHash, reviewDecision: a.reviewDecision };
}

export const applicationLifecycleNotices: Record<string, string> = {
  unchanged: 'This action was already recorded. No new change was made; the current request state is shown below.',
  edited: 'Change recorded. Verify the DNS record again and obtain a fresh independent review before activation.',
  cancelled: 'Cancellation recorded. The current request state is shown below; the application ID and client ID are retained.',
  resubmitted: 'Resubmission recorded. The request needs current domain proof and a fresh independent review.',
  stale_application_mutation: 'This request changed while the page was open. Review the current details and submit again.',
  application_mutation_conflict: 'A different change was already recorded for that page version. Review the current details before another change.',
  application_lifecycle_unavailable: 'This operation is available only for an inactive, unreviewed request in the appropriate state.',
  invalid_application_mutation: 'Check the change reference and current request version.',
  too_many_application_requests: 'You already have ten pending requests. Cancel or complete one before resubmitting another.',
  invalid_application_name: 'Use an application name between 2 and 120 characters.',
  invalid_application_platform: 'Choose Web application or WordPress.',
  invalid_application_url: 'Use exact callback and logout URLs for the chosen platform.',
  application_origin_mismatch: 'Callback, logout and backchannel URLs must share the same origin.',
  application_path_mismatch: 'WordPress callback and logout must use the same wp-login.php path.',
  invalid_visibility: 'Choose a valid visibility setting.',
  invalid_admission: 'Choose a valid entry policy.',
  identity_unavailable: 'The result could not be confirmed. Check the current request before retrying.',
};

export function ownerApplicationState(status: OwnerApplication['status']) {
  return status === 'cancelled' ? 'Cancelled' : status === 'active' ? 'Active' : status === 'suspended' ? 'Suspended' : 'Requested';
}
