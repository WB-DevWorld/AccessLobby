/** CI only: real first-party OIDC + API + PostgreSQL + production Next.js, closed external preview. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ExternalProfiles } from '../dist/external-profiles.js';

export async function qualifyExternalConsent({ browser, pool, apps, proofs, api, apiOrigin, issuer, users, password, people, webTokens, peerToken }) {
  const origin = 'http://localhost:3000';
  const external = new ExternalProfiles(pool, async host => proofs.get(host) ?? []);
  const requested = await apps.request(people[0].person.id, { clientId: 'ci-external-ui-' + randomUUID(),
    name: 'Independent preview store', platform: 'wordpress', visibility: 'hidden', admission: 'authenticated_open',
    redirectUri: 'https://preview-store.example.test/gh/wp-login.php?action=al_callback',
    logoutUri: 'https://preview-store.example.test/gh/wp-login.php?action=al_signed_out' });
  proofs.set(requested.originVerificationHost, [[requested.originVerificationValue]]);
  await apps.verifyOrigin(people[0].person.id, requested.id);
  await external.prepare(requested.id, 'ci-explicit-private-review', false);
  const reviewPath = '/v1/preview/external-profiles/' + requested.id;
  const consentPath = '/v1/preview/external-consents/' + requested.id;
  await api(reviewPath, peerToken, 403);
  const review = await api(reviewPath, webTokens[1], 200);
  await api(consentPath, webTokens[1], 400, { ...review, scopes: ['openid', 'email'] }, 'POST');
  assert.equal(await apps.allowedClient(requested.clientId), false);
  const production = resolve('apps/web/.next/standalone/apps/web');
  cpSync(resolve('apps/web/public'), resolve(production, 'public'), { recursive: true });
  cpSync(resolve('apps/web/.next/static'), resolve(production, '.next/static'), { recursive: true });
  let server, exited;
  const cases = [];
  const contexts = [];
  async function check(name, action) {
    try { await action(); cases.push({ name, status: 'PASS' }); console.info('EXTERNAL_CONSENT_PASS ' + name); }
    catch { cases.push({ name, status: 'FAIL' }); throw new Error('External consent qualification failed: ' + name); }
  }
  async function stop() {
    if (!server || server.exitCode !== null || server.signalCode !== null) return;
    server.kill('SIGTERM'); const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  async function start(enabled) {
    server = spawn(process.execPath, [resolve(production, 'server.js')], {
      cwd: production, env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: '3000', WEB_BASE_URL: origin,
        API_INTERNAL_URL: apiOrigin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'accesslobby-web',
        SESSION_SECRET: randomBytes(32).toString('base64url'), EXTERNAL_PROFILE_PREVIEW_ENABLED: String(enabled),
        NEXT_TELEMETRY_DISABLED: '1', GIT_SHA: 'ci-external-consent-fixture' }, stdio: 'ignore'
    });
    exited = once(server, 'exit');
    for (let attempt = 0; attempt < 80; attempt++) {
      if (server.exitCode !== null) throw new Error('Disposable web server exited');
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error('Disposable web readiness failed');
  }
  async function signedIn(index, noScript = false) {
    const context = await browser.newContext({ javaScriptEnabled: !noScript, viewport: { width: noScript ? 390 : 1280, height: 844 } });
    contexts.push(context); const page = await context.newPage();
    if (noScript) {
      await page.goto(origin + '/connections/' + requested.id);
      await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    } else await page.goto(origin + '/auth/login');
    await page.locator('#username').fill(users[index].username);
    await page.locator('#password').fill(password);
    await page.locator('#kc-login').click();
    await page.waitForURL(url => url.origin === origin && !url.pathname.startsWith('/auth/'));
    if (noScript) assert.equal(page.url(), origin + '/connections/' + requested.id);
    return { page, context };
  }
  try {
    await start(false);
    await check('default-off review list and mutation routes return 404', async () => {
      for (const path of ['/connections', '/connections/' + requested.id]) {
        const response = await fetch(origin + path); assert.equal(response.status, 404);
        assert.match(response.headers.get('cache-control'), /private.*no-store/);
      }
      assert.equal((await fetch(origin + '/connections/action', { method: 'POST' })).status, 404);
    });
    await stop(); await start(true);
    const { page, context } = await signedIn(1, true);
    await check('real IAM sign-in renders a mobile review without JavaScript or private identity claims', async () => {
      const response = await page.goto(origin + '/connections/' + requested.id);
      assert.match(response.headers()['cache-control'], /private.*no-store/);
      await page.getByRole('heading', { name: 'Independent preview store', exact: true }).waitFor();
      assert.match(await page.locator('main').innerText(), /https:\/\/preview-store.example.test/);
      assert.equal(await page.locator('input[name="fingerprint"]').inputValue(), review.fingerprint);
      const html = await page.content();
      for (const secret of [people[1].person.id, webTokens[1]]) assert(!html.includes(secret));
      assert.equal(await page.getByRole('checkbox').isChecked(), false);
    });
    await check('native approval saves only the signed-in human and leaves external client inactive', async () => {
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Approve site', exact: true }).click();
      await page.waitForURL(origin + '/connections?notice=granted');
      assert.match(await page.locator('main').innerText(), /Approved for the reviewed configuration/);
      const rows = await pool.query('SELECT person_id FROM external_app_consents WHERE application_id=$1', [requested.id]);
      assert.deepEqual(rows.rows.map(row => row.person_id), [people[1].person.id]);
      assert.equal(await apps.allowedClient(requested.clientId), false);
    });
    const opaque = await external.subjectForConsentedPerson(people[1].person.id, requested.id);
    await check('foreign and absent origins cannot withdraw an approval through the web session', async () => {
      for (const value of ['https://foreign.example.test', null]) {
        const response = await context.request.post(origin + '/connections/action', { form: { intent: 'withdraw', applicationId: requested.id },
          headers: value ? { origin: value } : {}, maxRedirects: 0 });
        assert.equal(response.status(), 403);
      }
      assert.equal(await external.subjectForConsentedPerson(people[1].person.id, requested.id), opaque);
    });
    await check('another signed-in person sees no approval and cannot withdraw it', async () => {
      const { page: other } = await signedIn(0);
      await other.goto(origin + '/connections');
      assert.match(await other.locator('main').innerText(), /no site approvals yet/);
      await api(consentPath, webTokens[0], 404, undefined, 'DELETE');
      assert.equal(await external.subjectForConsentedPerson(people[1].person.id, requested.id), opaque);
    });
    await check('withdrawal works without JavaScript and retry remains idempotent', async () => {
      await page.getByRole('button', { name: 'Withdraw approval', exact: true }).click();
      await page.waitForURL(origin + '/connections?notice=withdrawn');
      assert.match(await page.locator('main').innerText(), /Withdrawn/);
      await assert.rejects(external.subjectForConsentedPerson(people[1].person.id, requested.id));
      await api(consentPath, webTokens[1], 200, undefined, 'DELETE');
    });
    await check('a registration change invalidates an already rendered form and requires fresh review', async () => {
      await page.goto(origin + '/connections/' + requested.id);
      await pool.query("UPDATE applications SET name='Changed preview store' WHERE id=$1", [requested.id]);
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Approve site', exact: true }).click();
      await page.waitForURL(origin + '/connections?notice=external_review_required');
      await api(reviewPath, webTokens[1], 409);
      await assert.rejects(external.subjectForConsentedPerson(people[1].person.id, requested.id));
    });
    await check('fresh private review and re-consent preserve one app identity and one canonical human', async () => {
      await external.reverify(requested.id, 'ci-fresh-private-review');
      await page.goto(origin + '/connections/' + requested.id);
      await page.getByRole('heading', { name: 'Changed preview store', exact: true }).waitFor();
      await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Approve site', exact: true }).click();
      await page.waitForURL(origin + '/connections?notice=granted');
      assert.equal(await external.subjectForConsentedPerson(people[1].person.id, requested.id), opaque);
      const count = await pool.query('SELECT count(*) AS count FROM external_app_identities WHERE application_id=$1', [requested.id]);
      assert.equal(count.rows[0].count, '1');
    });
    await check('suspension withdraws approval and preview resume never restores it or activates a client', async () => {
      await external.suspend(requested.id, 'ci-external-suspension');
      await page.goto(origin + '/connections'); assert.match(await page.locator('main').innerText(), /Withdrawn/);
      assert.equal(await page.getByRole('link', { name: 'Review site', exact: true }).count(), 0);
      await external.reverify(requested.id, 'ci-external-resume-review', true);
      const resumed = await api(reviewPath, webTokens[1], 200); assert.equal(resumed.state, 'not-granted');
      await assert.rejects(external.subjectForConsentedPerson(people[1].person.id, requested.id));
      assert.equal(await apps.allowedClient(requested.clientId), false);
    });
  } finally {
    mkdirSync('artifacts/external-consent', { recursive: true });
    writeFileSync('artifacts/external-consent/browser-report.json', JSON.stringify({
      engine: 'real Keycloak + AccessLobby API/PostgreSQL + production Next.js', activationAllowed: false, cases,
    }, null, 2) + '\n');
    for (const context of contexts) await context.close();
    await stop();
  }
}
