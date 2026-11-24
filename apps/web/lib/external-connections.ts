// This preview does not activate an external application or issue external identity tokens.
export const externalConnectionContract = 'accesslobby.external-preview.v0.2';
export const externalConnectionPolicy = 'external-minimal-v0.1';
export const connectionId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export interface ConnectionReview {
  applicationId: string; name: string; origin: string; fingerprint: string;
  policyVersion: typeof externalConnectionPolicy; scopes: ['openid']; state: 'granted' | 'not-granted';
}
export interface ConnectionSummary {
  applicationId: string; name: string; origin: string | null; state: 'granted' | 'withdrawn';
  reviewAvailable: boolean; consentCurrent: boolean;
}
const originValue = (v: unknown): v is string => {
  if (typeof v !== 'string') return false;
  try { const url = new URL(v); return url.protocol === 'https:' && url.origin === v && !url.username && !url.password; }
  catch { return false; }
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const name = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120;
export function parseConnectionReview(value: unknown, applicationId: string): ConnectionReview | null {
  if (!record(value) || value.contract !== externalConnectionContract || value.applicationId !== applicationId ||
      !connectionId(applicationId) || !name(value.name) || !originValue(value.origin) || typeof value.fingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.fingerprint) || value.policyVersion !== externalConnectionPolicy ||
      !Array.isArray(value.scopes) || value.scopes.length !== 1 || value.scopes[0] !== 'openid' ||
      !['granted', 'not-granted'].includes(String(value.state)) || value.activationAllowed !== false || value.iamProvisioned !== false) return null;
  return { applicationId, name: value.name, origin: value.origin, fingerprint: value.fingerprint,
    policyVersion: externalConnectionPolicy, scopes: ['openid'], state: value.state as ConnectionReview['state'] };
}
export function parseConnections(value: unknown): ConnectionSummary[] | null {
  if (!record(value) || value.contract !== externalConnectionContract || value.activationAllowed !== false || !Array.isArray(value.consents)) return null;
  const result: ConnectionSummary[] = [];
  for (const row of value.consents) {
    if (!record(row) || typeof row.applicationId !== 'string' || !connectionId(row.applicationId) || !name(row.name) ||
        (row.origin !== null && !originValue(row.origin)) || !['granted', 'withdrawn'].includes(String(row.state)) ||
        typeof row.reviewAvailable !== 'boolean' || typeof row.consentCurrent !== 'boolean' || row.activationAllowed !== false) return null;
    result.push({ applicationId: row.applicationId, name: row.name, origin: row.origin as string | null,
      state: row.state as ConnectionSummary['state'], reviewAvailable: row.reviewAvailable, consentCurrent: row.consentCurrent });
  }
  return result;
}
export function connectionAction(form: FormData) {
  const appId = form.get('applicationId'), intent = form.get('intent');
  if (typeof appId !== 'string' || !connectionId(appId)) return null;
  const path = `/v1/preview/external-consents/${appId}`;
  if (intent === 'withdraw') return { path, method: 'DELETE', notice: 'withdrawn' };
  const fingerprint = form.get('fingerprint');
  if (intent !== 'grant' || form.get('approval') !== 'openid' || form.get('policyVersion') !== externalConnectionPolicy ||
      typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) return null;
  return { path, method: 'POST', notice: 'granted', body: { policyVersion: externalConnectionPolicy, scopes: ['openid'], fingerprint } };
}

/** Narrow post-login continuation for the inactive preview, never a general redirect allowlist. */
export function connectionReturnPath(value: unknown, enabled: boolean): string | null {
  if (!enabled || typeof value !== 'string') return null;
  if (value === '/connections') return value;
  return value.startsWith('/connections/') && connectionId(value.slice('/connections/'.length)) ? value : null;
}
