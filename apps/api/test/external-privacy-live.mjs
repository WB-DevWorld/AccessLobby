/** IAM-only negative privacy qualification; never logs tokens or activates external apps. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { auditExternalPrivacy } from '../src/external-privacy.ts';

const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.env.ALWP_DISPOSABLE_FIXTURE !== '1' || new URL(fixture.issuer).hostname !== '127.0.0.1') {
  throw new Error('Disposable loopback privacy fixture required');
}
const cookies = new Map();
let promptCount = 0;
const check = (condition, category) => { if (!condition) throw new Error(category); };
async function request(url, options = {}) {
  check(new URL(url).origin === new URL(fixture.issuer).origin, 'unexpected_issuer_origin');
  const response = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '), ...options.headers } });
  for (const item of response.headers.getSetCookie()) {
    const pair = item.split(';', 1)[0], split = pair.indexOf('=');
    cookies.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return response;
}
async function login(client, keys) {
  const verifier = randomBytes(32).toString('base64url'), state = randomBytes(24).toString('base64url'), nonce = randomBytes(24).toString('base64url');
  const authorize = new URL(fixture.issuer + '/protocol/openid-connect/auth');
  authorize.search = new URLSearchParams({ client_id: client.clientId, redirect_uri: client.callback, response_type: 'code',
    scope: 'openid', state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
  let response = await request(authorize), callback;
  for (let step = 0; step < 10; step++) {
    const location = response.headers.get('location');
    if (location) {
      const next = new URL(location, fixture.issuer);
      if (next.origin === new URL(client.callback).origin) { callback = next; break; }
      response = await request(next); continue;
    }
    check(response.status === 200, 'issuer_authentication_failed');
    const html = await response.text();
    const tag = (html.match(/<form\b[^>]*>/gi) ?? []).find(form => /id="kc-form-login"/.test(form));
    const action = tag?.match(/action="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    check(action, 'expected_login_form'); promptCount++;
    response = await request(action, { method: 'POST', body: new URLSearchParams({ username: 'shopper', password: fixture.password, credentialId: '' }) });
  }
  check(callback && callback.searchParams.get('state') === state && callback.searchParams.get('code'), 'invalid_callback');
  const exchange = await request(fixture.issuer + '/protocol/openid-connect/token', { method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.clientId, redirect_uri: client.callback,
      code: callback.searchParams.get('code'), code_verifier: verifier }) });
  check(exchange.status === 200, 'code_exchange_failed');
  const tokens = await exchange.json();
  const id = (await jwtVerify(tokens.id_token, keys, { issuer: fixture.issuer, audience: client.clientId, algorithms: ['RS256'] })).payload;
  check(id.nonce === nonce, 'invalid_nonce');
  const access = (await jwtVerify(tokens.access_token, keys, { issuer: fixture.issuer, audience: 'external-api-pilot', algorithms: ['RS256'] })).payload;
  const info = await request(fixture.issuer + '/protocol/openid-connect/userinfo', { headers: { authorization: 'Bearer ' + tokens.access_token } });
  check(info.status === 200, 'userinfo_failed');
  const api = await fetch(fixture.api + '/v1/me', { headers: { authorization: 'Bearer ' + tokens.access_token } });
  check(api.status === 401, 'external_probe_must_not_enter_first_party_api');
  return { clientId: client.clientId, subject: id.sub, apiAudience: 'external-api-pilot', idToken: id, accessToken: access, userInfo: await info.json() };
}
try {
  const keys = createRemoteJWKSet(new URL(fixture.issuer + '/protocol/openid-connect/certs'));
  const exposures = [];
  for (const client of fixture.privacyClients) exposures.push(await login(client, keys));
  check(promptCount === 1, 'second_probe_must_reuse_same_browser_sso');
  const audit = auditExternalPrivacy(exposures, [fixture.privateProviderSubject]);
  check(!audit.passed, 'external_gate_must_remain_closed');
  const report = { ...audit, evidenceType: 'REAL_IAM_NEGATIVE_PRIVACY_PROBE',
    pairwiseSubjectsDiffer: exposures[0].idToken.sub !== exposures[1].idToken.sub,
    oneCredentialPrompt: promptCount === 1, externalApiRejected: true, externalApplicationsActivated: 0 };
  writeFileSync(fixture.artifactDir + '/external-privacy.json', JSON.stringify(report, null, 2) + '\n');
  console.log('PRIVACY_PROBE_PASS real pairwise tokens tested; external activation correctly remains blocked');
} catch (error) {
  const category = /^[a-z_]{1,80}$/.test(error.message ?? '') ? error.message : 'fixture_or_verification_failure';
  console.error('PRIVACY_PROBE_FAILED ' + category); process.exitCode = 1;
}
