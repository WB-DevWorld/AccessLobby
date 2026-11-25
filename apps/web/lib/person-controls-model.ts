import { adminContract, adminUuid } from './admin-model';

export type AdminPersonDetail = {
  id: string; status: 'active' | 'suspended'; createdAt: string; organizationCount: number;
  applicationCount: number; protectedOperator: boolean; statusVersion: string;
};
export const validPersonVersion = (value: unknown): value is string => typeof value === 'string' &&
  /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) < 9223372036854775807n;
export const validPersonReference = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9._:/-]{4,120}$/.test(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function parseAdminPersonDetail(value: unknown): AdminPersonDetail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.contract !== adminContract || !body.person || typeof body.person !== 'object' || Array.isArray(body.person)) return null;
  const person = body.person as Record<string, unknown>;
  if (!adminUuid(person.id) || (person.status !== 'active' && person.status !== 'suspended') ||
      typeof person.createdAt !== 'string' || person.createdAt.length > 40 || !Number.isFinite(Date.parse(person.createdAt)) ||
      !count(person.organizationCount) || !count(person.applicationCount) || typeof person.protectedOperator !== 'boolean' ||
      !validPersonVersion(person.statusVersion)) return null;
  return { id: person.id, status: person.status, createdAt: person.createdAt, organizationCount: person.organizationCount,
    applicationCount: person.applicationCount, protectedOperator: person.protectedOperator, statusVersion: person.statusVersion };
}

export const personControlNotices: Record<string, string> = {
  suspended: 'Person suspended. Current AccessLobby requests are denied and existing peer-session receipts have ended.',
  reenabled: 'Person re-enabled. A fresh authentication response is required before this person can use AccessLobby again.',
  unchanged: 'This person already has that status. No new change was recorded.',
  stale_person_change: 'This record changed after the page loaded. Review its current status before trying again.',
  protected_operator_person: 'This person holds a platform operator role. Use the protected operator offboarding process.',
  self_status_change_forbidden: 'You cannot change your own person status here.',
  invalid_person_change: 'Check the change reference and current page before submitting again.',
  person_not_found: 'This person is unavailable.',
  unavailable: 'The result could not be confirmed. Check the current status before retrying.',
};
