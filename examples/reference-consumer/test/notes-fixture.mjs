// Disposable signed OIDC/API fixture; never imported by the application.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { SignJWT, exportJWK, generateKeyPair, jwtVerify } from 'jose';
import { BACKCHANNEL_EVENT } from '../logout.mjs';

const listen = async server => { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; };
const json = (response, body, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(body)); };
export async function notesFixture() {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(publicKey), kid: 'notes-fixture', alg: 'RS256', use: 'sig' };
  const clientId = 'enben-staging-open';
  const people = { alice: '8b233ee8-1111-4444-8888-e53089a74eca', bob: '8b233ee8-2222-4444-8888-e53089a74eca' };
  const codes = new Map();
  let origin, upstreamOrigin, issuer, entry = 'allowed', browserUser = 'alice';
  const jwt = (claims, audience, user) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuer(issuer).setAudience(audience).setSubject(user).setIssuedAt().setExpirationTime('10m').sign(privateKey);
  const upstream = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, upstreamOrigin);
      if (path.pathname.endsWith('/.well-known/openid-configuration')) return json(response, { issuer,
        authorization_endpoint: `${issuer}/protocol/openid-connect/auth`, token_endpoint: `${issuer}/protocol/openid-connect/token`,
        jwks_uri: `${issuer}/protocol/openid-connect/certs`, end_session_endpoint: `${issuer}/protocol/openid-connect/logout` });
      if (path.pathname.endsWith('/certs')) return json(response, { keys: [jwk] });
      if (path.pathname.endsWith('/auth')) {
        if (path.searchParams.get('client_id') !== clientId || path.searchParams.get('redirect_uri') !== `${origin}/callback` || path.searchParams.get('code_challenge_method') !== 'S256') return json(response, {}, 400);
        const user = path.searchParams.get('fixture_user') || browserUser;
        if (!people[user]) return json(response, {}, 400);
        const code = randomUUID();
        codes.set(code, { user, nonce: path.searchParams.get('nonce'), challenge: path.searchParams.get('code_challenge') });
        const callback = new URL(`${origin}/callback`);
        callback.searchParams.set('code', code); callback.searchParams.set('state', path.searchParams.get('state'));
        response.writeHead(303, { location: callback.href }); return response.end();
      }
      if (path.pathname.endsWith('/token')) {
        let body = ''; for await (const chunk of request) body += chunk;
        const fields = new URLSearchParams(body), code = codes.get(fields.get('code'));
        codes.delete(fields.get('code'));
        if (!code || fields.get('client_id') !== clientId || fields.get('redirect_uri') !== `${origin}/callback` ||
            createHash('sha256').update(fields.get('code_verifier') || '').digest('base64url') !== code.challenge) return json(response, {}, 400);
        return json(response, { id_token: await jwt({ nonce: code.nonce, sid: `fixture-${code.user}` }, clientId, code.user),
          access_token: await jwt({ azp: clientId }, 'accesslobby-api', code.user), expires_in: 600 });
      }
      if (path.pathname === '/health/ready') return json(response, { status: 'ready' });
      const { payload } = await jwtVerify((request.headers.authorization || '').replace(/^Bearer /, ''), publicKey, { issuer, audience: 'accesslobby-api' });
      if (!people[payload.sub]) return json(response, {}, 401);
      if (path.pathname === '/v1/me') return json(response, { contract: 'accesslobby.identity.v0.1', person: { id: people[payload.sub], status: 'active' } });
      if (path.pathname === '/v1/application-entry') return entry === 'allowed'
        ? json(response, { contract: 'accesslobby.app-entry.v0.1', applicationId: '8b233ee8-3333-4444-8888-e53089a74eca', clientId, admitted: true })
        : json(response, { error: 'application_entry_denied' }, entry === 'denied' ? 403 : 503);
      return json(response, {}, 404);
    } catch { return json(response, {}, 401); }
  });
  upstreamOrigin = `http://127.0.0.1:${await listen(upstream)}`;
  issuer = `${upstreamOrigin}/realms/accesslobby-first-party`;
  const reservation = createServer();
  const port = await listen(reservation); await new Promise(resolve => reservation.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(port), CONSUMER_ORIGIN: origin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId,
      ACCESSLOBBY_API_URL: upstreamOrigin, NOTES_ENABLED: 'true', APP_ENTRY_REQUIRED: 'true', PUBLIC_REGISTRATION_ENABLED: 'false', GRANTED_PERSON_IDS: '' }, stdio: 'ignore' });
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    await new Promise(resolve => upstream.close(resolve));
  };
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { ready = (await fetch(`${origin}/health/live`)).ok; if (ready) break; } catch { /* startup */ }
      if (child.exitCode !== null) throw new Error('Notes fixture app exited'); await delay(50);
    }
    assert.equal(ready, true);
  } catch (error) { await close(); throw error; }
  return { origin, issuer, clientId, close,
    setEntry: value => { entry = value; }, setBrowserUser: user => { browserUser = user; },
    logoutToken: user => jwt({ sid: `fixture-${user}`, jti: randomUUID(), events: { [BACKCHANNEL_EVENT]: {} } }, clientId, user),
    async login(user) {
      const start = await fetch(`${origin}/login`, { redirect: 'manual' });
      const authorization = new URL(start.headers.get('location')); authorization.searchParams.set('fixture_user', user);
      const authorized = await fetch(authorization, { redirect: 'manual' });
      const callback = await fetch(authorized.headers.get('location'), { redirect: 'manual', headers: { cookie: start.headers.getSetCookie()[0].split(';')[0] } });
      assert.equal(callback.status, 303);
      if (callback.headers.get('location') === '/account-choice') {
        const pending = callback.headers.getSetCookie().find(value => value.startsWith('ref-pending=')).split(';')[0];
        const joined = await fetch(`${origin}/join`, { method: 'POST', redirect: 'manual', headers: { origin, cookie: pending } });
        assert.equal(joined.status, 303);
        return joined.headers.getSetCookie().find(value => value.startsWith('ref-session=')).split(';')[0];
      }
      return callback.headers.getSetCookie().find(value => value.startsWith('ref-session=')).split(';')[0];
    },
  };
}
