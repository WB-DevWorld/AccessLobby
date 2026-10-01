// Called only by the guarded disposable onboarding CI test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

export async function qualifyEnbenPeer({ browser, issuer, apiOrigin, application, users, password }) {
  const origin = new URL(application.redirectUri).origin;
  const transport = 'http://127.0.0.1:14002';
  const child = spawn(process.execPath, ['examples/reference-consumer/server.mjs'], { cwd: process.cwd(),
    env: { PATH: process.env.PATH, PORT: '14002', CONSUMER_ORIGIN: origin, OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: application.clientId, ACCESSLOBBY_API_URL: apiOrigin, NOTES_ENABLED: 'true',
      APP_ENTRY_REQUIRED: 'true', PUBLIC_REGISTRATION_ENABLED: 'false' }, stdio: 'ignore' });
  const exited = once(child, 'exit');
  const contexts = [];
  const get = (path, cookie = '') => fetch(`${transport}${path}`, { headers: { cookie }, redirect: 'manual' });
  const post = (path, cookie, fields) => fetch(`${transport}${path}`, { method: 'POST', redirect: 'manual',
    headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
  const opaqueCookie = (response, name) => {
    const value = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
    assert.ok(value, 'Peer must issue the expected opaque cookie');
    assert.match(value, /; HttpOnly; SameSite=Lax;/); assert.match(value, /; Secure$/);
    assert.doesNotMatch(value, /; Domain=/);
    return value.split(';')[0];
  };
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { ready = (await get('/health/ready')).ok; if (ready) break; } catch {}
      assert.equal(child.exitCode, null, 'Disposable notes peer must stay running');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready);
    for (const user of users) {
      const context = await browser.newContext(); contexts.push({ context });
      let destination;
      // The real IAM redirect is captured before following the fixture HTTPS
      // hostname. The actual peer consumes its code/state via loopback HTTP;
      // this does not qualify deployed HTTPS browser cookie transport.
      await context.route(url => url.origin === new URL(issuer).origin, async route => {
        const response = await route.fetch({ maxRedirects: 0, timeout: 8000 });
        const location = response.headers().location;
        if (location) {
          const next = new URL(location, issuer);
          if (next.origin === origin && ['/callback', '/'].includes(next.pathname)) {
            assert.ok([302, 303].includes(response.status())); destination = next;
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>CI peer redirect captured</p>' });
          }
        }
        await route.fulfill({ response });
      });
      const page = await context.newPage();
      const signIn = async (sso = false) => {
        destination = undefined;
        const start = await get('/login'); assert.equal(start.status, 303);
        const authorization = new URL(start.headers.get('location'));
        assert.equal(authorization.searchParams.get('redirect_uri'), application.redirectUri);
        const flow = opaqueCookie(start, '__Host-ref-flow');
        await page.goto(authorization.href);
        if (!sso) {
          await page.locator('input[name="username"]').fill(user.username);
          await page.locator('input[name="password"]').fill(password);
          await page.locator('#kc-login').click();
        }
        assert.ok(destination && destination.pathname === '/callback', 'Real IAM callback required');
        assert.equal(destination.searchParams.get('state'), authorization.searchParams.get('state'));
        const callback = await get(`${destination.pathname}${destination.search}`, flow);
        assert.equal(callback.status, 303, 'Peer must validate the actual IAM code, PKCE, nonce, JWTs and identity');
        if (callback.headers.get('location') === '/account-choice') {
          const joined = await post('/join', opaqueCookie(callback, '__Host-ref-pending'), {});
          assert.equal(joined.status, 303); return opaqueCookie(joined, '__Host-ref-session');
        }
        return opaqueCookie(callback, '__Host-ref-session');
      };
      contexts.at(-1).signIn = signIn; contexts.at(-1).page = page;
      contexts.at(-1).cookie = await signIn();
    }
    const [a, b] = contexts;
    assert.equal((await post('/notes', a.cookie, { title: 'Real IAM private note', body: 'Peer-local ownership test.' })).status, 303);
    const response = await get('/notes', a.cookie); assert.equal(response.headers.get('cache-control'), 'no-store');
    const notePath = /href="(\/notes\/[a-f0-9-]{36})"/.exec(await response.text())[1];
    assert.equal((await get(notePath, b.cookie)).status, 404);
    assert.equal((await post(notePath, b.cookie, { title: 'steal', body: '' })).status, 404);
    assert.equal((await post(`${notePath}/delete`, b.cookie, {})).status, 404);
    assert.equal((await post(notePath, a.cookie, { title: 'Edited note', body: 'Saved through the actual authenticated peer.' })).status, 303);
    assert.equal((await post('/logout', a.cookie, { scope: 'current' })).headers.get('location'), '/');
    assert.equal((await get(notePath, a.cookie)).status, 401);
    a.cookie = await a.signIn(true); // The same real IAM session remains; no password form.
    assert.match(await (await get(notePath, a.cookie)).text(), /Saved through the actual authenticated peer/);
    assert.equal((await post(`${notePath}/delete`, a.cookie, {})).status, 303);
    assert.equal((await get(notePath, a.cookie)).status, 404);
    const shared = await post('/logout', a.cookie, { scope: 'all' });
    const logout = new URL(shared.headers.get('location'));
    assert.equal(logout.origin, new URL(issuer).origin);
    assert.equal(logout.searchParams.get('post_logout_redirect_uri'), `${origin}/`);
    await a.page.goto(logout.href);
    await a.page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await a.page.getByText('CI peer redirect captured', { exact: true }).waitFor();
    assert.equal((await get('/notes', a.cookie)).status, 401);
    assert.equal((await get('/notes', b.cookie)).status, 200);
    const fresh = await get('/login');
    await a.page.goto(fresh.headers.get('location'));
    await a.page.locator('input[name="username"]').waitFor(); // Shared sign-out ended real IAM SSO.
    console.info('ENBEN_REAL_IAM_PASS browser-code-PKCE peer-callback-JWKS API-entry two-person-note-owner edit delete local-logout SSO-return shared-logout-confirmation IAM-SSO-ended');
  } finally {
    for (const { context } of contexts) await context.close();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
}
