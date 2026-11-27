/** Real production service-worker coverage for the joined operator fixture.
 * The caller owns the isolated real database/API/UI and synthetic OIDC issuer.
 * This helper never changes product source, caches private authority, or claims
 * live staging/installed-device acceptance. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const requireWeb = createRequire(resolve(root, 'apps/web/package.json'));
const { EncryptJWT } = await import(pathToFileURL(requireWeb.resolve('jose')).href);

/**
 * Invoke after the parent fixture starts production Next and before its final
 * reviewer-role revocation. revokeReviewer/restoreReviewer operate only on the
 * parent's isolated fixture. mintExpiredToken returns a genuinely signed,
 * already-expired bearer, not an invalid signature or expired web container.
 */
export async function runOperatorWorkerSmoke({
  browser, origin, reviewerToken, sessionKey, revokeReviewer, restoreReviewer,
  mintExpiredToken, check, noPrivateValues,
}) {
  const target = new URL(origin);
  assert(['127.0.0.1', 'localhost'].includes(target.hostname), 'Worker fixture requires a loopback origin');
  assert.equal(target.origin, origin, 'Worker fixture origin must have no path');
  assert(Buffer.isBuffer(sessionKey) && sessionKey.length === 32, 'Worker fixture requires its ephemeral sealing key');
  assert.equal(typeof mintExpiredToken, 'function', 'Expired signed bearer fixture is required');

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  let runtimeErrorCount = 0, failedStaticRequestCount = 0;
  page.on('pageerror', () => { runtimeErrorCount++; });
  page.on('requestfailed', request => {
    if (new URL(request.url()).pathname.startsWith('/_next/static/')) failedStaticRequestCount++;
  });
  let roleRevoked = false;
  const result = { scope: 'active production service worker; real isolated API/database; synthetic signed OIDC',
    controlledHardReload: false, clientNavigationSettled: false,
    revokedRoleDenied: false, expiredBearerDenied: false, privateCacheEntries: 0,
    approvedStaticCacheEntries: 0, storageFaults: [] };

  async function session(accessToken) {
    const cookie = await new EncryptJWT({ accessToken }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt().setExpirationTime('15m').encrypt(sessionKey);
    await context.addCookies([{ name: target.protocol === 'https:' ? '__Host-al-session' : 'al-session',
      value: cookie, url: origin, httpOnly: true, secure: target.protocol === 'https:', sameSite: 'Lax' }]);
  }
  async function controlled() {
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration('/');
      return {
        controller: navigator.serviceWorker.controller?.scriptURL === new URL('/sw.js', location.origin).href,
        active: registration?.active?.state === 'activated',
        scope: registration?.scope === location.origin + '/',
      };
    });
    assert.deepEqual(state, { controller: true, active: true, scope: true }, 'Expected the actual activated product worker to control this page');
  }
  async function settledOverview() {
    await page.getByRole('heading', { name: 'Operator console', exact: true }).waitFor({ state: 'visible' });
    await page.getByText(/Your operator access is checked against current database grants/).waitFor({ state: 'visible' });
    await page.getByText(/You can review application requests\./).waitFor({ state: 'visible' });
    await page.getByText(/You can manage person status\./).waitFor({ state: 'visible' });
    await page.getByText(/You can request and retry reviewed activations\./).waitFor({ state: 'visible' });
    await page.getByText('Checking operator access…', { exact: true }).waitFor({ state: 'hidden' });
    noPrivateValues(await page.content());
    await controlled();
  }
  async function privateCacheAbsent() {
    // Only the approved neutral offline shell, icons and immutable Next assets
    // may enter Cache Storage. Keep request URLs/bodies in memory for assertions;
    // return only categorical counts to the caller's retained evidence.
    const inventory = await page.evaluate(async () => {
      const records = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          const response = await cache.match(request);
          records.push({ path: url.pathname, search: url.search,
            sameOrigin: url.origin === location.origin, body: response ? await response.text() : '' });
        }
      }
      return records;
    });
    const approved = path => path === '/offline.html' || path === '/icons/icon-192.png' ||
      path === '/icons/icon-512.png' || path.startsWith('/_next/static/');
    assert(inventory.length >= 3, 'Expected the real installed worker to populate its neutral shell');
    for (const item of inventory) {
      assert(item.sameOrigin && approved(item.path) && item.search === '', 'A private or unapproved response reached Cache Storage');
      noPrivateValues(item.body);
      assert(!item.body.includes(reviewerToken), 'Bearer reached Cache Storage');
    }
    assert.equal(inventory.filter(item => item.path.startsWith('/admin') || item.path.startsWith('/v1/') ||
      item.path.startsWith('/auth/') || item.path === '/account' || item.path === '/identity').length, 0);
    result.approvedStaticCacheEntries = inventory.length;
    result.privateCacheEntries = 0;
  }

  try {
    await session(reviewerToken);
    await check('actual installed worker controls hard reload and operator overview visibly settles', async () => {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL === new URL('/sw.js', location.origin).href,
        null, { timeout: 20000 });
      await controlled();
      const entry = await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded' });
      assert(entry?.fromServiceWorker(), 'Overview document must pass through the real worker');
      assert.match(entry.headers()['cache-control'] ?? '', /no-store/);
      await settledOverview();
      const reload = await page.reload({ waitUntil: 'domcontentloaded' });
      assert(reload?.fromServiceWorker(), 'Hard reload must remain under active worker control');
      assert.match(reload.headers()['cache-control'] ?? '', /no-store/);
      await settledOverview();
      result.controlledHardReload = true;
    });

    await check('worker-controlled client navigation People to Overview replaces the loading state', async () => {
      const marker = randomBytes(12).toString('hex');
      await page.evaluate(value => { window.__operatorSmokeDocument = value; }, marker);
      const navigation = page.getByRole('navigation', { name: 'Operator console sections', exact: true });
      await navigation.getByRole('link', { name: 'People', exact: true }).click();
      await page.waitForURL(`${origin}/admin/people`);
      await page.getByRole('heading', { name: 'People', exact: true }).waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => window.__operatorSmokeDocument), marker, 'Expected a client-side transition without a new document');
      await page.getByRole('navigation', { name: 'Operator console sections', exact: true })
        .getByRole('link', { name: 'Overview', exact: true }).click();
      await page.waitForURL(`${origin}/admin`);
      assert.equal(await page.evaluate(() => window.__operatorSmokeDocument), marker, 'Overview must complete in the same document');
      await settledOverview();
      await privateCacheAbsent();
      result.clientNavigationSettled = true;
    });

    // These are faults in this owned test profile's actual running product
    // worker, not intercepted network responses, a mocked worker, or a bypass.
    // Disabling the browser HTTP cache keeps successful cached scripts from
    // masking the failure, while service-worker interception remains enabled.
    const devtools = await context.newCDPSession(page);
    await devtools.send('Network.enable');
    await devtools.send('Network.setCacheDisabled', { cacheDisabled: true });
    try {
      for (const mode of ['open-throws', 'match-throws', 'put-throws', 'put-never-settles']) {
        await check(`real worker ${mode} retains network JS/CSS and a visibly settled overview`, async () => {
          await controlled();
          const worker = context.serviceWorkers().find(worker => worker.url() === new URL('/sw.js', origin).href);
          assert(worker, 'Expected an actual product service-worker execution context');
          const resources = [];
          let staticFailures = 0;
          const staticKind = request => {
            const kind = request.resourceType();
            return ['script', 'stylesheet'].includes(kind) && new URL(request.url()).pathname.startsWith('/_next/static/') ? kind : null;
          };
          const onResponse = response => {
            const kind = staticKind(response.request());
            if (kind) resources.push({ kind, success: response.ok(), fromWorker: response.fromServiceWorker() });
          };
          const onFailure = request => { if (staticKind(request)) staticFailures++; };
          page.on('response', onResponse);
          page.on('requestfailed', onFailure);
          let patched = false;
          try {
            await worker.evaluate(mode => {
              if (self.__operatorCacheFault) throw new Error('Cache fault already installed');
              const saved = { open: CacheStorage.prototype.open, match: Cache.prototype.match, put: Cache.prototype.put };
              self.__operatorCacheFault = saved;
              const reject = () => Promise.reject(new DOMException('Owned operator storage fixture', 'QuotaExceededError'));
              if (mode === 'open-throws') CacheStorage.prototype.open = reject;
              if (mode === 'match-throws') Cache.prototype.match = reject;
              if (mode === 'put-throws' || mode === 'put-never-settles') {
                // Force a miss for each requested static asset so a previous
                // successful load cannot avoid the actual put failure.
                Cache.prototype.match = function(request, options) {
                  const url = new URL(typeof request === 'string' ? request : request.url, self.location.origin);
                  return url.pathname.startsWith('/_next/static/') ? Promise.resolve(undefined) : saved.match.call(this, request, options);
                };
                Cache.prototype.put = mode === 'put-throws' ? reject : () => new Promise(() => {});
              }
            }, mode);
            patched = true;
            const response = await page.reload({ waitUntil: 'load', timeout: 20000 });
            assert(response?.fromServiceWorker(), 'Storage-fault document must remain worker controlled');
            await settledOverview();
            assert(resources.some(item => item.kind === 'script' && item.success && item.fromWorker), 'No actual worker-controlled JavaScript response succeeded');
            assert(resources.some(item => item.kind === 'stylesheet' && item.success && item.fromWorker), 'No actual worker-controlled stylesheet response succeeded');
            assert.equal(staticFailures, 0, 'A static resource request failed under storage pressure');
            assert(resources.every(item => item.success && item.fromWorker), 'Static delivery did not pass through the actual worker successfully');
            result.storageFaults.push({ mode, result: 'PASS', workerControlled: true, scriptDelivered: true, stylesheetDelivered: true, overviewVisible: true, loadingVisible: false });
          } finally {
            // Fixed labels, booleans and counts only; no URL, token, person,
            // session, response body or screenshot enters retained diagnostics.
            const headingVisible = await page.getByRole('heading', { name: 'Operator console', exact: true }).isVisible().catch(() => false);
            const loadingVisible = await page.getByText('Checking operator access…', { exact: true }).isVisible().catch(() => false);
            console.log(`Operator storage diagnostic ${JSON.stringify({ mode,
              workerControlled: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)).catch(() => false),
              successfulWorkerScripts: resources.filter(item => item.kind === 'script' && item.success && item.fromWorker).length,
              successfulWorkerStylesheets: resources.filter(item => item.kind === 'stylesheet' && item.success && item.fromWorker).length,
              staticFailures, headingVisible, loadingVisible })}`);
            page.off('response', onResponse); page.off('requestfailed', onFailure);
            if (patched) await worker.evaluate(() => {
              const saved = self.__operatorCacheFault;
              if (!saved) throw new Error('Owned cache fault state missing');
              CacheStorage.prototype.open = saved.open; Cache.prototype.match = saved.match; Cache.prototype.put = saved.put;
              delete self.__operatorCacheFault;
            });
          }
        });
      }
    } finally {
      await devtools.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
      await devtools.detach().catch(() => {});
    }

    await check('active worker cannot preserve operator authority after current database revocation', async () => {
      await revokeReviewer(); roleRevoked = true;
      const response = await page.reload({ waitUntil: 'domcontentloaded' });
      assert(response?.fromServiceWorker());
      await page.getByRole('heading', { name: 'Operator access required', exact: true }).waitFor({ state: 'visible' });
      await page.getByText('Checking operator access…', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.getByText(/Your operator access is checked against current database grants/).count(), 0);
      await controlled();
      await privateCacheAbsent();
      result.revokedRoleDenied = true;
      await restoreReviewer(); roleRevoked = false;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await settledOverview();
    });

    await check('active worker cannot reuse private overview after bearer expiry', async () => {
      const expiredToken = await mintExpiredToken();
      assert(typeof expiredToken === 'string' && expiredToken.split('.').length === 3 && expiredToken !== reviewerToken,
        'Expected the parent fixture to supply a separate expired signed token');
      await session(expiredToken);
      const response = await page.reload({ waitUntil: 'domcontentloaded' });
      assert(response?.fromServiceWorker());
      await page.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor({ state: 'visible' });
      await page.getByText('Checking operator access…', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.getByText(/Your operator access is checked against current database grants/).count(), 0);
      const html = await page.content(); noPrivateValues(html);
      assert(!html.includes(expiredToken), 'Expired bearer reached document output');
      await controlled();
      await privateCacheAbsent();
      result.expiredBearerDenied = true;
    });
    assert.equal(runtimeErrorCount, 0, 'Worker-controlled console emitted a browser runtime error');
    assert.equal(failedStaticRequestCount, 0, 'Worker-controlled console failed a static asset request');
    return result;
  } catch (error) {
    // Preserve the useful distinction from the reported failure: completed SSR
    // may exist in the DOM while the loading boundary remains visibly stuck.
    // Only booleans/counts and fixed route/state labels enter diagnostic output.
    const visible = await page.evaluate(() => {
      const shown = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const headings = Array.from(document.querySelectorAll('h1'));
      const paragraphs = Array.from(document.querySelectorAll('p'));
      return {
        route: location.pathname === '/admin' ? 'overview' : location.pathname === '/admin/people' ? 'people' : 'other',
        workerControlled: navigator.serviceWorker.controller?.scriptURL === new URL('/sw.js', location.origin).href,
        overviewMarkupPresent: headings.some(element => element.textContent === 'Operator console'),
        overviewHeadingVisible: headings.some(element => element.textContent === 'Operator console' && shown(element)),
        loadingVisible: paragraphs.some(element => element.textContent === 'Checking operator access…' && shown(element)),
        capabilitiesMarkupPresent: paragraphs.some(element => element.textContent?.includes('Your operator access is checked against current database grants')),
        capabilitiesVisible: paragraphs.some(element => element.textContent?.includes('Your operator access is checked against current database grants') && shown(element)),
      };
    }).catch(() => ({ pageStateAvailable: false }));
    console.error(`Operator worker diagnostic ${JSON.stringify({ ...visible, runtimeErrorCount, failedStaticRequestCount })}`);
    throw error;
  } finally {
    try { if (roleRevoked) await restoreReviewer(); }
    finally { await context.close(); }
  }
}
