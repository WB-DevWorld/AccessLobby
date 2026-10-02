#!/usr/bin/env node
/** Real production UI + native POST handlers; synthetic, loopback-only identity API.
 * This verifies presentation/transport, not live IAM or staging acceptance. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const web = resolve(root, 'apps/web');
const requireWeb = createRequire(resolve(web, 'package.json'));
const { EncryptJWT } = await import(pathToFileURL(requireWeb.resolve('jose')).href);
const origin = 'http://127.0.0.1:3321', apiOrigin = 'http://127.0.0.1:3213';
const personId = '11111111-1111-4111-8111-111111111111';
const otherId = '44444444-4444-4444-8444-444444444444';
const organizationId = '22222222-2222-4222-8222-222222222222';
const appId = '55555555-5555-4555-8555-555555555555';
const key = Buffer.alloc(32, 32);
const mutations = [], failures = [], consoleErrors = [];
let identityDelay = 0, sectionDelay = 0, unavailable = false, empty = false, membership = true, organizationRole = 'owner';
const apps = Array.from({ length: 8 }, (_, i) => ({ id: `60000000-0000-4000-8000-00000000000${i}`, name: `Sample app ${i + 1}`, admission: i % 2 ? 'grant_required' : 'authenticated_open' }));
const api = createServer(async (req, res) => {
  const json = value => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
  if (req.url === '/iam/.well-known/openid-configuration') return json({ issuer: `${apiOrigin}/iam`, authorization_endpoint: `${apiOrigin}/iam/auth`, token_endpoint: `${apiOrigin}/iam/token`, jwks_uri: `${apiOrigin}/iam/certs`, end_session_endpoint: `${apiOrigin}/iam/logout` });
  if (req.url?.startsWith('/iam/logout')) { res.end('Synthetic issuer sign-out endpoint'); return; }
  if (!req.url?.startsWith('/v1/')) { res.statusCode = 404; return json({ error: 'fixture_route_missing' }); }
  if (req.headers.authorization !== 'Bearer ui-test-only') { res.statusCode = 401; return json({ error: 'fixture_token_required' }); }
  if (req.method !== 'GET') {
    let data = ''; for await (const chunk of req) data += chunk;
    mutations.push({ path: req.url, method: req.method, body: data ? JSON.parse(data) : null });
    await new Promise(resolve => setTimeout(resolve, 350));
    return json({ id: organizationId });
  }
  await new Promise(resolve => setTimeout(resolve, req.url === '/v1/me' ? identityDelay : sectionDelay));
  if (unavailable) { res.statusCode = 503; return json({ error: 'unavailable' }); }
  if (req.url === '/v1/me') return json({ contract: 'accesslobby.identity.v0.1', person: { id: personId, status: 'active' } });
  if (req.url === '/v1/contexts') return json({ person: { id: personId }, contexts: [{ type: 'personal' }, ...(membership ? [{ type: 'organization', id: organizationId, name: 'Sample organization', role: 'owner' }] : [])], invitations: [] });
  if (req.url === `/v1/organizations/${organizationId}`) return json({ id: organizationId, name: 'Sample organization', role: organizationRole, members: [{ personId, role: 'owner' }, { personId: otherId, role: 'member' }], invitations: [] });
  if (req.url === '/v1/applications/visible') return json({ contract: 'accesslobby.applications.v0.1', applications: empty ? [] : apps });
  if (req.url === '/v1/applications/mine') return json({ contract: 'accesslobby.applications.v0.1', applications: [{ id: appId, name: 'Owned sample app', clientId: 'owned-sample-app', status: 'active', visibility: 'hidden', admission: 'grant_required' }] });
  res.statusCode = 404; json({ error: 'fixture_route_missing' });
});
api.listen(3213, '127.0.0.1'); await once(api, 'listening');
const output = resolve(web, '.next/standalone/apps/web');
cpSync(resolve(web, 'public'), resolve(output, 'public'), { recursive: true });
cpSync(resolve(web, '.next/static'), resolve(output, '.next/static'), { recursive: true });
const server = spawn(process.execPath, [resolve(output, 'server.js')], { cwd: root, env: { ...process.env, WEB_BASE_URL: origin, API_INTERNAL_URL: apiOrigin, OIDC_ISSUER: `${apiOrigin}/iam`, OIDC_CLIENT_ID: 'accesslobby-web', SESSION_SECRET: key.toString('base64url'), PUBLIC_REGISTRATION_ENABLED: 'false', NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '3321' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverOutput = ''; server.stdout.on('data', chunk => serverOutput += chunk); server.stderr.on('data', chunk => serverOutput += chunk);
let browser;
const artifacts = resolve(root, 'artifacts/ui-refinement'); mkdirSync(artifacts, { recursive: true });
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, message: String(error) }); console.error(`FAIL ${name}: ${error}`); }
}
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${origin}/manifest.webmanifest`)).ok) break; } catch {} if (server.exitCode !== null) throw new Error(serverOutput); await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ ...(process.env.UI_BROWSER_EXECUTABLE ? { executablePath: process.env.UI_BROWSER_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {}) });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', error => consoleErrors.push(String(error)));
  await check('public landing: responsive, theme, hierarchy, links', async () => {
    for (const width of [360, 390, 412, 768, 1366, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(origin);
      await page.getByRole('heading', { name: 'Your identity. Your apps. One sign-in.', exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`);
      assert.equal(await page.getByRole('link', { name: 'Create account', exact: true }).count(), 0);
      const cta = await page.locator('.hero-actions .button-primary').boundingBox();
      const picture = await page.locator('.product-illustration').boundingBox();
      if (width < 900) assert(cta.y < picture.y);
      await page.screenshot({ path: resolve(artifacts, `home-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Color theme: system. Activate to switch theme.', exact: true }).click();
    await page.getByRole('button', { name: 'Color theme: light. Activate to switch theme.', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    await page.screenshot({ path: resolve(artifacts, 'home-dark.png'), fullPage: true });
    await page.getByRole('button', { name: 'Color theme: dark. Activate to switch theme.', exact: true }).click();
    await page.getByRole('link', { name: 'Privacy information', exact: true }).click();
    await page.getByRole('heading', { name: 'Understand what belongs where.', exact: true }).waitFor();
  });
  await check('protected routes do not assert identity without a session', async () => {
    for (const path of ['/account', '/apps', '/apps/manage', '/identity', '/contexts', `/organizations/${organizationId}`, '/recovery', '/sign-out']) {
      await page.goto(origin + path); await page.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: "You're signed in", exact: true }).count(), 0);
      assert.match((await page.request.get(origin + path)).headers()['cache-control'] ?? '', /no-store/);
    }
  });
  const token = await new EncryptJWT({ accessToken: 'ui-test-only' }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' }).setIssuedAt().setExpirationTime('1h').encrypt(key);
  const session = () => context.addCookies([{ name: 'al-session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  await session();
  await check('route and section skeletons never invent signed-in state', async () => {
    identityDelay = 1200; sectionDelay = 1800;
    await page.goto(`${origin}/account`, { waitUntil: 'commit' });
    await page.getByText('Loading identity', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: "You're signed in", exact: true }).count(), 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.locator('.skeleton').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    await page.screenshot({ path: resolve(artifacts, 'account-loading.png') });
    await page.getByRole('heading', { name: "You're signed in", exact: true }).waitFor();
    await page.getByText('Loading organizations and invitations', { exact: true }).waitFor();
    await page.getByText('1 organization linked to your identity.', { exact: true }).waitFor();
    assert.equal(await page.getByText(personId, { exact: true }).count(), 1);
    identityDelay = 0; sectionDelay = 0;
    await page.getByText('Sample app 4', { exact: true }).waitFor();
    await page.screenshot({ path: resolve(artifacts, 'account-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: resolve(artifacts, 'account-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1366, height: 900 });
  });
  await check('context selection remains person-bound and membership-rechecked', async () => {
    await page.goto(`${origin}/contexts`); await page.getByRole('button', { name: 'Select organization', exact: true }).click();
    await page.waitForURL('**/contexts?notice=selected');
    assert((await context.cookies()).some(cookie => cookie.name === 'al-context'));
    await page.goto(`${origin}/account`); await page.getByText('Sample organization', { exact: true }).waitFor();
    membership = false; await page.reload(); await page.getByText('Acting for yourself', { exact: true }).waitFor(); membership = true;
  });
  await check('apps have a consumer view, search and truthful empty state', async () => {
    await page.goto(`${origin}/apps`); await page.getByText('Sample app 8', { exact: true }).waitFor();
    assert.equal(await page.locator('input[name="redirectUri"]').count(), 0);
    await page.getByRole('searchbox').fill('app 8'); assert.equal(await page.locator('.app-card-list li').count(), 1);
    await page.getByRole('searchbox').fill('missing'); await page.getByText('No apps match your search.', { exact: true }).waitFor();
    empty = true; await page.reload(); await page.getByRole('heading', { name: 'No registered apps available yet', exact: true }).waitFor(); empty = false;
  });
  await check('native validation, unsaved guard and request submitter transport', async () => {
    await page.goto(`${origin}/apps/manage`); await page.getByRole('button', { name: 'Save app request', exact: true }).click();
    assert.equal(mutations.length, 0); await page.getByText('Check these fields', { exact: true }).waitFor();
    await page.locator('#app-name').fill('New sample app'); await page.locator('#app-client').fill('new-sample-app');
    await page.locator('#app-callback').fill('https://example.test/auth/callback'); await page.locator('#app-logout').fill('https://example.test');
    await page.locator('#app-backchannel').evaluate(el => { el.value = 'bad URL'; });
    await page.getByRole('button', { name: 'Save app request', exact: true }).click();
    assert.equal(await page.locator('.information-details').getAttribute('open'), ''); assert.equal(mutations.length, 0);
    await page.locator('#app-backchannel').fill('');
    const guard = page.waitForEvent('dialog'); const leave = page.getByRole('link', { name: 'Back to apps', exact: true }).click();
    const prompt = await guard; assert.match(prompt.message(), /unsaved/); await prompt.dismiss(); await leave; assert.match(page.url(), /apps\/manage$/);
    await page.getByRole('button', { name: 'Save app request', exact: true }).click();
    await page.waitForURL('**/apps/manage?notice=requested');
    assert.equal(mutations.length, 1); assert.equal(mutations[0].body.clientId, 'new-sample-app');
    assert.equal(mutations[0].body.backchannelLogoutUri, '');
  });
  await check('grant/revoke confirmation preserves named submitter and prevents duplicate POSTs', async () => {
    await page.locator(`input[id="grant-${appId}"]`).fill(otherId);
    await page.getByRole('button', { name: 'Revoke entry', exact: true }).click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Cancel', exact: true }).evaluate(el => document.activeElement === el), true);
    await page.keyboard.press('Escape'); assert.equal(mutations.length, 1);
    await page.getByRole('button', { name: 'Revoke entry', exact: true }).click();
    await dialog.getByRole('button', { name: 'Confirm change', exact: true }).evaluate(el => {
      const form = document.querySelector('input[id="grant-55555555-5555-4555-8555-555555555555"]').closest('form');
      el.click(); form.querySelector('button[value="revoke"]').click();
    });
    await page.waitForURL('**/apps/manage?notice=revoked');
    assert.equal(mutations.length, 2); assert.equal(mutations[1].method, 'DELETE'); assert.equal(mutations[1].path, `/v1/applications/${appId}/grants/${otherId}`);
  });
  await check('organization role UI and destructive actions retain permission boundaries', async () => {
    organizationRole = 'member'; await page.goto(`${origin}/organizations/${organizationId}`);
    assert.equal(await page.getByRole('button', { name: 'Save role', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Create invitation', exact: true }).count(), 0);
    organizationRole = 'owner'; await page.reload();
    const remove = page.getByRole('button', { name: 'Remove member', exact: true }); await remove.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(mutations.length, 2);
    await remove.click(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm change', exact: true }).click();
    await page.waitForURL('**/organizations/*?notice=remove'); assert.equal(mutations[2].method, 'DELETE'); assert.equal(mutations[2].path, `/v1/organizations/${organizationId}/members/${otherId}`);
  });
  await check('keyboard menus, 200% text resize, labels and narrow identity', async () => {
    await page.goto(`${origin}/account`); await page.getByText('Sample app 4', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const summary = page.locator('.mobile-more summary'); await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('.mobile-more').getAttribute('open'), '');
    await page.keyboard.press('Tab'); assert(await page.locator('.mobile-more a').first().evaluate(el => document.activeElement === el));
    await page.keyboard.press('Escape'); assert(await summary.evaluate(el => document.activeElement === el));
    assert.equal(await page.locator('.identifier-block code').innerText(), personId);
    assert(await page.locator('.identifier-block code').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'text resizing overflows');
    await page.screenshot({ path: resolve(artifacts, 'account-text-200.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${origin}/apps/manage`);
    assert(await page.locator('input:not([type="hidden"]), select').evaluateAll(elements => elements.every(el => el.labels.length > 0)), 'unlabelled form control');
  });
  if (process.env.UI_AXE_SOURCE) await check('automated WCAG checks on light/dark public and account routes', async () => {
    const results = [];
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ['/', '/account', '/apps', '/apps/manage', '/contexts', `/organizations/${organizationId}`, '/identity', '/recovery', '/sign-out', '/help', '/privacy']) {
        await page.goto(origin + path); await page.waitForFunction(() => !document.querySelector('.skeleton')); 
        await page.addScriptTag({ path: process.env.UI_AXE_SOURCE });
        const report = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => ({ selector: node.target, summary: node.failureSummary })) })));
        results.push({ scheme, path, violations: report });
      }
    }
    writeFileSync(resolve(artifacts, 'accessibility.json'), JSON.stringify(results, null, 2));
    assert.deepEqual(results.filter(item => item.violations.length), []);
  });
  await check('service failure can retry without re-entering authentication', async () => {
    unavailable = true; await page.goto(`${origin}/account`); await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    unavailable = false; await page.getByRole('button', { name: 'Try again', exact: true }).click(); await page.getByRole('heading', { name: "You're signed in", exact: true }).waitFor();
  });
  await check('both logout choices preserve current-app and shared-browser scope', async () => {
    await page.goto(`${origin}/sign-out`); await page.getByRole('button', { name: 'Sign out of this app', exact: true }).click(); await page.waitForURL(origin + '/');
    assert(!(await context.cookies()).some(cookie => cookie.name === 'al-session' || cookie.name === 'al-context'));
    await session(); await page.goto(`${origin}/sign-out`); await page.getByRole('button', { name: 'Sign out of AccessLobby and supported apps', exact: true }).click();
    await page.waitForURL('**/iam/logout?**'); assert.equal(new URL(page.url()).searchParams.get('post_logout_redirect_uri'), origin);
    assert(!(await context.cookies()).some(cookie => cookie.name === 'al-session'));
  });
  await check('native POST survives disabled client scripts; no-script loading is explained; cross-origin writes stay rejected', async () => {
    const native = await browser.newContext({ serviceWorkers: 'block' });
    try {
      await native.addCookies([{ name: 'al-session', value: token, url: origin, httpOnly: true, sameSite: 'Lax' }]);
      const noJs = await native.newPage(); noJs.setDefaultTimeout(8000);
      await noJs.goto(`${origin}/apps/manage`);
      await noJs.locator(`input[id="grant-${appId}"]`).fill(otherId);
      const protocol = await native.newCDPSession(noJs);
      await noJs.getByRole('button', { name: 'Grant entry', exact: true }).scrollIntoViewIfNeeded();
      const button = await noJs.getByRole('button', { name: 'Grant entry', exact: true }).boundingBox();
      await protocol.send('Emulation.setScriptExecutionDisabled', { value: true });
      const count = mutations.length;
      await noJs.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
      await noJs.waitForURL('**/apps/manage?notice=granted', { waitUntil: 'commit' });
      assert.equal(mutations.length, count + 1); assert.equal(mutations.at(-1).method, 'POST');
      assert.deepEqual(mutations.at(-1).body, { personId: otherId });
      assert.match(await noJs.content(), /Some account pages need JavaScript to finish loading/);
      const refused = await native.request.post(`${origin}/apps/action`, { headers: { origin: 'https://untrusted.example' }, form: { intent: 'grant', applicationId: appId, personId: otherId } });
      assert.equal(refused.status(), 403); assert.equal(mutations.length, count + 1);
    } finally { await native.close(); }
  });
  await check('no hydration errors; missing-page navigation works', async () => {
    await page.goto(`${origin}/not-a-real-page`); await page.getByRole('heading', { name: 'Let’s find your way back.', exact: true }).waitFor();
    assert.deepEqual(consoleErrors, []);
  });
} finally {
  if (browser) await browser.close(); server.kill('SIGTERM'); api.close();
  writeFileSync(resolve(artifacts, 'report.json'), JSON.stringify({ fixture: 'Loopback-only synthetic identity API; not live IAM acceptance', failures, consoleErrors }, null, 2));
}
if (failures.length) throw new Error(`${failures.length} UI checks failed`);
console.log('Production UI browser smoke passed. Screenshots and report: artifacts/ui-refinement');
