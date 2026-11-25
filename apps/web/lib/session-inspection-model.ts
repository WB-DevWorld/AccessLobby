import { adminContract, adminUuid } from './admin-model';

export type AppAssociation = { handle: string; clientId: string; applicationName: string | null;
  createdAt: string; expiresAt: string; receiptCount: number; expectedState: string };
export type SessionInspection = { person: { id: string; protectedOperator: boolean }; sessions: AppAssociation[]; nextCursor: string | null };
export const validSessionSnapshot = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function parseSessionInspection(value: unknown): SessionInspection | null {
  if (!record(value) || value.contract !== adminContract || !record(value.person) || !adminUuid(value.person.id) ||
      typeof value.person.protectedOperator !== 'boolean' || !Array.isArray(value.sessions) || value.sessions.length > 25 ||
      !(value.nextCursor === null || adminUuid(value.nextCursor))) return null;
  const sessions: AppAssociation[] = [];
  for (const item of value.sessions) {
    if (!record(item) || !adminUuid(item.handle) || typeof item.clientId !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(item.clientId) ||
        !(item.applicationName === null || typeof item.applicationName === 'string' && item.applicationName.length >= 2 && item.applicationName.length <= 120) ||
        !date(item.createdAt) || !date(item.expiresAt) || typeof item.receiptCount !== 'number' || !Number.isSafeInteger(item.receiptCount) || item.receiptCount < 1 ||
        !validSessionSnapshot(item.expectedState)) return null;
    sessions.push({ handle: item.handle, clientId: item.clientId, applicationName: item.applicationName,
      createdAt: item.createdAt, expiresAt: item.expiresAt, receiptCount: item.receiptCount, expectedState: item.expectedState });
  }
  return { person: { id: value.person.id, protectedOperator: value.person.protectedOperator }, sessions, nextCursor: value.nextCursor };
}
export const sessionInspectionNotices: Record<string, string> = {
  ended: 'The recorded app association has ended. Participating apps apply this on their next session check.',
  unchanged: 'This exact request was already completed. Fresh authentication associations were left alone.',
  app_session_snapshot_changed: 'This association changed after the page loaded. Review the current records before ending it.',
  app_session_not_found: 'That recorded association is no longer available. Check the current list.',
  app_session_end_already_recorded: 'A different ending request was already recorded for this handle. Check the current list.',
  protected_operator_person: 'Use the protected operator offboarding process for this person.',
  self_session_end_forbidden: 'Use your account sign-out controls for your own sessions.',
  person_session_unavailable: 'This person is unavailable for this action.',
  invalid_app_session_end: 'Check the change reference and current association before submitting again.',
  unavailable: 'The result could not be confirmed. Check the current records before retrying.',
};
