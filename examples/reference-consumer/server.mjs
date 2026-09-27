/** Independent OIDC relying-party example; no AccessLobby source imports. */
import http from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { mayViewPrivate } from './policy.mjs';
import { verifyLogoutToken, removeSessions } from './logout.mjs';
import { AccountLinks } from './account-links.mjs';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const origin = required('CONSUMER_ORIGIN');
const issuer = required('OIDC_ISSUER');
const clientId = required('OIDC_CLIENT_ID');
const api = required('ACCESSLOBBY_API_URL');
const callback = `${origin}/callback`;
const port = Number(process.env.PORT || '4000');
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const grants = new Set((process.env.GRANTED_PERSON_IDS || '').split(',').filter(Boolean));
const secure = new URL(origin).protocol === 'https:';
const flowName = secure ? '__Host-ref-flow' : 'ref-flow';
const sessionName = secure ? '__Host-ref-session' : 'ref-session';
const legacyName = secure ? '__Host-ref-legacy' : 'ref-legacy';
const flows = new Map();
const sessions = new Map();
const legacySessions = new Map();
const legacyFailures = new Map();
const links = new AccountLinks();
const processedLogoutTokens = new Map();
for (const url of [origin, issuer, api]) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('HTTPS required outside localhost');
  }
}
if (new URL(origin).pathname !== '/' || new URL(origin).search) throw new Error('CONSUMER_ORIGIN must be an origin');
const random = () => randomBytes(32).toString('base64url');
const cookie = (name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
const cookies = request => Object.fromEntries((request.headers.cookie || '').split(';').map(part => part.trim().split('=', 2)).filter(pair => pair.length === 2));
const send = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(body);
};
const redirect = (response, location, setCookies = []) => send(response, 303, '', { location, 'set-cookie': setCookies });
const html = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
async function discover() {
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Discovery failed');
  const doc = await response.json();
  if (doc.issuer !== issuer) throw new Error('Issuer mismatch');
  for (const item of [doc.authorization_endpoint, doc.token_endpoint, doc.jwks_uri, doc.end_session_endpoint]) {
    if (new URL(item).origin !== new URL(issuer).origin) throw new Error('OIDC endpoint origin mismatch');
  }
  return doc;
}
async function handle(request, response) {
  const path = new URL(request.url, origin);
  const jar = cookies(request);
  const legacy = legacySessions.get(jar[legacyName]);
  const activeLegacy = legacy && legacy.expires > Date.now() ? legacy : null;
  if (path.pathname === '/legacy-login' && request.method === 'POST') {
    if (!process.env.LEGACY_TEST_USERNAME || !process.env.LEGACY_TEST_PASSWORD_SCRYPT) return send(response, 404, 'Not found');
    if (request.headers.origin !== origin) return send(response, 403, 'Origin rejected');
    const remote = request.socket.remoteAddress || 'unknown';
    const attempts = legacyFailures.get(remote) || { count: 0, until: Date.now() + 300000 };
    if (attempts.until < Date.now()) { attempts.count = 0; attempts.until = Date.now() + 300000; }
    if (attempts.count >= 5) return send(response, 429, 'Try later');
    let body = '';
    for await (const chunk of request) {
      body += chunk.toString();
      if (body.length > 1024) return send(response, 413, 'Form too large');
    }
    const fields = new URLSearchParams(body);
    const [salt, expected] = (process.env.LEGACY_TEST_PASSWORD_SCRYPT || '').split(':');
    const actual = salt && fields.get('password') ? scryptSync(fields.get('password'), salt, 32) : null;
    const expectedBytes = expected ? Buffer.from(expected, 'base64url') : null;
    if (!process.env.LEGACY_TEST_USERNAME || fields.get('username') !== process.env.LEGACY_TEST_USERNAME ||
        !actual || !expectedBytes || expectedBytes.length !== 32 || !timingSafeEqual(actual, expectedBytes)) {
      attempts.count++;
      legacyFailures.set(remote, attempts);
      return send(response, 401, 'Legacy account authentication failed');
    }
    legacyFailures.delete(remote);
    const id = random();
    legacySessions.set(id, { localUserId: 'legacy-pilot', expires: Date.now() + 300000 });
    return redirect(response, '/', [cookie(legacyName, id, 300)]);
  }
  if (((path.pathname === '/login' || path.pathname === '/register') && request.method === 'GET') ||
      (path.pathname === '/connect' && request.method === 'POST')) {
    if (path.pathname === '/connect' && request.headers.origin !== origin) return send(response, 403, 'Origin rejected');
    if (path.pathname === '/connect' && !activeLegacy) return send(response, 401, 'Sign in to your existing peer account first');
    const doc = await discover();
    const id = random(), state = random(), nonce = random(), verifier = random();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const intent = path.pathname === '/connect' ? 'link' : path.pathname === '/register' ? 'join' : 'login';
    flows.set(id, { state, nonce, verifier, intent, localUserId: activeLegacy?.localUserId, expires: Date.now() + 300000 });
    const authorization = new URL(doc.authorization_endpoint);
    for (const [name, value] of Object.entries({ client_id: clientId, redirect_uri: callback, response_type: 'code',
      scope: 'openid profile email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })) {
      authorization.searchParams.set(name, value);
    }
    if (path.pathname === '/register') authorization.searchParams.set('prompt', 'create');
    if (path.pathname === '/connect') authorization.searchParams.set('prompt', 'login');
    return redirect(response, authorization.href, [cookie(flowName, id, 300)]);
  }
  if (path.pathname === '/callback' && request.method === 'GET') {
    const pending = flows.get(jar[flowName]);
    flows.delete(jar[flowName]);
    if (!pending || pending.expires < Date.now() || path.searchParams.get('state') !== pending.state ||
        !path.searchParams.get('code') || path.searchParams.has('error')) {
      return send(response, 400, 'Login callback rejected', { 'set-cookie': [cookie(flowName, '', 0)] });
    }
    const doc = await discover();
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: callback,
      code: path.searchParams.get('code'), code_verifier: pending.verifier });
    const tokenResponse = await fetch(doc.token_endpoint, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!tokenResponse.ok) throw new Error('Token exchange rejected');
    const tokens = await tokenResponse.json();
    if (!tokens.id_token || !tokens.access_token) throw new Error('Missing tokens');
    const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
    const { payload: identity } = await jwtVerify(tokens.id_token, jwks,
      { issuer, audience: clientId, algorithms: ['RS256'], clockTolerance: 5 });
    if (identity.nonce !== pending.nonce || !identity.sub || typeof identity.sid !== 'string') throw new Error('ID token subject/nonce/session rejected');
    const { payload: access } = await jwtVerify(tokens.access_token, jwks,
      { issuer, audience: 'accesslobby-api', algorithms: ['RS256'], clockTolerance: 5 });
    if (access.azp !== clientId || access.sub !== identity.sub) throw new Error('Access token client/subject rejected');
    const personResponse = await fetch(`${api}/v1/me`, { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(5000) });
    if (!personResponse.ok) throw new Error('Identity resolution rejected');
    const result = await personResponse.json();
    if (result.contract !== 'accesslobby.identity.v0.1' || !result.person?.id || result.person.status !== 'active') {
      throw new Error('Identity response rejected');
    }
    let localUserId;
    if (pending.intent === 'link') {
      const stillLegacy = legacySessions.get(jar[legacyName]);
      if (!stillLegacy || stillLegacy.expires < Date.now() || stillLegacy.localUserId !== pending.localUserId) {
        return send(response, 401, 'Existing account authentication expired');
      }
      try { localUserId = links.link(issuer, identity.sub, result.person.id, stillLegacy.localUserId); }
      catch { return send(response, 409, 'Account link conflict; review this account before continuing'); }
    } else if (pending.intent === 'join') {
      localUserId = links.join(issuer, identity.sub, result.person.id);
    } else {
      localUserId = links.find(issuer, identity.sub, result.person.id);
      if (!localUserId) return send(response, 409, 'No peer account linked. Join as new or connect your existing account.');
    }
    const id = random();
    sessions.set(id, { personId: result.person.id, localUserId, issuer, subject: identity.sub, sid: identity.sid,
      expires: Date.now() + Math.min(3600, tokens.expires_in || 3600) * 1000 });
    return redirect(response, '/', [cookie(flowName, '', 0), cookie(sessionName, id, 3600)]);
  }
  if (path.pathname === '/logout' && request.method === 'POST') {
    if (request.headers.origin !== origin) return send(response, 403, 'Origin rejected');
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
      if (chunks.reduce((total, item) => total + item.length, 0) > 1024) return send(response, 413, 'Form too large');
    }
    const scope = new URLSearchParams(Buffer.concat(chunks).toString()).get('scope');
    if (scope !== 'current' && scope !== 'all') return send(response, 400, 'Choose a sign-out scope');
    sessions.delete(jar[sessionName]);
    let destination = '/';
    if (scope === 'all') {
      try {
        const doc = await discover();
        const logout = new URL(doc.end_session_endpoint);
        logout.searchParams.set('client_id', clientId);
        logout.searchParams.set('post_logout_redirect_uri', `${origin}/`);
        destination = logout.href;
      } catch { destination = '/?error=shared_logout_unavailable'; }
    }
    return redirect(response, destination, [cookie(sessionName, '', 0)]);
  }
  if (path.pathname === '/backchannel-logout' && request.method === 'POST') {
    if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
      return send(response, 415, 'Expected form data');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 16384) return send(response, 413, 'Form too large');
      chunks.push(chunk);
    }
    const token = new URLSearchParams(Buffer.concat(chunks).toString()).get('logout_token');
    if (!token) return send(response, 400, 'Missing logout token');
    try {
      const doc = await discover();
      const event = await verifyLogoutToken(token, createRemoteJWKSet(new URL(doc.jwks_uri)), issuer, clientId);
      const now = Date.now();
      for (const [jti, until] of processedLogoutTokens) if (until < now) processedLogoutTokens.delete(jti);
      if (processedLogoutTokens.has(event.jti)) return send(response, 400, 'Replay rejected');
      processedLogoutTokens.set(event.jti, now + 300000);
      removeSessions(sessions, event);
      return send(response, 200, 'OK');
    } catch { return send(response, 400, 'Invalid logout token'); }
  }
  const session = sessions.get(jar[sessionName]);
  const active = session && session.expires > Date.now() ? session : null;
  if (path.pathname === '/private') {
    if (!active) return send(response, 401, 'Sign in required');
    if (!mayViewPrivate(active.personId, grants)) return send(response, 403, 'Consumer resource denied');
    return send(response, 200, 'Consumer resource granted');
  }
  if (path.pathname !== '/') return send(response, 404, 'Not found');
  const content = active
    ? `<p>Signed in as AccessLobby person <code>${html(active.personId)}</code> with local peer account <code>${html(active.localUserId)}</code>.</p><p><a href="/private">Try consumer resource</a></p><form method="post" action="/logout"><p>Where would you like to sign out?</p><button name="scope" value="current">This app only</button> <button name="scope" value="all">All connected apps</button></form>`
    : `<p>No consumer session.</p><a href="/login">Sign in with AccessLobby</a> <a href="/register">Join as new</a>${activeLegacy ? ' <form method="post" action="/connect"><button>Connect your existing account</button></form>' : process.env.LEGACY_TEST_PASSWORD_SCRYPT ? '<form method="post" action="/legacy-login"><p>Existing account? Sign in to link it.</p><input name="username" autocomplete="username" required><input name="password" type="password" autocomplete="current-password" required><button>Sign in to old account</button></form>' : ''}`;
  const notice = path.searchParams.get('error') === 'shared_logout_unavailable'
    ? '<p role="alert">This app signed out, but sign-out from connected apps could not be completed. Try again later.</p>' : '';
  return send(response, 200, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Reference consumer</title><h1>Independent OIDC consumer</h1>${notice}${content}</html>`);
}
http.createServer((request, response) => handle(request, response).catch(() => send(response, 502, 'Authentication service unavailable')))
  .listen(port);
