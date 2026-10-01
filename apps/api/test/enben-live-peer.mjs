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
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { ready = (await fetch(`${transport}/health/ready`)).ok; if (ready) break; } catch {}
      assert.equal(child.exitCode, null, 'Disposable notes peer must stay running');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready);
    for (const user of users) {
      const context = await browser.newContext(); contexts.push(context);
      // Exact HTTPS peer hostname is a routing fixture. Authentication, browser
      // cookies, peer callback/token validation and the registry API are real.
      await context.route(`${origin}/**`, async route => {
        const url = new URL(route.request().url());
        const response = await route.fetch({ url: `${transport}${url.pathname}${url.search}`, maxRedirects: 0 });
        await route.fulfill({ response });
      });
      await context.route(url => url.origin === new URL(issuer).origin, async route => {
        const response = await route.fetch({ maxRedirects: 0 });
        const location = response.headers().location;
        if ([302, 303].includes(response.status()) && location) {
          const next = new URL(location, issuer);
          assert.ok([origin, new URL(issuer).origin].includes(next.origin), 'IAM redirect must remain inside the exact approved origins');
          // Playwright does not route later requests in a network redirect
          // chain. Start a document navigation so the fixture peer is routed.
          const destination = next.href.replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]);
          const headers = { ...response.headers(), 'content-type': 'text/html' };
          for (const field of ['location', 'content-length', 'content-encoding']) delete headers[field];
          return route.fulfill({ status: 200, headers,
            body: `<meta http-equiv="refresh" content="0;url=${destination}">` });
        }
        await route.fulfill({ response });
      });
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByRole('link', { name: 'Sign in with AccessLobby' }).click();
      await page.locator('input[name="username"]').fill(user.username);
      await page.locator('input[name="password"]').fill(password);
      await page.locator('#kc-login').click();
      await page.getByRole('button', { name: 'Create my account for this app' }).click();
      await page.getByRole('heading', { name: 'Your notes', exact: true, level: 1 }).waitFor();
    }
    const a = contexts[0].pages()[0], b = contexts[1].pages()[0];
    await a.getByLabel('Title', { exact: true }).fill('Real IAM private note');
    await a.getByLabel('Note', { exact: true }).fill('Peer-local ownership test.');
    await a.getByRole('button', { name: 'Save note', exact: true }).click();
    const notePath = await a.getByRole('link', { name: 'Real IAM private note' }).getAttribute('href');
    assert.equal((await b.goto(`${origin}${notePath}`)).status(), 404);
    await b.getByRole('heading', { name: 'Note not found', exact: true }).waitFor();
    await a.goto(`${origin}${notePath}`);
    assert.equal(await a.getByLabel('Note', { exact: true }).inputValue(), 'Peer-local ownership test.');
    await a.getByLabel('Note', { exact: true }).fill('Edited through the real authenticated peer.');
    await a.getByRole('button', { name: 'Save changes' }).click();
    await a.getByRole('button', { name: 'Sign out of Enben', exact: true }).click();
    await a.getByRole('heading', { name: 'A little room for your notes.' }).waitFor();
    assert.equal((await a.goto(`${origin}${notePath}`)).status(), 401);
    await a.goto(origin);
    await a.getByRole('link', { name: 'Sign in with AccessLobby' }).click(); // Existing IAM session remains; no password prompt.
    await a.getByRole('heading', { name: 'Your notes', exact: true, level: 1 }).waitFor();
    await a.goto(`${origin}${notePath}`);
    assert.equal(await a.getByLabel('Note', { exact: true }).inputValue(), 'Edited through the real authenticated peer.');
    await a.getByRole('button', { name: 'Delete note' }).click();
    assert.equal(await a.getByRole('link', { name: 'Real IAM private note' }).count(), 0);
    const logout = a.waitForURL(url => url.origin === new URL(issuer).origin && url.pathname.endsWith('/logout'));
    await a.getByRole('button', { name: 'Sign out of AccessLobby and supported apps', exact: true }).click();
    await logout;
    await a.getByRole('button', { name: 'Sign out', exact: true }).click();
    await a.getByRole('heading', { name: 'A little room for your notes.' }).waitFor();
    assert.equal((await a.goto(`${origin}/notes`)).status(), 401);
    assert.equal((await b.goto(`${origin}/notes`)).status(), 200); // Another person's session is separate.
    await a.goto(origin);
    await a.getByRole('link', { name: 'Sign in with AccessLobby' }).click();
    await a.locator('input[name="username"]').waitFor(); // Shared sign-out ended IAM SSO.
    console.info('ENBEN_REAL_IAM_PASS two-person-code-PKCE JWKS API-entry private-note-owner edit delete local-logout SSO-return shared-logout-confirmation IAM-SSO-ended');
  } finally {
    for (const context of contexts) await context.close();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await exited;
  }
}
