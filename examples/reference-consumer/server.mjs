/** Independent OIDC relying-party example; no AccessLobby source imports. */
import http from 'node:http';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { mayViewPrivate } from './policy.mjs';
import { verifyLogoutToken, removeSessions } from './logout.mjs';
import { AccountLinks } from './account-links.mjs';
import { publicRegistrationEnabled } from './config.mjs';

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
const registrationEnabled = publicRegistrationEnabled();
const secure = new URL(origin).protocol === 'https:';
const flowName = secure ? '__Host-ref-flow' : 'ref-flow';
const sessionName = secure ? '__Host-ref-session' : 'ref-session';
const legacyName = secure ? '__Host-ref-legacy' : 'ref-legacy';
const pendingName = secure ? '__Host-ref-pending' : 'ref-pending';
const flows = new Map();
const sessions = new Map();
const legacySessions = new Map();
const pendingAccounts = new Map();
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
const page = ({ title, eyebrow = 'Reference app', heading = title, message = '', content = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(title)}</title>
<style>
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f7fb;color:#10203f}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#f5f8fd,#edf3fb);color:#10203f}main{width:min(760px,calc(100% - 32px));margin:48px auto}.brand{display:flex;align-items:center;gap:10px;font-weight:800;color:#07377d;margin-bottom:40px}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#1760df;color:#fff}.card{background:#fff;border:1px solid #d7e2f1;border-radius:24px;padding:clamp(24px,5vw,48px);box-shadow:0 18px 50px rgba(31,67,120,.10)}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-weight:800;font-size:.78rem;color:#0b5dde;margin:0 0 12px}h1{font-size:clamp(2rem,7vw,3.4rem);line-height:1.03;margin:0 0 18px}h2{font-size:1.2rem;margin:28px 0 12px}p{font-size:1.05rem;line-height:1.65;color:#526683}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.button,button{appearance:none;border:1px solid #bfd0e7;border-radius:12px;background:#fff;color:#10203f;font:inherit;font-weight:750;padding:13px 18px;min-height:48px;text-decoration:none;cursor:pointer}.button-primary{background:#145de0;border-color:#145de0;color:#fff}.button-danger{border-color:#d7a8a8;color:#8e2020}.panel{margin-top:22px;padding:18px;border-radius:16px;background:#edf4ff;border:1px solid #cbdcf8}.panel-warning{background:#fff8e9;border-color:#f1d397}.stack{display:grid;gap:14px}.stack form{margin:0}.muted{font-size:.92rem;color:#6c7f9e}.code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88rem;overflow-wrap:anywhere}.inline-form{display:inline}.legacy-form{display:grid;gap:12px;max-width:420px}.legacy-form label{font-weight:700}.legacy-form input{width:100%;min-height:46px;border:1px solid #bfd0e7;border-radius:10px;padding:10px 12px;font:inherit;background:#fff;color:#10203f}.identifier-list{display:grid;gap:12px}.identifier-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;border-bottom:1px solid #cbdcf8;padding-bottom:12px}.identifier-row:last-child{border-bottom:0;padding-bottom:0}.identifier-row p{margin:0}.identifier-row .copy-button{min-height:44px;padding:9px 13px}.identifier-note{margin:16px 0 0;font-size:.92rem}@media(max-width:560px){main{width:min(100% - 20px,760px);margin:20px auto}.card{padding:22px}.identifier-row{grid-template-columns:1fr}.identifier-row .copy-button{width:100%}}@media (prefers-color-scheme:dark){:root{background:#071326;color:#eef5ff}body{background:linear-gradient(180deg,#071326,#091a31);color:#eef5ff}.brand{color:#dbeaff}.card{background:#0d1d34;border-color:#294261}.eyebrow{color:#7fb0ff}p,.muted{color:#b7c9e6}.button,button{background:#102541;border-color:#365477;color:#eef5ff}.button-primary{background:#2d70e8;border-color:#2d70e8}.panel{background:#112a4c;border-color:#2d4e78}.panel-warning{background:#352a12;border-color:#745b21}.legacy-form input{background:#0a182c;border-color:#365477;color:#eef5ff}.identifier-row{border-color:#2d4e78}}
</style>
</head>
<body>
<main>
<div class="brand"><span class="brand-mark" aria-hidden="true">A</span><span>AccessLobby reference app</span></div>
<section class="card">
<p class="eyebrow">${html(eyebrow)}</p>
<h1>${html(heading)}</h1>
${message ? `<p>${html(message)}</p>` : ''}
${content}
</section>
</main>
<script>
document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(button.dataset.copy || '');
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Copy failed';
    }
    window.setTimeout(() => { button.textContent = original; }, 1800);
  });
});
</script>
</body>
</html>`;
const sendPage = (response, status, options, headers = {}) => send(response, status, page(options), headers);
const formBody = async (request, limit = 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) return null;
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString());
};
const clearAuthCookies = () => [cookie(flowName, '', 0), cookie(sessionName, '', 0), cookie(pendingName, '', 0)];

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

async function sharedLogoutDestination() {
  const doc = await discover();
  const logout = new URL(doc.end_session_endpoint);
  logout.searchParams.set('client_id', clientId);
  logout.searchParams.set('post_logout_redirect_uri', `${origin}/`);
  return logout.href;
}

function createConsumerSession(person, localUserId) {
  const id = random();
  sessions.set(id, {
    personId: person.personId,
    localUserId,
    issuer: person.issuer,
    subject: person.subject,
    sid: person.sid,
    expires: person.expires,
  });
  return id;
}

async function handle(request, response) {
  const path = new URL(request.url, origin);
  const jar = cookies(request);
  const legacy = legacySessions.get(jar[legacyName]);
  const activeLegacy = legacy && legacy.expires > Date.now() ? legacy : null;
  const pending = pendingAccounts.get(jar[pendingName]);
  const activePending = pending && pending.expires > Date.now() ? pending : null;

  if (path.pathname === '/legacy-login' && request.method === 'POST') {
    if (!process.env.LEGACY_TEST_USERNAME || !process.env.LEGACY_TEST_PASSWORD_SCRYPT) {
      return sendPage(response, 404, { title: 'Existing-account sign-in is not available', message: 'This reference app has no older account system configured.' });
    }
    if (request.headers.origin !== origin) return sendPage(response, 403, { title: 'Request rejected', message: 'Please use the form on this app to continue.' });
    const remote = request.socket.remoteAddress || 'unknown';
    const attempts = legacyFailures.get(remote) || { count: 0, until: Date.now() + 300000 };
    if (attempts.until < Date.now()) { attempts.count = 0; attempts.until = Date.now() + 300000; }
    if (attempts.count >= 5) return sendPage(response, 429, { title: 'Please wait before trying again', message: 'Too many unsuccessful attempts were made from this connection.' });
    const fields = await formBody(request);
    if (!fields) return sendPage(response, 413, { title: 'Form too large', message: 'Please return and try again.' });
    const [salt, expected] = (process.env.LEGACY_TEST_PASSWORD_SCRYPT || '').split(':');
    const actual = salt && fields.get('password') ? scryptSync(fields.get('password'), salt, 32) : null;
    const expectedBytes = expected ? Buffer.from(expected, 'base64url') : null;
    if (!process.env.LEGACY_TEST_USERNAME || fields.get('username') !== process.env.LEGACY_TEST_USERNAME ||
        !actual || !expectedBytes || expectedBytes.length !== 32 || !timingSafeEqual(actual, expectedBytes)) {
      attempts.count++;
      legacyFailures.set(remote, attempts);
      return sendPage(response, 401, { title: 'We could not sign in to the existing app account', message: 'Check the username and password and try again.' });
    }
    legacyFailures.delete(remote);
    const id = random();
    legacySessions.set(id, { localUserId: 'legacy-pilot', expires: Date.now() + 300000 });
    return redirect(response, activePending ? '/account-choice' : '/', [cookie(legacyName, id, 300)]);
  }

  if (((path.pathname === '/login' || path.pathname === '/register') && request.method === 'GET') ||
      (path.pathname === '/connect' && request.method === 'POST')) {
    if (path.pathname === '/register' && !registrationEnabled) {
      return sendPage(response, 404, {
        title: 'New AccessLobby accounts are not open here yet',
        message: 'You can still sign in with an existing AccessLobby account.',
        content: '<div class="actions"><a class="button button-primary" href="/login">Sign in</a><a class="button" href="/">Return home</a></div>',
      });
    }
    if (path.pathname === '/connect' && request.headers.origin !== origin) return sendPage(response, 403, { title: 'Request rejected', message: 'Please use the form on this app to continue.' });
    if (path.pathname === '/connect' && !activeLegacy) return sendPage(response, 401, { title: 'Sign in to your existing app account first', message: 'This confirms which older account should be connected.' });
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
    const pendingFlow = flows.get(jar[flowName]);
    flows.delete(jar[flowName]);
    if (!pendingFlow || pendingFlow.expires < Date.now() || path.searchParams.get('state') !== pendingFlow.state ||
        !path.searchParams.get('code') || path.searchParams.has('error')) {
      return sendPage(response, 400, {
        title: 'We could not complete sign-in',
        message: 'The sign-in request may have expired or already been used.',
        content: '<div class="actions"><a class="button button-primary" href="/login">Try signing in again</a><a class="button" href="/">Return home</a></div>',
      }, { 'set-cookie': [cookie(flowName, '', 0)] });
    }
    const doc = await discover();
    const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: callback,
      code: path.searchParams.get('code'), code_verifier: pendingFlow.verifier });
    const tokenResponse = await fetch(doc.token_endpoint, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    if (!tokenResponse.ok) throw new Error('Token exchange rejected');
    const tokens = await tokenResponse.json();
    if (!tokens.id_token || !tokens.access_token) throw new Error('Missing tokens');
    const jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
    const { payload: identity } = await jwtVerify(tokens.id_token, jwks,
      { issuer, audience: clientId, algorithms: ['RS256'], clockTolerance: 5 });
    if (identity.nonce !== pendingFlow.nonce || !identity.sub || typeof identity.sid !== 'string') throw new Error('ID token subject/nonce/session rejected');
    const { payload: access } = await jwtVerify(tokens.access_token, jwks,
      { issuer, audience: 'accesslobby-api', algorithms: ['RS256'], clockTolerance: 5 });
    if (access.azp !== clientId || access.sub !== identity.sub) throw new Error('Access token client/subject rejected');
    const personResponse = await fetch(`${api}/v1/me`, { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(5000) });
    if (!personResponse.ok) throw new Error('Identity resolution rejected');
    const result = await personResponse.json();
    if (result.contract !== 'accesslobby.identity.v0.1' || !result.person?.id || result.person.status !== 'active') {
      throw new Error('Identity response rejected');
    }
    const authenticated = {
      personId: result.person.id,
      issuer,
      subject: identity.sub,
      sid: identity.sid,
      expires: Date.now() + Math.min(3600, tokens.expires_in || 3600) * 1000,
    };
    let localUserId;
    if (pendingFlow.intent === 'link') {
      const stillLegacy = legacySessions.get(jar[legacyName]);
      if (!stillLegacy || stillLegacy.expires < Date.now() || stillLegacy.localUserId !== pendingFlow.localUserId) {
        return sendPage(response, 401, { title: 'The existing-account sign-in expired', message: 'Return to the app and start the connection again.' });
      }
      try { localUserId = links.link(issuer, identity.sub, result.person.id, stillLegacy.localUserId); }
      catch { return sendPage(response, 409, { title: 'This account needs review', message: 'The app found a conflicting account link and did not change anything.' }); }
    } else if (pendingFlow.intent === 'join') {
      localUserId = links.join(issuer, identity.sub, result.person.id);
    } else {
      localUserId = links.find(issuer, identity.sub, result.person.id);
      if (!localUserId) {
        const pendingId = random();
        pendingAccounts.set(pendingId, authenticated);
        return redirect(response, '/account-choice', [cookie(flowName, '', 0), cookie(pendingName, pendingId, 300)]);
      }
    }
    const sessionId = createConsumerSession(authenticated, localUserId);
    return redirect(response, '/', [cookie(flowName, '', 0), cookie(pendingName, '', 0), cookie(sessionName, sessionId, 3600)]);
  }

  if (path.pathname === '/account-choice' && request.method === 'GET') {
    if (!activePending) {
      return sendPage(response, 401, {
        title: 'Start sign-in again',
        message: 'The temporary account setup window has expired.',
        content: '<div class="actions"><a class="button button-primary" href="/login">Sign in</a><a class="button" href="/">Return home</a></div>',
      }, { 'set-cookie': [cookie(pendingName, '', 0)] });
    }
    const existingAccount = activeLegacy
      ? '<form method="post" action="/connect"><button type="submit">Connect the signed-in existing account</button></form>'
      : process.env.LEGACY_TEST_PASSWORD_SCRYPT
        ? `<form class="legacy-form" method="post" action="/legacy-login">
            <h2>Connect an existing app account</h2>
            <p class="muted">First confirm the username and password used by this app before AccessLobby was added.</p>
            <label>Username<input name="username" autocomplete="username" required></label>
            <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
            <button type="submit">Sign in to the existing app account</button>
          </form>`
        : '<p class="muted">This reference deployment has no older account system configured.</p>';
    return sendPage(response, 200, {
      title: 'Finish setting up this app',
      eyebrow: 'AccessLobby sign-in complete',
      heading: 'You are signed into AccessLobby',
      message: 'This app does not yet have a local account linked to your AccessLobby identity. Choose what should happen next.',
      content: `<div class="stack">
          <div class="panel">
            <h2>Create an account for this app</h2>
            <p>This creates only this app&apos;s local account and connects it to your AccessLobby identity.</p>
            <form method="post" action="/join"><button class="button-primary" type="submit">Create my account for this app</button></form>
          </div>
          <div class="panel">${existingAccount}</div>
          <form method="post" action="/logout-accesslobby"><button class="button-danger" type="submit">Sign out of AccessLobby</button></form>
        </div>`,
    });
  }

  if (path.pathname === '/join' && request.method === 'POST') {
    if (request.headers.origin !== origin) return sendPage(response, 403, { title: 'Request rejected', message: 'Please use the form on this app to continue.' });
    if (!activePending) return sendPage(response, 401, { title: 'Account setup expired', message: 'Sign in again to continue.' });
    let localUserId;
    try { localUserId = links.join(activePending.issuer, activePending.subject, activePending.personId); }
    catch { return sendPage(response, 409, { title: 'This app account already exists', message: 'Return home and sign in again.' }); }
    pendingAccounts.delete(jar[pendingName]);
    const sessionId = createConsumerSession(activePending, localUserId);
    return redirect(response, '/', [cookie(pendingName, '', 0), cookie(sessionName, sessionId, 3600)]);
  }

  if (path.pathname === '/logout-accesslobby' && request.method === 'POST') {
    if (request.headers.origin !== origin) return sendPage(response, 403, { title: 'Request rejected', message: 'Please use the sign-out button on this app.' });
    sessions.delete(jar[sessionName]);
    pendingAccounts.delete(jar[pendingName]);
    let destination = '/';
    try { destination = await sharedLogoutDestination(); }
    catch { destination = '/?error=shared_logout_unavailable'; }
    return redirect(response, destination, clearAuthCookies());
  }

  if (path.pathname === '/logout' && request.method === 'POST') {
    if (request.headers.origin !== origin) return sendPage(response, 403, { title: 'Request rejected', message: 'Please use the sign-out button on this app.' });
    const fields = await formBody(request);
    if (!fields) return sendPage(response, 413, { title: 'Form too large', message: 'Please return and try again.' });
    const scope = fields.get('scope');
    if (scope !== 'current' && scope !== 'all') return sendPage(response, 400, { title: 'Choose how to sign out', message: 'Select either this app only or AccessLobby and supported apps.' });
    sessions.delete(jar[sessionName]);
    let destination = '/';
    if (scope === 'all') {
      try { destination = await sharedLogoutDestination(); }
      catch { destination = '/?error=shared_logout_unavailable'; }
    }
    return redirect(response, destination, [cookie(sessionName, '', 0)]);
  }

  if (path.pathname === '/backchannel-logout' && request.method === 'POST') {
    if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') {
      return send(response, 415, 'Expected form data');
    }
    const fields = await formBody(request, 16384);
    if (!fields) return send(response, 413, 'Form too large');
    const token = fields.get('logout_token');
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
    if (!active) return sendPage(response, 401, {
      title: 'Sign in required',
      message: 'Sign in before opening this protected page.',
      content: '<div class="actions"><a class="button button-primary" href="/login">Sign in</a><a class="button" href="/">Return home</a></div>',
    });
    if (!mayViewPrivate(active.personId, grants)) return sendPage(response, 403, {
      title: 'This app has not given you access',
      message: 'AccessLobby confirmed who you are, but this app still controls access to this protected resource.',
      content: '<div class="actions"><a class="button" href="/">Return home</a></div>',
    });
    return sendPage(response, 200, { title: 'Protected resource', message: 'This app granted access to its protected resource.' });
  }

  if (path.pathname !== '/') return sendPage(response, 404, {
    title: 'Page not found',
    message: 'The page you requested does not exist in this reference app.',
    content: '<div class="actions"><a class="button button-primary" href="/">Return home</a></div>',
  });

  const notice = path.searchParams.get('error') === 'shared_logout_unavailable'
    ? '<div class="panel panel-warning" role="alert"><strong>You are signed out of this app.</strong><p>We could not also end the shared AccessLobby session. Try again later.</p></div>'
    : '';

  if (active) {
    return sendPage(response, 200, {
      title: 'Reference app account',
      eyebrow: 'Signed in',
      heading: 'You are signed into the reference app',
      message: 'AccessLobby confirmed your identity. This app created or connected its own local account and still controls its own information and permissions.',
      content: `${notice}
        <div class="panel identifier-list">
          <div class="identifier-row">
            <p><strong>AccessLobby ID</strong><br><span class="code">${html(active.personId)}</span></p>
            <button class="copy-button" type="button" data-copy="${html(active.personId)}">Copy ID</button>
          </div>
          <div class="identifier-row">
            <p><strong>Reference App Account ID</strong><br><span class="code">${html(active.localUserId)}</span></p>
            <button class="copy-button" type="button" data-copy="${html(active.localUserId)}">Copy ID</button>
          </div>
          <p class="identifier-note">Your AccessLobby ID identifies you across supported apps. This app keeps a separate local account for its own data and permissions.</p>
        </div>
        <div class="actions"><a class="button" href="/private">Open protected test page</a></div>
        <h2>How would you like to sign out?</h2>
        <p class="muted">Signing out of this app keeps the shared AccessLobby session active. Signing out of AccessLobby and supported apps ends the shared sign-in session, but an app may retain a separate local session until it processes the sign-out.</p>
        <form method="post" action="/logout" class="actions"><button name="scope" value="current">Sign out of this app</button><button class="button-primary" name="scope" value="all">Sign out of AccessLobby and supported apps</button></form>`,
    });
  }

  const pendingPrompt = activePending
    ? '<div class="panel"><strong>Account setup is waiting.</strong><p>You already completed AccessLobby sign-in. Finish connecting this app.</p><a class="button button-primary" href="/account-choice">Continue setup</a></div>'
    : '';
  const registerAction = registrationEnabled
    ? '<a class="button" href="/register">Create an AccessLobby account</a>'
    : '';
  const legacyForm = process.env.LEGACY_TEST_PASSWORD_SCRYPT
    ? `<div class="panel"><form class="legacy-form" method="post" action="/legacy-login"><h2>Connect an existing app account</h2><label>Username<input name="username" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in to the existing app account</button></form></div>`
    : '';
  return sendPage(response, 200, {
    title: 'AccessLobby reference app',
    heading: 'Sign in to the reference app',
    message: 'This small app demonstrates how another product can use AccessLobby for identity and sign-in while keeping its own local account, information and permissions.',
    content: `${notice}${pendingPrompt}
      <div class="actions"><a class="button button-primary" href="/login">Sign in with AccessLobby</a>${registerAction}</div>
      ${!registrationEnabled ? '<p class="muted">New AccessLobby registration is not enabled in this environment.</p>' : ''}
      ${legacyForm}
      <form method="post" action="/logout-accesslobby" class="actions"><button class="button-danger" type="submit">Sign out of AccessLobby</button></form>`,
  });
}

http.createServer((request, response) => handle(request, response).catch(error => {
  console.error('reference-consumer request failed', error instanceof Error ? error.message : 'unknown error');
  sendPage(response, 502, {
    title: 'The sign-in service is temporarily unavailable',
    message: 'No account changes were made. Please return home and try again.',
    content: '<div class="actions"><a class="button button-primary" href="/">Return home</a></div>',
  });
})).listen(port);
