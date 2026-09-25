/** Independent OIDC relying-party example; no AccessLobby source imports. */
import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { mayViewPrivate } from './policy.mjs';

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
const grants = new Set((process.env.GRANTED_PERSON_IDS || '').split(',').filter(Boolean));
const secure = new URL(origin).protocol === 'https:';
const flowName = secure ? '__Host-ref-flow' : 'ref-flow';
const sessionName = secure ? '__Host-ref-session' : 'ref-session';
const flows = new Map();
const sessions = new Map();
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
  if (path.pathname === '/login' && request.method === 'GET') {
    const doc = await discover();
    const id = random(), state = random(), nonce = random(), verifier = random();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    flows.set(id, { state, nonce, verifier, expires: Date.now() + 300000 });
    const authorization = new URL(doc.authorization_endpoint);
    for (const [name, value] of Object.entries({ client_id: clientId, redirect_uri: callback, response_type: 'code',
      scope: 'openid profile email', state, nonce, code_challenge: challenge, code_challenge_method: 'S256' })) {
      authorization.searchParams.set(name, value);
    }
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
    if (identity.nonce !== pending.nonce || !identity.sub) throw new Error('ID token subject/nonce rejected');
    const { payload: access } = await jwtVerify(tokens.access_token, jwks,
      { issuer, audience: 'accesslobby-api', algorithms: ['RS256'], clockTolerance: 5 });
    if (access.azp !== clientId || access.sub !== identity.sub) throw new Error('Access token client/subject rejected');
    const personResponse = await fetch(`${api}/v1/me`, { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(5000) });
    if (!personResponse.ok) throw new Error('Identity resolution rejected');
    const result = await personResponse.json();
    if (result.contract !== 'accesslobby.identity.v0.1' || !result.person?.id || result.person.status !== 'active') {
      throw new Error('Identity response rejected');
    }
    const id = random();
    sessions.set(id, { personId: result.person.id, issuer, subject: identity.sub,
      expires: Date.now() + Math.min(3600, tokens.expires_in || 3600) * 1000 });
    return redirect(response, '/', [cookie(flowName, '', 0), cookie(sessionName, id, 3600)]);
  }
  if (path.pathname === '/logout' && request.method === 'POST') {
    if (request.headers.origin !== origin) return send(response, 403, 'Origin rejected');
    sessions.delete(jar[sessionName]);
    let destination = '/';
    try {
      const doc = await discover();
      const logout = new URL(doc.end_session_endpoint);
      logout.searchParams.set('client_id', clientId);
      logout.searchParams.set('post_logout_redirect_uri', `${origin}/`);
      destination = logout.href;
    } catch { /* The local session is cleared even when the issuer is down. */ }
    return redirect(response, destination, [cookie(sessionName, '', 0)]);
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
    ? `<p>Signed in as AccessLobby person <code>${html(active.personId)}</code>.</p><p><a href="/private">Try consumer resource</a></p><form method="post" action="/logout"><button>Sign out</button></form>`
    : '<p>No consumer session.</p><a href="/login">Sign in with AccessLobby</a>';
  return send(response, 200, `<!doctype html><html lang="en"><meta charset="utf-8"><title>Reference consumer</title><h1>Independent OIDC consumer</h1>${content}</html>`);
}
http.createServer((request, response) => handle(request, response).catch(() => send(response, 502, 'Authentication service unavailable')))
  .listen(new URL(origin).port || (secure ? 443 : 80));
