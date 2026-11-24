/** Privacy gate on ALREADY cryptographically validated claims; this never verifies or issues a JWT. */
export interface ExternalExposure {
  clientId: string; subject: string; apiAudience: string;
  idToken: Record<string, unknown>; accessToken: Record<string, unknown>; userInfo: Record<string, unknown>;
}
interface Finding { client: number; surface: 'idToken' | 'accessToken' | 'userInfo' | 'profile'; code: string; claim?: string }
const permitted = {
  idToken: new Set(['iss', 'sub', 'aud', 'azp', 'exp', 'iat', 'auth_time', 'nonce', 'at_hash', 'c_hash', 'acr', 'amr', 'sid', 'jti']),
  accessToken: new Set(['iss', 'sub', 'aud', 'azp', 'exp', 'iat', 'auth_time', 'scope', 'typ', 'sid', 'jti', 'acr', 'amr']),
  userInfo: new Set(['sub'])
};
const values = (value: unknown): string[] => typeof value === 'string' ? [value] :
  Array.isArray(value) ? value.flatMap(values) : value && typeof value === 'object' ? Object.values(value).flatMap(values) : [];
const audience = (value: unknown) => typeof value === 'string' ? [value] : Array.isArray(value) && value.every(v => typeof v === 'string') ? value : [];

export function auditExternalPrivacy(exposures: ExternalExposure[], forbiddenInternalIdentifiers: string[]) {
  const findings: Finding[] = [];
  exposures.forEach((exposure, index) => {
    const add = (surface: Finding['surface'], code: string, claim?: string) => findings.push({ client: index, surface, code, ...(claim ? { claim } : {}) });
    if (!/^alx_[A-Za-z0-9_-]{43}$/.test(exposure.subject)) add('profile', 'invalid_app_scoped_subject');
    if (!exposure.apiAudience || exposure.apiAudience === 'accesslobby-api') add('profile', 'first_party_api_audience_forbidden');
    for (const surface of ['idToken', 'accessToken', 'userInfo'] as const) {
      const claims = exposure[surface];
      if (claims.sub !== exposure.subject) add(surface, 'subject_contract_mismatch', 'sub');
      for (const key of Object.keys(claims)) {
        if (!permitted[surface].has(key)) add(surface, 'undeclared_claim', key);
      }
      for (const value of values(claims)) {
        if (forbiddenInternalIdentifiers.some(internal => internal.length >= 8 && value.includes(internal))) {
          add(surface, 'internal_identifier_exposed'); break;
        }
      }
      // Compare every emitted sub/sid/session identifier across every token surface.
      for (const key of ['sub', 'sid', 'session_state']) {
        const value = claims[key];
        if (typeof value === 'string' && exposures.some((other, otherIndex) => otherIndex !== index &&
          other.clientId !== exposure.clientId && ['idToken', 'accessToken', 'userInfo'].some(name =>
            (other[name as 'idToken' | 'accessToken' | 'userInfo'])[key] === value))) add(surface, 'cross_client_identifier', key);
      }
    }
    const idAudience = audience(exposure.idToken.aud), apiAudience = audience(exposure.accessToken.aud);
    if (idAudience.length !== 1 || idAudience[0] !== exposure.clientId) add('idToken', 'unexpected_audience', 'aud');
    if (apiAudience.length !== 1 || apiAudience[0] !== exposure.apiAudience || apiAudience.includes('accesslobby-api')) add('accessToken', 'unexpected_audience', 'aud');
    if (exposure.accessToken.scope !== 'openid') add('accessToken', 'undeclared_scopes', 'scope');
  });
  if (new Set(exposures.map(e => e.clientId)).size < 2) findings.push({ client: -1, surface: 'profile', code: 'independent_clients_required' });
  // Reports contain finding categories/claim names only, never identifiers, tokens or profile values.
  return { contract: 'accesslobby.external-privacy-audit.v0.1', passed: findings.length === 0, clients: exposures.length, findings };
}
