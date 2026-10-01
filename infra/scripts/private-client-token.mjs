/** Private operator process only: temporary realm client-management credential, never a public route. */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// The Admin REST create endpoint requires manage-clients; create-client alone is insufficient.
// This is realm-wide client management, not an IAM-enforced one-client permission.
export const operatorRoles = ['manage-clients', 'query-clients', 'view-clients'];

export async function withScopedClientToken({ base, issuer, adminToken, fetcher = fetch, verifyToken }, useToken) {
  const url = new URL(base);
  if (url.protocol !== 'http:' || !['iam', 'localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port !== '8080' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
    throw new Error('Protected internal IAM endpoint required');
  }
  if (new URL(issuer).pathname !== '/realms/accesslobby-first-party') throw new Error('Unexpected issuer realm');
  const realm = `${base}/admin/realms/accesslobby-first-party`;
  const temporaryName = `accesslobby-private-provision-${randomUUID()}`;
  let temporaryId;
  const admin = async (path, init = {}) => {
    const response = await fetcher(`${realm}${path}`, { ...init, headers: {
      authorization: `Bearer ${adminToken}`, ...(init.body ? { 'content-type': 'application/json' } : {}),
    }, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Private operator setup/readback failed (${response.status})`);
    return response;
  };
  try {
    const created = await admin('/clients', { method: 'POST', body: JSON.stringify({
      clientId: temporaryName, protocol: 'openid-connect', enabled: true, publicClient: false,
      clientAuthenticatorType: 'client-secret', serviceAccountsEnabled: true,
      standardFlowEnabled: false, implicitFlowEnabled: false, directAccessGrantsEnabled: false,
      fullScopeAllowed: false, defaultClientScopes: ['roles'], optionalClientScopes: [],
      attributes: { 'access.token.lifespan': '90', 'use.refresh.tokens': 'false' },
    }) });
    temporaryId = created.headers.get('location')?.split('/').at(-1);
    if (!temporaryId || !/^[a-f0-9-]{36}$/i.test(temporaryId)) throw new Error('Temporary operator client location missing');
    const management = await (await admin('/clients?clientId=realm-management')).json();
    if (management.length !== 1) throw new Error('Expected one realm-management client');
    const roles = await Promise.all(operatorRoles.map(async name =>
      (await admin(`/clients/${management[0].id}/roles/${name}`)).json()));
    const account = await (await admin(`/clients/${temporaryId}/service-account-user`)).json();
    await admin(`/users/${account.id}/role-mappings/clients/${management[0].id}`, {
      method: 'POST', body: JSON.stringify(roles),
    });
    await admin(`/clients/${temporaryId}/scope-mappings/clients/${management[0].id}`, {
      method: 'POST', body: JSON.stringify(roles),
    });
    const secret = await (await admin(`/clients/${temporaryId}/client-secret`)).json();
    const response = await fetcher(`${base}/realms/accesslobby-first-party/protocol/openid-connect/token`, {
      method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials',
        client_id: temporaryName, client_secret: secret.value }), redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Scoped operator sign-in failed (${response.status})`);
    const token = await response.json();
    if (typeof token.access_token !== 'string' || !Number.isFinite(token.expires_in) ||
        token.expires_in <= 0 || token.expires_in > 120 || token.refresh_token) {
      throw new Error('Expected a short-lived operator token without refresh');
    }
    if (!verifyToken) {
      const { createLocalJWKSet, jwtVerify } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('jose');
      const keys = await fetcher(`${base}/realms/accesslobby-first-party/protocol/openid-connect/certs`, {
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (!keys.ok) throw new Error('Operator signing-key check failed');
      const jwks = createLocalJWKSet(await keys.json());
      verifyToken = async raw => (await jwtVerify(raw, jwks, { issuer, algorithms: ['RS256'] })).payload;
    }
    const payload = await verifyToken(token.access_token);
    const actualRoles = payload.resource_access?.['realm-management']?.roles;
    if (payload.azp !== temporaryName || payload.sub !== account.id || !Array.isArray(actualRoles) ||
        JSON.stringify([...actualRoles].sort()) !== JSON.stringify([...operatorRoles].sort())) {
      throw new Error('Operator token contains unexpected client permissions');
    }
    return await useToken(token.access_token);
  } finally {
    // Resolve only our unpredictable name if creation succeeded but its response was lost.
    if (!temporaryId) {
      const found = await (await admin(`/clients?clientId=${temporaryName}`)).json();
      const matching = found.filter(client => client.clientId === temporaryName);
      if (matching.length > 1) throw new Error('Temporary operator cleanup requires investigation');
      temporaryId = matching[0]?.id;
    }
    if (temporaryId) {
      try { await admin(`/clients/${temporaryId}`, { method: 'DELETE' }); }
      catch { throw new Error('Temporary operator cleanup failed; check the private IAM audit before retrying'); }
    }
  }
}
