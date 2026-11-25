import { adminUuid } from './admin-model';

export const applicationSuspensionContract = 'accesslobby.application-suspension.v0.1';
export const validApplicationVersion = (value: unknown): value is string => typeof value === 'string' &&
  /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) < 9223372036854775807n;
export const validSuspensionReference = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9._:/-]{4,120}$/.test(value);
export type ApplicationSuspensionDetail = {
  application: { id: string; clientId: string; name: string; status: 'requested' | 'cancelled' | 'active' | 'suspended';
    trustClass: 'unreviewed' | 'first_party' | 'external'; version: string; suspendedAt: string | null; suspensionReference: string | null };
  canSuspend: boolean;
};
export function parseApplicationSuspensionDetail(value: unknown): ApplicationSuspensionDetail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.contract !== applicationSuspensionContract || !body.application || typeof body.application !== 'object' ||
    Array.isArray(body.application) || typeof body.canSuspend !== 'boolean') return null;
  const app = body.application as Record<string, unknown>;
  if (!adminUuid(app.id) || typeof app.clientId !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(app.clientId) ||
    typeof app.name !== 'string' || app.name.length < 2 || app.name.length > 120 || !validApplicationVersion(app.version) ||
    !['requested', 'cancelled', 'active', 'suspended'].includes(String(app.status)) ||
    !['unreviewed', 'first_party', 'external'].includes(String(app.trustClass)) ||
    (app.suspendedAt !== null && (typeof app.suspendedAt !== 'string' || app.suspendedAt.length > 40 || !Number.isFinite(Date.parse(app.suspendedAt)))) ||
    (app.suspensionReference !== null && !validSuspensionReference(app.suspensionReference))) return null;
  const expectedCanSuspend = app.status === 'active' && app.trustClass === 'first_party' &&
    !['accesslobby-web', 'accesslobby-api'].includes(app.clientId);
  if (body.canSuspend && !expectedCanSuspend) return null;
  return { application: { id: app.id, clientId: app.clientId, name: app.name,
    status: app.status as ApplicationSuspensionDetail['application']['status'],
    trustClass: app.trustClass as ApplicationSuspensionDetail['application']['trustClass'],
    version: app.version, suspendedAt: app.suspendedAt as string | null, suspensionReference: app.suspensionReference as string | null },
  canSuspend: body.canSuspend };
}
export const applicationSuspensionNotices: Record<string, string> = {
  suspended: 'Application suspended in AccessLobby. Admission is denied and existing peer-session receipts have ended.',
  unchanged: 'This exact suspension was already recorded. No additional change was made.',
  stale_application_suspension: 'This application changed after the page loaded. Review its current state before submitting again.',
  application_not_suspendable: 'Only an active first-party application can be suspended here.',
  suspension_confirmation_mismatch: 'The confirmation must exactly match this application’s client ID.',
  protected_application: 'Core AccessLobby services require their protected private operator process.',
  application_not_found: 'This application is unavailable.',
  invalid_application_suspension: 'Check the exact client ID, current page and change reference before submitting again.',
  unavailable: 'The result could not be confirmed. Inspect the current status before retrying.',
};
