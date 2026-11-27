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
  browser, origin, reviewerToken, ordinaryToken, organizationId, sessionKey, revokeReviewer, restoreReviewer,
  mintExpiredToken, check, noPrivateValues,
}) {
  const target = new URL(origin);
  assert(['127.0.0.1', 'localhost'].includes(target.hostname), 'Worker fixture requires a loopback origin');
  assert.equal(target.origin, origin, 'Worker fixture origin must have no path');
  assert(Buffer.isBuffer(sessionKey) && sessionKey.length === 32, 'Worker fixture requires its ephemeral sealing key');
  assert.equal(typeof mintExpiredToken, 'function', 'Expired signed bearer fixture is required');
  assert(typeof organizationId === 'string' && /^[0-9a-f-]{36}$/i.test(organizationId), 'An isolated organization fixture is required');

  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  let runtimeErrorCount = 0, failedStaticRequestCount = 0;
  let staticFaultPhase = 'normal';
  const staticRequestPhases = new WeakMap(), staticFailureCounts = new Map();
  const staticResourceKind = request => {
    if (!new URL(request.url()).pathname.startsWith('/_next/static/')) return null;
    const kind = request.resourceType();
    return kind === 'script' || kind === 'stylesheet' ? kind : 'other';
  };
  function failureDetails(text) {
    const reason = typeof text === 'string' ? text : '';
    const kind = ({
      'net::ERR_ABORTED': 'aborted', 'net::ERR_FAILED': 'failed',
      'net::ERR_BLOCKED_BY_CLIENT': 'blocked-by-client', 'net::ERR_BLOCKED_BY_RESPONSE': 'blocked-by-response',
      'net::ERR_INTERNET_DISCONNECTED': 'disconnected', 'net::ERR_TIMED_OUT': 'timed-out',
      // Confirmed by the anonymous production-Next CDP suppression probe.
      // This exact marker is not a generic CSP or blocked-network exemption.
      'csp': 'script-disabled-policy',
    })[reason] ?? 'other';
    // A Chromium enum is safe to retain verbatim. Otherwise retain only fixed
    // vocabulary flags, never the browser's raw reason, request URL or values.
    const exactCode = /^net::[A-Z0-9_]{1,80}$/.test(reason);
    const code = exactCode ? reason : /^\s*(net::[A-Z0-9_]{1,80})(?=$|[^A-Z0-9_])/.exec(reason)?.[1] ?? null;
    const words = new Set(reason.toLowerCase().match(/[a-z]+/g) ?? []);
    const reasonFlags = ['script', 'scripts', 'javascript', 'execution', 'disabled', 'disallowed', 'allowed',
      'request', 'navigation', 'cancelled', 'canceled', 'aborted', 'frame', 'detached', 'target', 'context',
      'closed', 'blocked', 'preload', 'preloads', 'renderer', 'inspector', 'policy', 'csp'].filter(word => words.has(word));
    return { kind, browserCode: code, exactCode, reasonFlags, reasonMissing: reason.length === 0 };
  }
  function recordStaticFailure(request, kind, details = {}) {
    const resource = staticResourceKind(request);
    if (!resource) return;
    const started = staticRequestPhases.get(request) ?? 'normal';
    const record = { started, failed: staticFaultPhase, resource, kind, ...details };
    const key = JSON.stringify(record);
    const previous = staticFailureCounts.get(key);
    staticFailureCounts.set(key, { ...record, count: (previous?.count ?? 0) + 1 });
  }
  function classifiedStaticFailures() {
    return [...staticFailureCounts.values()].map(item => ({ ...item,
      // CDP deliberately suppresses page scripts. During native navigation the
      // browser may cancel those script requests; that is not a transport fault.
      // Chromium also reports the exact literal "csp" for deliberately
      // suppressed Next preload scripts. Only its exact mapped marker is
      // accepted here. No stylesheet, HTTP error, generic CSP/blocked-network
      // error or normal-mode cancellation/policy failure is excused.
      expected: item.resource === 'script' && ['aborted', 'script-disabled-policy'].includes(item.kind) &&
        (item.started === 'page-script-disabled' || item.failed === 'page-script-disabled'),
    }));
  }
  page.on('pageerror', () => { runtimeErrorCount++; });
  page.on('request', request => {
    if (staticResourceKind(request)) staticRequestPhases.set(request, staticFaultPhase);
  });
  page.on('requestfailed', request => {
    if (staticResourceKind(request)) {
      failedStaticRequestCount++;
      const { kind, ...details } = failureDetails(request.failure()?.errorText);
      recordStaticFailure(request, kind, details);
    }
  });
  page.on('response', response => {
    if (staticResourceKind(response.request()) && !response.ok()) recordStaticFailure(response.request(), 'http-error');
  });
  let roleRevoked = false;
  const result = { scope: 'active production service worker; real isolated API/database; synthetic signed OIDC',
    controlledHardReload: false, clientNavigationSettled: false,
    revokedRoleDenied: false, expiredBearerDenied: false, privateCacheEntries: 0,
    approvedStaticCacheEntries: 0, storageFaults: [], revealFrameFault: {
      injected: false, liveCauseEstablished: false, overviewVisible: false, directoryTablesVisible: 0, nestedOrganizationVisible: false,
    }, scriptExecutionFault: {
      injected: false, liveCauseEstablished: false, overviewVisible: false,
      directoryTablesVisible: 0, nestedOrganizationVisible: false, ordinaryDenied: false, revokedDenied: false, expiredDenied: false,
    } };

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
  async function visibleOverview(view = page) {
    await view.getByRole('heading', { name: 'Operator console', exact: true }).waitFor({ state: 'visible' });
    const permissions = view.getByRole('region', { name: 'Operator permissions', exact: true });
    await permissions.waitFor({ state: 'visible' });
    await permissions.getByText(/You can review application requests\./).waitFor({ state: 'visible' });
    await permissions.getByText(/You can manage person status\./).waitFor({ state: 'visible' });
    await permissions.getByText(/You can request and retry reviewed activations\./).waitFor({ state: 'visible' });
    await view.getByText('Checking operator access…', { exact: true }).waitFor({ state: 'hidden' });
    noPrivateValues(await view.content());
  }
  async function settledOverview() {
    await visibleOverview();
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

    // Keep document scripts and the real worker running, but deterministically
    // defer page animation frames. React's streamed Suspense reveal can queue
    // work there. This fault makes no claim about the actual live Edge cause.
    await check('worker-controlled server administration stays visible while page reveal frames are deferred', async () => {
      const framePage = await context.newPage();
      framePage.setDefaultTimeout(5000);
      const resources = []; let failedStatic = 0, runtimeErrors = 0, fromWorker = false;
      framePage.on('pageerror', () => { runtimeErrors++; });
      framePage.on('requestfailed', request => {
        if (new URL(request.url()).pathname.startsWith('/_next/static/')) failedStatic++;
      });
      framePage.on('response', response => {
        const kind = response.request().resourceType();
        if (['script', 'stylesheet'].includes(kind) && new URL(response.url()).pathname.startsWith('/_next/static/')) {
          resources.push({ kind, ok: response.ok(), fromWorker: response.fromServiceWorker() });
        }
      });
      await framePage.addInitScript(() => {
        const nativeRequest = window.requestAnimationFrame.bind(window);
        const nativeCancel = window.cancelAnimationFrame.bind(window);
        const callbacks = new Map(); let nextId = 1000000;
        const state = { held: true, requested: 0, release: () => {
          state.held = false;
          window.requestAnimationFrame = nativeRequest; window.cancelAnimationFrame = nativeCancel;
          const pending = Array.from(callbacks.values()); callbacks.clear();
          nativeRequest(timestamp => { for (const callback of pending) callback(timestamp); });
        } };
        window.__operatorRevealFrameGate = state;
        window.requestAnimationFrame = callback => { const id = ++nextId; state.requested++; callbacks.set(id, callback); return id; };
        window.cancelAnimationFrame = id => { callbacks.delete(id); };
      });
      result.revealFrameFault.injected = true;
      async function frameDiagnostic(phase) {
        const permissions = framePage.getByRole('region', { name: 'Operator permissions', exact: true, includeHidden: true });
        const loading = framePage.getByText('Checking operator access…', { exact: true });
        const permissionBox = await permissions.count() ? await permissions.first().boundingBox({ timeout: 1000 }).catch(() => null) : null;
        const loadingBox = await loading.count() ? await loading.first().boundingBox({ timeout: 1000 }).catch(() => null) : null;
        const frameState = await framePage.evaluate(() => ({
          gateHeld: window.__operatorRevealFrameGate?.held === true,
          frameRequests: window.__operatorRevealFrameGate?.requested ?? 0,
          revealFunctionPresent: typeof window.$RC === 'function',
          queuedRevealPairs: Array.isArray(window.$RB) ? Math.floor(window.$RB.length / 2) : 0,
          shellFrameRecorded: typeof window.$RT === 'number',
        }));
        console.log(`Operator reveal-frame diagnostic ${JSON.stringify({ phase, ...frameState, fromServiceWorker: fromWorker,
          permissionMarkupPresent: await permissions.count() > 0, permissionsVisible: await permissions.isVisible().catch(() => false),
          permissionWidth: permissionBox?.width ?? 0, permissionHeight: permissionBox?.height ?? 0,
          loadingVisible: await loading.isVisible().catch(() => false), loadingWidth: loadingBox?.width ?? 0, loadingHeight: loadingBox?.height ?? 0,
          visibleDirectoryTables: await framePage.locator('table:visible').count(),
          successfulWorkerScripts: resources.filter(resource => resource.kind === 'script' && resource.ok && resource.fromWorker).length,
          successfulWorkerStylesheets: resources.filter(resource => resource.kind === 'stylesheet' && resource.ok && resource.fromWorker).length,
          failedStatic, runtimeErrors })}`);
      }
      try {
        const document = await framePage.goto(`${origin}/admin`, { waitUntil: 'load', timeout: 15000 });
        fromWorker = document?.fromServiceWorker() === true;
        assert(fromWorker, 'Reveal-frame document must pass through the real worker');
        assert.match(document.headers()['cache-control'] ?? '', /no-store/);
        assert(await framePage.evaluate(() => window.__operatorRevealFrameGate?.held === true), 'Owned reveal-frame gate must be installed before page scripts');
        await frameDiagnostic('held');
        await visibleOverview(framePage);
        result.revealFrameFault.overviewVisible = true;
        for (const directory of [
          { path: '/admin/people', heading: 'People', region: 'People results' },
          { path: '/admin/organizations', heading: 'Organizations', region: 'Organization results' },
          { path: '/admin/applications', heading: 'Applications', region: 'Application results' },
          { path: '/admin/audit', heading: 'Operator history', region: 'Operator history results' },
          { path: `/admin/organizations/${organizationId}`, heading: 'Organization record', region: 'Members', nested: true },
        ]) {
          const document = await framePage.goto(origin + directory.path, { waitUntil: 'load', timeout: 15000 });
          fromWorker = document?.fromServiceWorker() === true;
          assert(fromWorker, 'Directory must retain actual worker control while reveal frames are deferred');
          assert.match(document.headers()['cache-control'] ?? '', /no-store/);
          await framePage.getByRole('heading', { name: directory.heading, exact: true }).waitFor({ state: 'visible' });
          const table = framePage.getByRole('region', { name: directory.region, exact: true }).getByRole('table');
          await table.waitFor({ state: 'visible' });
          assert(await table.locator('tbody tr').count() > 0, 'Real directory fixture must be visible while reveal frames are held');
          noPrivateValues(await framePage.content());
          if (directory.nested) result.revealFrameFault.nestedOrganizationVisible = true;
          else result.revealFrameFault.directoryTablesVisible++;
        }
        assert(resources.some(resource => resource.kind === 'script' && resource.ok && resource.fromWorker), 'Expected real JavaScript delivery with page scripting enabled');
        assert(resources.some(resource => resource.kind === 'stylesheet' && resource.ok && resource.fromWorker), 'Expected real stylesheet delivery while reveal frames are held');
        assert.equal(failedStatic, 0); assert.equal(runtimeErrors, 0);
      } catch (error) {
        await frameDiagnostic('failure-held').catch(() => {});
        await framePage.evaluate(() => window.__operatorRevealFrameGate?.release()).catch(() => {});
        await framePage.getByRole('region', { name: 'Operator permissions', exact: true }).waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
        await frameDiagnostic('released').catch(() => {});
        throw error;
      } finally { await framePage.close(); }
    });

    // A completed server response must not hide administration behind an
    // unresolved Suspense fallback when page-runtime execution is unavailable.
    // This deliberately injected fault is a regression boundary, not evidence
    // that disabled JavaScript caused the owner's live browser observation.
    // Install and prove the genuine product worker first; only the owned page
    // target loses script execution. The service-worker target keeps running.
    assert(typeof ordinaryToken === 'string' && ordinaryToken !== reviewerToken,
      'An ordinary signed-in fixture is required for script-fault denial coverage');
    await controlled();
    const scriptProtocol = await context.newCDPSession(page);
    let scriptingDisabled = false, scriptResponseControlled = false;
    const directoryPages = [
      { path: '/admin/people', heading: 'People', region: 'People results' },
      { path: '/admin/organizations', heading: 'Organizations', region: 'Organization results' },
      { path: '/admin/applications', heading: 'Applications', region: 'Application results' },
      { path: '/admin/audit', heading: 'Operator history', region: 'Operator history results' },
    ];
    const nestedOrganizationPath = `/admin/organizations/${organizationId}`;
    const protectedPages = ['/admin', ...directoryPages.map(directory => directory.path), nestedOrganizationPath];
    async function scriptFaultDocument(path) {
      const response = await page.goto(origin + path, { waitUntil: 'load', timeout: 20000 });
      scriptResponseControlled = response?.fromServiceWorker() === true;
      assert(scriptResponseControlled, 'Script-fault document must pass through the already active product worker');
      assert.match(response.headers()['cache-control'] ?? '', /no-store/);
    }
    async function scriptFaultDenied(heading) {
      for (const path of protectedPages) {
        await scriptFaultDocument(path);
        await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' });
        await page.getByText('Checking operator access…', { exact: true }).waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('region', { name: 'Operator permissions', exact: true, includeHidden: true }).count(), 0,
          'A denied server response must contain no permission region, even hidden');
        assert.equal(await page.getByRole('table', { includeHidden: true }).count(), 0,
          'A denied server response must contain no private directory, even hidden');
        noPrivateValues(await page.content());
      }
    }
    try {
      staticFaultPhase = 'page-script-disabled';
      await scriptProtocol.send('Emulation.setScriptExecutionDisabled', { value: true });
      scriptingDisabled = true; result.scriptExecutionFault.injected = true;
      await check('actual worker retains visible server-rendered overview and all four directories without page runtime', async () => {
        await scriptFaultDocument('/admin');
        await visibleOverview();
        const reload = await page.reload({ waitUntil: 'load', timeout: 20000 });
        scriptResponseControlled = reload?.fromServiceWorker() === true;
        assert(scriptResponseControlled, 'Script-fault hard reload must remain controlled by the real product worker');
        assert.match(reload.headers()['cache-control'] ?? '', /no-store/);
        await visibleOverview();
        result.scriptExecutionFault.overviewVisible = true;
        for (const directory of directoryPages) {
          await scriptFaultDocument(directory.path);
          await page.getByRole('heading', { name: directory.heading, exact: true }).waitFor({ state: 'visible' });
          const table = page.getByRole('region', { name: directory.region, exact: true }).getByRole('table');
          await table.waitFor({ state: 'visible' });
          assert(await table.locator('tbody tr').count() > 0, 'Expected the isolated real database fixture to supply directory rows');
          await page.getByText('Checking operator access…', { exact: true }).waitFor({ state: 'hidden' });
          noPrivateValues(await page.content());
          result.scriptExecutionFault.directoryTablesVisible++;
        }
        await scriptFaultDocument(nestedOrganizationPath);
        await page.getByRole('heading', { name: 'Organization record', exact: true }).waitFor({ state: 'visible' });
        const members = page.getByRole('region', { name: 'Members', exact: true }).getByRole('table');
        await members.waitFor({ state: 'visible' });
        assert(await members.locator('tbody tr').count() > 0, 'The isolated organization membership must be visible without page runtime');
        noPrivateValues(await page.content());
        result.scriptExecutionFault.nestedOrganizationVisible = true;
      });
      await check('ordinary signed-in person receives visible denial under the same worker and page-runtime fault', async () => {
        await session(ordinaryToken);
        await scriptFaultDenied('Operator access required');
        result.scriptExecutionFault.ordinaryDenied = true;
        await session(reviewerToken);
      });
      await check('revoked operator receives visible server denial without page-runtime authority', async () => {
        await revokeReviewer(); roleRevoked = true;
        await scriptFaultDenied('Operator access required');
        result.scriptExecutionFault.revokedDenied = true;
        await restoreReviewer(); roleRevoked = false;
      });
      await check('expired bearer receives visible sign-in boundary without page-runtime authority', async () => {
        const expiredToken = await mintExpiredToken();
        await session(expiredToken);
        await scriptFaultDenied('Sign in to continue');
        assert(!(await page.content()).includes(expiredToken), 'Expired bearer reached script-fault document output');
        result.scriptExecutionFault.expiredDenied = true;
      });
    } catch (error) {
      // DOM locator measurements remain available through browser automation.
      // Do not run page.evaluate while page scripts are disabled.
      console.error(`Operator page-runtime diagnostic ${JSON.stringify({
        injectedScriptExecutionFault: scriptingDisabled, documentFromServiceWorker: scriptResponseControlled,
        overviewHeadingVisible: await page.getByRole('heading', { name: 'Operator console', exact: true }).isVisible().catch(() => false),
        permissionsMarkupPresent: await page.getByRole('region', { name: 'Operator permissions', exact: true, includeHidden: true }).count().then(count => count > 0).catch(() => false),
        permissionsVisible: await page.getByRole('region', { name: 'Operator permissions', exact: true }).isVisible().catch(() => false),
        loadingVisible: await page.getByText('Checking operator access…', { exact: true }).isVisible().catch(() => false),
        directoryTablesPresent: await page.getByRole('table', { includeHidden: true }).count().catch(() => 0),
        directoryTablesVisible: await page.locator('table:visible').count().catch(() => 0),
      })}`);
      throw error;
    } finally {
      if (scriptingDisabled) await scriptProtocol.send('Emulation.setScriptExecutionDisabled', { value: false });
      staticFaultPhase = 'normal';
      await scriptProtocol.detach().catch(() => {});
      if (roleRevoked) { await restoreReviewer(); roleRevoked = false; }
      await session(reviewerToken);
    }
    await page.goto(`${origin}/admin`, { waitUntil: 'domcontentloaded' });
    await settledOverview();
    await privateCacheAbsent();

    await check('active worker cannot preserve operator authority after current database revocation', async () => {
      await revokeReviewer(); roleRevoked = true;
      const response = await page.reload({ waitUntil: 'domcontentloaded' });
      assert(response?.fromServiceWorker());
      await page.getByRole('heading', { name: 'Operator access required', exact: true }).waitFor({ state: 'visible' });
      await page.getByText('Checking operator access…', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('region', { name: 'Operator permissions', exact: true, includeHidden: true }).count(), 0);
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
      assert.equal(await page.getByRole('region', { name: 'Operator permissions', exact: true, includeHidden: true }).count(), 0);
      const html = await page.content(); noPrivateValues(html);
      assert(!html.includes(expiredToken), 'Expired bearer reached document output');
      await controlled();
      await privateCacheAbsent();
      result.expiredBearerDenied = true;
    });
    assert.equal(runtimeErrorCount, 0, 'Worker-controlled console emitted a browser runtime error');
    result.staticFailureClassification = classifiedStaticFailures();
    console.log(`Operator static failure classification ${JSON.stringify(result.staticFailureClassification)}`);
    assert.equal(result.staticFailureClassification.filter(item => !item.expected).reduce((sum, item) => sum + item.count, 0), 0,
      'Worker-controlled console had unexpected static transport, stylesheet or HTTP failures');
    return result;
  } catch (error) {
    // Preserve the useful distinction from the reported failure: completed SSR
    // may exist in the DOM while the loading boundary remains visibly stuck.
    // Only booleans/counts and fixed route/state labels enter diagnostic output.
    const visible = await page.evaluate(() => {
      const shown = element => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const headings = Array.from(document.querySelectorAll('h1'));
      const paragraphs = Array.from(document.querySelectorAll('p'));
      const permissions = document.querySelector('section[aria-label="Operator permissions"]');
      return {
        route: location.pathname === '/admin' ? 'overview' : location.pathname === '/admin/people' ? 'people' : 'other',
        workerControlled: navigator.serviceWorker.controller?.scriptURL === new URL('/sw.js', location.origin).href,
        overviewMarkupPresent: headings.some(element => element.textContent === 'Operator console'),
        overviewHeadingVisible: headings.some(element => element.textContent === 'Operator console' && shown(element)),
        loadingVisible: paragraphs.some(element => element.textContent === 'Checking operator access…' && shown(element)),
        capabilitiesMarkupPresent: Boolean(permissions),
        capabilitiesVisible: shown(permissions),
      };
    }).catch(() => ({ pageStateAvailable: false }));
    console.error(`Operator worker diagnostic ${JSON.stringify({ ...visible, runtimeErrorCount, failedStaticRequestCount,
      staticFailureClassification: classifiedStaticFailures() })}`);
    throw error;
  } finally {
    try { if (roleRevoked) await restoreReviewer(); }
    finally { await context.close(); }
  }
}
