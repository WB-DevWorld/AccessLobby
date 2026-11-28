/** Joined round-four smoke extension. The parent owns the real isolated
 * PostgreSQL/API/production Next/browser and synthetic signed OIDC fixture.
 * No live IAM, staging, estate or installed-device result is inferred. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { manageOperatorRole } = await import(pathToFileURL(resolve(root, 'apps/api/dist/manage-operator.js')).href);
const receiptHash = value => createHash('sha256').update(value).digest('hex');

/** Invoke after the parent's production web/browser are ready. contextFor must
 * accept context options, retain cleanup ownership and seal its fixture token.
 * All new actors, applications and mutations belong only to this helper. */
export async function runOperatorRound4Smoke({ browser, pool, issuer, apiOrigin, origin, mint, contextFor, check, noPrivateValues }) {
  for (const endpoint of [issuer, apiOrigin, origin]) assert(['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname), 'Round-four smoke requires owned loopback fixtures');
  assert(browser && typeof mint === 'function' && typeof contextFor === 'function');
  const secrets = new Set(), pages = [];
  let browserErrors = 0;
  function privateAbsent(value) {
    noPrivateValues(value);
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    for (const secret of secrets) assert(!text.includes(secret), 'Private round-four authentication value reached a response');
  }
  const actors = Object.fromEntries(['owner', 'foreign', 'launcher', 'auditor'].map(name => [name, {
    id: randomUUID(), subject: 'private-round4-subject-' + randomUUID(), sid: 'private-round4-sid-' + randomUUID(),
  }]));
  for (const actor of Object.values(actors)) {
    secrets.add(actor.subject); secrets.add(actor.sid);
    await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [actor.id]);
    await pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3)', [issuer, actor.subject, actor.id]);
  }
  await manageOperatorRole(pool, actors.launcher.id, 'grant', 'application_operator', 'round4-isolated-launcher');
  await manageOperatorRole(pool, actors.auditor.id, 'grant', 'support_reader', 'round4-isolated-auditor');
  async function signed(actor, client = 'accesslobby-web') {
    const token = await mint(actor, client); secrets.add(token); return token;
  }
  const tokens = Object.fromEntries(await Promise.all(Object.entries(actors).map(async ([name, actor]) => [name, await signed(actor)])));
  async function response(path, token, init = {}) {
    return fetch(apiOrigin + path, { ...init, headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers,
    }, signal: AbortSignal.timeout(6000) });
  }
  async function json(path, token, status = 200, init = {}) {
    const result = await response(path, token, init);
    assert.equal(result.status, status, 'Unexpected round-four API status for ' + path);
    assert.match(result.headers.get('cache-control') ?? '', /no-store/);
    const value = await result.json(); privateAbsent(value); return value;
  }
  const post = body => ({ method: 'POST', body: JSON.stringify(body) });
  async function fixtureApp(name, suffix, admission = 'authenticated_open', visibility = 'discoverable') {
    const app = await json('/v1/applications', tokens.owner, 201, post({ name, clientId: 'round4-' + suffix + '-' + randomUUID(),
      platform: 'web', redirectUri: 'https://' + suffix + '.round4.example.test/callback', logoutUri: 'https://' + suffix + '.round4.example.test/', visibility, admission }));
    // Explicit synthetic legacy-active registry/DNS state; no real provisioning or DNS claim.
    await pool.query(`UPDATE applications SET status='active',trust_class='first_party',activated_at=clock_timestamp(),
      origin_verified_at=clock_timestamp(),origin_verified_host=$2,review_reference='round4-synthetic-active' WHERE id=$1`, [app.id, app.originVerificationHost]);
    return { ...app, name };
  }
  const openApp = await fixtureApp('Round four open app', 'open');
  const restricted = await fixtureApp('Round four restricted app', 'restricted', 'grant_required');
  const hidden = await fixtureApp('Round four hidden app', 'hidden', 'authenticated_open', 'hidden');
  await json(`/v1/applications/${restricted.id}/grants`, tokens.owner, 201, post({ personId: actors.owner.id }));
  const contexts = {};
  for (const name of ['owner', 'foreign', 'launcher', 'auditor']) {
    contexts[name] = await contextFor(tokens[name], name === 'owner' ? { serviceWorkers: 'allow' } : {});
  }
  function pageFor(context) {
    return context.newPage().then(page => { pages.push(page); page.setDefaultTimeout(15000); page.on('pageerror', () => { browserErrors++; }); return page; });
  }
  const ownerPage = await pageFor(contexts.owner), foreignPage = await pageFor(contexts.foreign);
  const launcherPage = await pageFor(contexts.launcher), auditPage = await pageFor(contexts.auditor);
  async function protectedPage(page, path, heading) {
    const entry = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    assert.match(entry.headers()['cache-control'] ?? '', /no-store/);
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' });
    privateAbsent(await page.content()); return entry;
  }
  async function issue(actor, app) {
    const bearer = await signed(actor, app.clientId);
    const result = await response('/v1/me', bearer, { headers: { 'x-accesslobby-session-receipt': '1' } });
    assert.equal(result.status, 200); assert.match(result.headers.get('cache-control') ?? '', /no-store/);
    const value = await result.json();
    assert.equal(value.person.id, actor.id); assert.equal(value.peerSession.contract, 'accesslobby.peer-session.v0.1');
    assert.match(value.peerSession.receipt, /^[A-Za-z0-9_-]{43}$/);
    secrets.add(value.peerSession.receipt); secrets.add(receiptHash(value.peerSession.receipt));
    return { receipt: value.peerSession.receipt, clientId: app.clientId };
  }
  async function receiptStatus(receipt, status = 200) {
    return json('/v1/peer-sessions/status', undefined, status, { method: 'POST', headers: {
      authorization: 'PeerSession ' + receipt.receipt, 'x-accesslobby-client-id': receipt.clientId,
    } });
  }
  async function nativeConfirmation(page, button, destination) {
    const finished = page.waitForURL(destination, { timeout: 15000 });
    await button.click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Confirm this change' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click();
    await finished;
  }
  const scope = { syntheticIssuer: true, liveIam: 'NOT RUN', staging: 'NOT RUN', production: 'NOT RUN',
    recordedSessionEnd: false, freshRetryPreserved: false, admissionGatedCards: false, nativeCsvDownload: false,
    activeWorker: false, privateCacheEntries: 0 };
  let original, duplicate, newer, otherClient, otherBrowser, foreignReceipt, selected;
  const otherBrowserActor = { ...actors.owner, sid: 'private-round4-sid-' + randomUUID() };
  secrets.add(otherBrowserActor.sid);

  await check('round4 real API scopes ordinary recorded sessions and rejects foreign, stale and caller-selected targets', async () => {
    original = await issue(actors.owner, openApp); duplicate = await issue(actors.owner, openApp);
    otherClient = await issue(actors.owner, restricted); otherBrowser = await issue(otherBrowserActor, openApp);
    foreignReceipt = await issue(actors.foreign, openApp);
    const page = await json('/v1/account/sessions', tokens.owner);
    assert.equal(page.contract, 'accesslobby.account-sessions.v0.1'); assert.equal(page.sessions.length, 3);
    selected = page.sessions.find(row => row.clientId === openApp.clientId && row.currentBrowser);
    assert.equal(selected.receiptCount, 2); assert(!JSON.stringify(page).includes(issuer));
    const foreign = await json('/v1/account/sessions', tokens.foreign);
    assert.equal(foreign.sessions.length, 1); assert(!page.sessions.some(row => row.handle === foreign.sessions[0].handle));
    await json(`/v1/account/sessions/${foreign.sessions[0].handle}/end`, tokens.owner, 404, post({ expectedState: foreign.sessions[0].expectedState }));
    await json(`/v1/account/sessions?personId=${actors.foreign.id}`, tokens.owner, 400);
    await json(`/v1/account/sessions/${selected.handle}/end`, tokens.owner, 400, post({ expectedState: selected.expectedState, personId: actors.foreign.id }));
    newer = await issue(actors.owner, openApp);
    await json(`/v1/account/sessions/${selected.handle}/end`, tokens.owner, 409, post({ expectedState: selected.expectedState }));
    assert.equal((await receiptStatus(newer)).active, true);
    selected = (await json('/v1/account/sessions', tokens.owner)).sessions.find(row => row.clientId === openApp.clientId && row.currentBrowser);
    assert.equal(selected.receiptCount, 3);
    const csrf = await contexts.owner.request.post(origin + '/security/action', { maxRedirects: 0, headers: { origin: 'https://unrelated.example.test' },
      form: { intent: 'end-recorded-session', handle: selected.handle, expectedState: selected.expectedState, confirmEnd: 'yes' } });
    assert.equal(csrf.status(), 403); assert.match(csrf.headers()['cache-control'] ?? '', /no-store/);
    assert.equal((await receiptStatus(original)).active, true);
  });

  await check('round4 production security page under the real worker ends only the confirmed record and preserves fresh retries', async () => {
    await ownerPage.goto(origin, { waitUntil: 'domcontentloaded' });
    await ownerPage.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL === new URL('/sw.js', location.origin).href, null, { timeout: 20000 });
    const entry = await protectedPage(ownerPage, '/security', 'Recorded app sessions');
    assert(entry.fromServiceWorker(), 'Security navigation must pass through the actual product worker'); scope.activeWorker = true;
    await ownerPage.setViewportSize({ width: 390, height: 900 });
    const card = ownerPage.locator('section.surface-card').filter({ has: ownerPage.getByRole('heading', { name: openApp.name, exact: true }) })
      .filter({ hasText: 'This browser’s sign-in' });
    assert.equal(await card.count(), 1);
    await card.locator('details > summary').click();
    await card.getByLabel('Confirm ending this recorded session', { exact: true }).check();
    await nativeConfirmation(ownerPage, card.getByRole('button', { name: 'End recorded session', exact: true }), '**/security?notice=ended');
    await ownerPage.getByText('Recorded session ended. The app applies this on its next session check.', { exact: true }).waitFor();
    for (const ended of [original, duplicate, newer]) await receiptStatus(ended, 401);
    for (const control of [otherClient, otherBrowser, foreignReceipt]) assert.equal((await receiptStatus(control)).active, true);
    assert(!(await json('/v1/account/sessions', tokens.owner)).sessions.some(row => row.handle === selected.handle)); scope.recordedSessionEnd = true;
    const fresh = await issue(actors.owner, openApp);
    const retry = await contexts.owner.request.post(origin + '/security/action', { maxRedirects: 0, headers: { origin },
      form: { intent: 'end-recorded-session', handle: selected.handle, expectedState: selected.expectedState, confirmEnd: 'yes' } });
    assert.equal(retry.status(), 303); assert.equal(new URL(retry.headers().location).searchParams.get('notice'), 'unchanged');
    assert.equal((await receiptStatus(fresh)).active, true); scope.freshRetryPreserved = true;
    assert(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    privateAbsent(await ownerPage.content());
    const cached = await ownerPage.evaluate(async () => {
      const records = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) records.push(new URL(request.url).pathname);
      return records;
    });
    assert(cached.length >= 3); assert(cached.every(path => path === '/offline.html' || path.startsWith('/icons/') || path.startsWith('/_next/static/')));
    assert.equal(cached.filter(path => path.startsWith('/security') || path.startsWith('/admin') || path.startsWith('/v1/') || path.startsWith('/auth/')).length, 0);
    scope.privateCacheEntries = 0;
  });

  await check('round4 personal history shows only own recorded endings through real API and paginated production browser', async () => {
    const own = await json('/v1/account/security-events', tokens.owner);
    assert.equal(own.contract, 'accesslobby.account-security-events.v0.1'); assert.equal(own.events.length, 1);
    const actual = own.events[0]; assert.equal(actual.action, 'app_session_ended'); assert.equal(actual.receiptCount, 3);
    assert.equal(actual.clientId, openApp.clientId); assert.equal(actual.applicationName, openApp.name); assert.notEqual(actual.id, selected.handle);
    assert.match(actual.id, /^[a-f0-9-]{36}$/); assert(!JSON.stringify(own).includes(selected.handle));
    await json(`/v1/account/security-events?personId=${actors.foreign.id}`, tokens.owner, 400);
    const foreignSession = (await json('/v1/account/sessions', tokens.foreign)).sessions[0];
    await json(`/v1/account/sessions/${foreignSession.handle}/end`, tokens.foreign, 200, post({ expectedState: foreignSession.expectedState }));
    const foreign = await json('/v1/account/security-events', tokens.foreign);
    assert.equal(foreign.events.length, 1); assert.notEqual(foreign.events[0].id, actual.id);
    await json(`/v1/account/security-events?after=${foreign.events[0].id}`, tokens.owner, 400);
    // Dedicated extra history records exercise real own-person read/page bounds;
    // the first row above came from the actual native ending and retry.
    for (let i = 0; i < 26; i++) await pool.query(`INSERT INTO account_security_events(person_id,action,client_id,handle,receipt_count)
      VALUES($1,'app_session_ended',$2,gen_random_uuid(),1)`, [actors.owner.id, openApp.clientId]);
    const first = await json('/v1/account/security-events', tokens.owner);
    assert.equal(first.events.length, 25); assert(first.nextCursor);
    const second = await json(`/v1/account/security-events?after=${first.nextCursor}`, tokens.owner);
    assert.equal(second.events.length, 2); assert.equal(second.nextCursor, null); assert.equal(second.events.at(-1).id, actual.id);
    const navigation = ownerPage.waitForURL('**/security/history');
    await ownerPage.getByRole('link', { name: 'Session history', exact: true }).click(); await navigation;
    await ownerPage.getByRole('heading', { name: 'Recorded session history', exact: true }).waitFor({ state: 'visible' });
    const records = ownerPage.getByRole('region', { name: 'Your recorded session history', exact: true });
    // The semantic section has an accessible name; it contains actual server-loaded entries.
    await records.waitFor({ state: 'visible' }); assert.equal(await records.locator('section.surface-card').count(), 25);
    const older = ownerPage.waitForURL(url => url.pathname === '/security/history' && url.searchParams.has('after'));
    await ownerPage.getByRole('link', { name: 'Older entries', exact: true }).click(); await older;
    await records.locator('section.surface-card').nth(2).waitFor({ state: 'detached' });
    assert.equal(await records.locator('section.surface-card').count(), 2);
    await records.getByText('3', { exact: true }).waitFor({ state: 'visible' }); privateAbsent(await ownerPage.content());
    await protectedPage(foreignPage, '/security/history', 'Recorded session history');
    assert.equal(await foreignPage.getByRole('region', { name: 'Your recorded session history', exact: true }).locator('section.surface-card').count(), 1);
    assert(!(await foreignPage.content()).includes(actual.id));
    const privatePaths = await ownerPage.evaluate(async () => {
      let count = 0;
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) {
        if (new URL(request.url).pathname.startsWith('/security')) count++;
      }
      return count;
    });
    assert.equal(privatePaths, 0); scope.personalHistory = true;
  });

  await check('round4 real launch API requires current application authority and safe same-origin metadata', async () => {
    const detail = await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher);
    await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.owner, 403);
    const body = { launchUrl: 'https://open.round4.example.test/start', expectedVersion: detail.launch.version, reference: 'round4-history-http' };
    await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.auditor, 403, post(body));
    for (const url of ['https://elsewhere.example.test/start', 'https://open.round4.example.test/start?token=not-a-real-token', 'javascript:alert(1)', 'http://127.0.0.1/private']) {
      await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher, 400, post({ ...body, launchUrl: url }));
    }
    const saved = await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher, 200, post(body));
    assert.equal(saved.changed, true); assert.equal(saved.launch.launchUrl, body.launchUrl);
    assert.equal((await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher, 200, post(body))).changed, false);
    await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher, 409,
      post({ ...body, reference: 'round4-stale-launch', launchUrl: 'https://open.round4.example.test/newer' }));
  });

  await check('round4 native browser launch editing checks CSRF and rejects a valid-shaped foreign origin without changing metadata', async () => {
    const detail = await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher);
    const route = `/admin/applications/${openApp.id}/launch`;
    const blocked = await contexts.launcher.request.post(origin + route + '/action', { maxRedirects: 0, headers: { origin: 'https://unrelated.example.test' },
      form: { launchUrl: 'https://open.round4.example.test/native', expectedVersion: detail.launch.version, reference: 'round4-csrf-launch' } });
    assert.equal(blocked.status(), 403); assert.match(blocked.headers()['cache-control'] ?? '', /no-store/);
    assert.equal((await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher)).launch.version, detail.launch.version);
    await protectedPage(launcherPage, route, 'App launch link');
    await launcherPage.getByLabel('Launch URL', { exact: true }).fill('https://open.round4.example.test/native');
    await launcherPage.getByLabel('Change reference', { exact: true }).fill('round4-history-browser');
    await nativeConfirmation(launcherPage, launcherPage.getByRole('button', { name: 'Save launch link', exact: true }), '**/launch?notice=saved');
    await launcherPage.getByText('Launch link saved.', { exact: true }).waitFor();
    const saved = await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher);
    assert.equal(saved.launch.launchUrl, 'https://open.round4.example.test/native');
    await launcherPage.getByLabel('Launch URL', { exact: true }).fill('https://elsewhere.example.test/native');
    await launcherPage.getByLabel('Change reference', { exact: true }).fill('round4-invalid-browser-origin');
    await nativeConfirmation(launcherPage, launcherPage.getByRole('button', { name: 'Save launch link', exact: true }), '**/launch?notice=invalid_application_launch_url');
    const unchanged = await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher);
    assert.equal(unchanged.launch.version, saved.launch.version); assert.equal(unchanged.launch.launchUrl, saved.launch.launchUrl);
    privateAbsent(await launcherPage.content());
  });

  await check('round4 production app cards expose reviewed links only when discovery and current admission permit them', async () => {
    for (const app of [restricted, hidden]) {
      const detail = await json(`/v1/admin/applications/${app.id}/launch`, tokens.launcher);
      await json(`/v1/admin/applications/${app.id}/launch`, tokens.launcher, 200, post({ launchUrl: `https://${app === restricted ? 'restricted' : 'hidden'}.round4.example.test/entry`,
        expectedVersion: detail.launch.version, reference: 'round4-link-' + (app === restricted ? 'restricted' : 'hidden') }));
    }
    const admitted = await json('/v1/applications/visible', tokens.owner), denied = await json('/v1/applications/visible', tokens.foreign);
    assert.equal(admitted.applications.find(app => app.id === restricted.id).admitted, true);
    const restrictedDenied = denied.applications.find(app => app.id === restricted.id);
    assert.equal(restrictedDenied.admitted, false); assert.equal(Object.hasOwn(restrictedDenied, 'launchUrl'), false);
    assert(!denied.applications.some(app => app.id === hidden.id));
    await protectedPage(ownerPage, '/apps', 'Your apps');
    await ownerPage.getByRole('link', { name: 'Open ' + openApp.name, exact: true }).waitFor({ state: 'visible' });
    assert.equal(await ownerPage.getByRole('link', { name: 'Open ' + openApp.name, exact: true }).getAttribute('href'), 'https://open.round4.example.test/native');
    await ownerPage.getByRole('link', { name: 'Open ' + restricted.name, exact: true }).waitFor({ state: 'visible' });
    await protectedPage(foreignPage, '/apps', 'Your apps');
    await foreignPage.getByText(restricted.name, { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await foreignPage.getByRole('link', { name: 'Open ' + restricted.name, exact: true }).count(), 0);
    assert.equal(await foreignPage.getByText(hidden.name, { exact: true }).count(), 0);
    await json(`/v1/applications/${restricted.id}/grants/${actors.owner.id}`, tokens.owner, 200, { method: 'DELETE' });
    const afterRevoke = (await json('/v1/applications/visible', tokens.owner)).applications.find(app => app.id === restricted.id);
    assert.equal(afterRevoke.admitted, false); assert.equal(Object.hasOwn(afterRevoke, 'launchUrl'), false);
    await protectedPage(ownerPage, '/apps', 'Your apps');
    await ownerPage.getByText(restricted.name, { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await ownerPage.getByRole('link', { name: 'Open ' + restricted.name, exact: true }).count(), 0);
    await ownerPage.getByRole('link', { name: 'Open ' + openApp.name, exact: true }).waitFor({ state: 'visible' });
    scope.admissionGatedCards = true;
  });

  await check('round4 real filtered history paginates and a native CSV download preserves filters and privacy headers', async () => {
    // Explicit extra stored fixture events exercise real read/export bounds;
    // the HTTP and native launch changes above are separate real mutations.
    for (let i = 0; i < 26; i++) await pool.query(`INSERT INTO operator_audit_events(actor_person_id,action,target_type,target_id,reference)
      VALUES($1,'application.launch_set','application',$2,$3)`, [actors.launcher.id, openApp.id, (i === 0 ? '-' : '') + 'round4-history-fixture-' + i]);
    const day = new Date().toISOString().slice(0, 10);
    const filters = new URLSearchParams({ action: 'application.launch_set', actorPersonId: actors.launcher.id,
      targetId: openApp.id, reference: 'round4-history', from: day, to: day });
    const first = await json('/v1/admin/audit?' + filters, tokens.auditor);
    assert.equal(first.events.length, 25); assert(first.nextCursor);
    assert(first.events.every(row => row.targetId === openApp.id && row.reference.includes('round4-history')));
    const second = await json('/v1/admin/audit?' + filters + '&after=' + first.nextCursor, tokens.auditor);
    assert.equal(second.nextCursor, null); assert.equal(second.events.length, 3);
    await protectedPage(auditPage, '/admin/audit', 'Operator history');
    await auditPage.locator('details > summary').filter({ hasText: /^Filters$/ }).click();
    for (const [label, value] of [['Exact action', 'application.launch_set'], ['Actor AccessLobby ID', actors.launcher.id],
      ['Target ID', openApp.id], ['Reference contains', 'round4-history'], ['From (UTC)', day], ['Through (UTC)', day]]) {
      await auditPage.getByLabel(label, { exact: true }).fill(value);
    }
    const applied = auditPage.waitForURL(url => url.pathname === '/admin/audit' && url.searchParams.get('reference') === 'round4-history');
    await auditPage.getByRole('button', { name: 'Apply filters', exact: true }).click(); await applied;
    const table = auditPage.getByRole('region', { name: 'Operator history results', exact: true });
    await table.waitFor({ state: 'visible' }); assert.equal(await table.locator('tbody tr').count(), 25);
    const next = auditPage.waitForURL(url => url.searchParams.has('after'));
    await auditPage.getByRole('link', { name: 'Next page', exact: true }).click(); await next;
    await table.locator('tbody tr').nth(3).waitFor({ state: 'detached' });
    assert.equal(await table.locator('tbody tr').count(), 3);
    const exportLink = auditPage.getByRole('link', { name: 'Export CSV', exact: true });
    const href = new URL(await exportLink.getAttribute('href'), origin);
    assert.equal(href.searchParams.has('after'), false); assert.equal(href.searchParams.get('targetId'), openApp.id);
    const downloadPromise = auditPage.waitForEvent('download');
    const responsePromise = auditPage.waitForResponse(result => new URL(result.url()).pathname === '/admin/audit/export');
    await exportLink.click();
    const [download, exported] = await Promise.all([downloadPromise, responsePromise]);
    assert.equal(download.suggestedFilename(), 'accesslobby-operator-history.csv'); assert.equal(exported.status(), 200);
    const headers = exported.headers(); assert.match(headers['cache-control'] ?? '', /private.*no-store/);
    assert.equal(headers['x-content-type-options'], 'nosniff'); assert.match(headers['content-type'] ?? '', /^text\/csv/);
    assert.match(headers['content-disposition'] ?? '', /^attachment;/); assert.equal(headers['x-accesslobby-export-count'], '28');
    assert.equal(headers['x-accesslobby-export-truncated'], 'false');
    const stream = await download.createReadStream(); assert(stream);
    const chunks = []; let bytes = 0;
    for await (const chunk of stream) { bytes += chunk.length; assert(bytes <= 1024 * 1024); chunks.push(chunk); }
    const csv = Buffer.concat(chunks).toString('utf8');
    assert(csv.startsWith('"id","occurredAt","action","actorPersonId","targetType","targetId","reference"\r\n'));
    assert.equal(csv.trimEnd().split('\r\n').length, 29); assert(csv.includes("\"'-round4-history-fixture-0\""));
    privateAbsent(csv); privateAbsent(await auditPage.content()); scope.nativeCsvDownload = true;
  });

  await check('round4 ordinary and revoked operators cannot read filtered history or download CSV with the same bearer', async () => {
    await json('/v1/admin/audit?reference=round4-history', tokens.owner, 403);
    const ordinary = await response('/v1/admin/audit/export?reference=round4-history', tokens.owner);
    assert.equal(ordinary.status, 403); assert.match(ordinary.headers.get('cache-control') ?? '', /no-store/);
    const ordinaryWeb = await contexts.owner.request.get(origin + '/admin/audit/export?reference=round4-history');
    assert.equal(ordinaryWeb.status(), 403); assert.match(ordinaryWeb.headers()['cache-control'] ?? '', /private.*no-store/);
    await manageOperatorRole(pool, actors.auditor.id, 'revoke', 'support_reader', 'round4-auditor-revocation');
    await json('/v1/admin/audit?reference=round4-history', tokens.auditor, 403);
    const revokedWeb = await contexts.auditor.request.get(origin + '/admin/audit/export?reference=round4-history');
    assert.equal(revokedWeb.status(), 403); assert.equal(revokedWeb.headers()['x-content-type-options'], 'nosniff');
    await protectedPage(auditPage, '/admin/audit?reference=round4-history', 'Operator access required');
    assert.equal(await auditPage.getByRole('region', { name: 'Operator history results', exact: true }).count(), 0);
    const launch = await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher);
    await manageOperatorRole(pool, actors.launcher.id, 'revoke', 'application_operator', 'round4-launcher-revocation');
    await json(`/v1/admin/applications/${openApp.id}/launch`, tokens.launcher, 403, post({ launchUrl: null,
      expectedVersion: launch.launch.version, reference: 'round4-revoked-write' }));
    await protectedPage(launcherPage, `/admin/applications/${openApp.id}/launch`, 'Operator access required');
    assert.equal(await launcherPage.getByRole('button', { name: 'Save launch link', exact: true }).count(), 0);
    assert.equal(browserErrors, 0, 'Round-four browser reported an unexpected runtime error');
  });
  scope.browserRuntimeErrors = browserErrors;
  return scope;
}
