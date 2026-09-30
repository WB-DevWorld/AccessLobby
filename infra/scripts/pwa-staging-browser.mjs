#!/usr/bin/env node
/** Public, credential-free qualification of the exact staging PWA. Run in a disposable profile. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const origin = 'https://accesslobby.realjanelove.com';
const sha = process.env.EXPECTED_WEB_SHA;
assert.match(sha ?? '', /^[a-f0-9]{40}$/, 'EXPECTED_WEB_SHA must be the deployed source revision');
const artifactDir = resolve(process.env.PWA_REPORT_DIR ?? 'pwa-staging-report');
await mkdir(artifactDir, { recursive: true });
const profile = await mkdtemp(resolve(tmpdir(), 'accesslobby-pwa-'));
const report = {
  checkedAt: new Date().toISOString(), origin, expectedWebSha: sha,
  runner: process.platform, checks: [], metrics: [], viewports: [],
  notProven: ['running-image-digest', 'installed-authenticated-login', 'installed-logout',
    'real-release-update-A-to-B', 'physical-desktop', 'android', 'ios'],
};
let context;
let browserCdp;
let installed = false;
let diagnosticPage;
const phase = name => { report.phase = name; console.log(`PHASE ${name}`); };
const launch = async () => {
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: false, serviceWorkers: 'allow',
    viewport: { width: 1366, height: 900 },
  });
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(90000);
  report.browser = context.browser().version();
  browserCdp = await context.browser().newBrowserCDPSession();
};

async function check(name, action) {
  const started = Date.now();
  try {
    const detail = await action();
    report.checks.push({ name, status: 'PASS', durationMs: Date.now() - started, ...detail });
    console.log(`${name}: PASS`);
    return detail;
  } catch (error) {
    // Do not emit exception text, HTTP bodies, URLs with OIDC parameters or browser storage values.
    report.checks.push({ name, status: 'FAIL', durationMs: Date.now() - started,
      errorType: error.constructor.name, phase: report.phase,
      sourceLine: error.stack?.match(/pwa-staging-browser\.mjs:(\d+):\d+/)?.[1] });
    if (diagnosticPage && !diagnosticPage.isClosed()) {
      await diagnosticPage.screenshot({ path: resolve(artifactDir, 'failure.png') }).catch(() => {});
      report.failurePage = await diagnosticPage.evaluate(() => ({
        origin: location.origin, path: location.pathname, onlineHint: navigator.onLine,
        controlled: Boolean(navigator.serviceWorker?.controller),
      })).catch(() => ({ observation: 'unavailable' }));
    }
    console.log(`${name}: FAIL (${error.constructor.name})`);
    throw error;
  }
}

async function cacheBoundary(page) {
  const inventory = await page.evaluate(async () => Promise.all((await caches.keys()).map(async name => ({
    name, entries: (await (await caches.open(name)).keys()).map(request => {
      const url = new URL(request.url);
      return { origin: url.origin, path: url.pathname, method: request.method };
    }),
  }))));
  assert(inventory.some(cache => cache.name === `accesslobby-static-${sha}`));
  const entries = inventory.flatMap(cache => cache.entries);
  assert(entries.some(entry => entry.path === '/offline.html'));
  assert(entries.every(entry => entry.origin === origin && entry.method === 'GET' &&
    (['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png'].includes(entry.path) ||
      entry.path.startsWith('/_next/static/'))));
  return { cacheNames: inventory.map(cache => cache.name), paths: [...new Set(entries.map(entry => entry.path))] };
}

async function metrics(page, name) {
  const timing = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    return {
      responseEndMs: Math.round(navigation?.responseEnd ?? 0),
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      transferBytes: (navigation?.transferSize ?? 0) + resources.reduce((sum, item) => sum + item.transferSize, 0),
      resourceCount: resources.length,
    };
  });
  report.metrics.push({ name, ...timing });
}

async function viewports(page, surface, heading) {
  for (const width of [360, 390, 412, 768, 1366, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('heading', { name: heading, exact: true }).waitFor();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    assert(dimensions.content <= dimensions.viewport + 1, `${surface} overflows at ${width}`);
    report.viewports.push({ surface, width, status: 'PASS' });
    await page.screenshot({ path: resolve(artifactDir, `${surface}-${width}.png`), fullPage: true });
  }
}

async function appPage() {
  phase('app.request_launch');
  const newPage = context.waitForEvent('page', { timeout: 30000 }).catch(() => null);
  const target = await browserCdp.send('PWA.launch', { manifestId: `${origin}/` });
  phase('app.launch_returned');
  const launchedWindow = await browserCdp.send('Browser.getWindowForTarget', { targetId: target.targetId });
  // Chrome can expose distinct tab and page targets for the same app window.
  // Match the real window, rather than assuming the two opaque target IDs are equal.
  const findPage = async candidates => {
    for (const candidate of candidates) {
      if (!candidate || candidate.isClosed()) continue;
      const cdp = await context.newCDPSession(candidate);
      const { targetInfo } = await cdp.send('Target.getTargetInfo');
      const candidateWindow = await browserCdp.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
      await cdp.detach();
      if (candidateWindow.windowId === launchedWindow.windowId) return candidate;
    }
  };
  const page = await findPage(context.pages()) ?? await findPage([await newPage]);
  assert(page, 'Launched PWA window must have an attached page');
  diagnosticPage = page;
  phase('app.page_attached');
  await page.waitForURL(`${origin}/`, { waitUntil: 'domcontentloaded' });
  report.appLaunch = { windowMatches: true,
    standalone: await page.evaluate(() => matchMedia('(display-mode: standalone)').matches) };
  await page.waitForFunction(() => matchMedia('(display-mode: standalone)').matches, null, { timeout: 15000 });
  phase('app.standalone_ready');
  return page;
}

try {
  await launch();
  let page = context.pages()[0] ?? await context.newPage();
  diagnosticPage = page;
  const network = await context.newCDPSession(page);
  await network.send('Network.enable');
  // One measured constrained-network first load, followed by a repeat using the warmed worker.
  await network.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 64 * 1024, uploadThroughput: 32 * 1024,
  });
  await check('public.first_load', async () => {
    await page.goto(origin);
    await page.getByRole('heading', { name: 'One AccessLobby identity', exact: true }).waitFor();
    await page.waitForLoadState('load');
    await metrics(page, 'first-load-150ms-64KiBps');
  });
  await check('worker.control_and_release', async () => {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 60000 });
    const registration = await page.evaluate(async () => {
      const current = await navigator.serviceWorker.getRegistration();
      return { scope: current.scope, controller: navigator.serviceWorker.controller.scriptURL,
        updateViaCache: current.updateViaCache };
    });
    assert.equal(registration.scope, `${origin}/`);
    assert.equal(registration.controller, `${origin}/sw.js`);
    assert.equal(registration.updateViaCache, 'none');
    const response = await page.request.get(`${origin}/sw.js`);
    assert.equal(response.status(), 200);
    assert.match(response.headers()['cache-control'], /no-store/);
    assert.match(await response.text(), new RegExp(`^const BUILD_ID = "${sha}";`));
    return registration;
  });
  await check('public.repeat_load', async () => {
    await page.reload();
    await page.waitForLoadState('load');
    await metrics(page, 'repeat-load-150ms-64KiBps');
    return cacheBoundary(page);
  });
  await network.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
  });
  await check('chromium.manifest_and_installability', async () => {
    const manifest = await network.send('Page.getAppManifest');
    assert.equal(manifest.url, `${origin}/manifest.webmanifest`);
    assert.deepEqual(manifest.errors, []);
    const data = JSON.parse(manifest.data);
    assert.equal(data.name, 'AccessLobby');
    assert.equal(data.display, 'standalone');
    const errors = await network.send('Page.getInstallabilityErrors');
    assert.deepEqual(errors.installabilityErrors, []);
    return { manifestUrl: manifest.url, installabilityErrors: errors.installabilityErrors };
  });
  await check('tab.responsive_public_shell', async () => {
    await viewports(page, 'tab-home', 'One AccessLobby identity');
  });
  await check('tab.protected_pages_network_only', async () => {
    for (const path of ['/account', '/identity', '/contexts', '/apps', '/recovery']) {
      const response = await page.goto(`${origin}${path}`);
      assert.match(response.headers()['cache-control'], /private/);
      assert.match(response.headers()['cache-control'], /no-store/);
      await page.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: "You're signed in", exact: true }).count(), 0);
    }
    return cacheBoundary(page);
  });
  await check('tab.offline_protected_and_auth_shell', async () => {
    await context.setOffline(true);
    for (const path of ['/', '/account', '/identity', '/contexts', '/apps', '/recovery', '/auth/login', '/auth/callback']) {
      await page.goto(`${origin}${path}`);
      await page.getByRole('heading', { name: 'Connection required', exact: true }).waitFor();
      assert.equal(await page.getByRole('heading', { name: "You're signed in", exact: true }).count(), 0);
    }
    const rejected = await page.evaluate(async () => {
      try { await fetch('/auth/logout', { method: 'POST', body: new URLSearchParams({ scope: 'all' }) }); return false; }
      catch { return true; }
    });
    assert.equal(rejected, true, 'Offline identity mutation must not be accepted or replayed');
    await viewports(page, 'tab-offline', 'Connection required');
    const retry = page.getByRole('link', { name: 'Retry connection', exact: true });
    const target = await retry.boundingBox();
    assert(target.height >= 44);
    await page.keyboard.press('Tab');
    assert.equal(await retry.evaluate(el => el === document.activeElement), true);
    return cacheBoundary(page);
  });
  await check('tab.reconnect', async () => {
    await context.setOffline(false);
    await page.getByRole('link', { name: 'Retry connection', exact: true }).click();
    await page.getByRole('heading', { name: 'One AccessLobby identity', exact: true }).waitFor();
  });
  await check('chromium.install_and_standalone_launch', async () => {
    await browserCdp.send('PWA.install', { manifestId: `${origin}/`, installUrlOrBundleUrl: `${origin}/` });
    installed = true;
    await browserCdp.send('PWA.changeAppUserSettings', { manifestId: `${origin}/`, displayMode: 'standalone' });
    page = await appPage();
    await page.getByRole('heading', { name: 'One AccessLobby identity', exact: true }).waitFor();
    await viewports(page, 'installed-home', 'One AccessLobby identity');
    await page.getByRole('button', { name: 'Color theme: system. Activate to switch theme.', exact: true }).click();
    await page.getByRole('button', { name: 'Color theme: light. Activate to switch theme.', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('accesslobby-theme')), 'light');
    return { mode: 'standalone', installMethod: 'Chrome DevTools Protocol PWA domain' };
  });
  await check('installed.offline_profile_cold_launch', async () => {
    phase('cold.close_app');
    await page.close();
    // Prevent Chrome's session restoration from visiting the origin online before this test.
    for (const remaining of context.pages()) await remaining.goto('about:blank');
    await context.close();
    phase('cold.start_browser');
    await launch();
    assert.equal(context.pages().some(page => page.url().startsWith(origin)), false,
      'Cold launch must not warm AccessLobby online before going offline');
    await context.setOffline(true);
    phase('cold.offline_enabled');
    page = await appPage();
    phase('cold.wait_offline_shell');
    await page.getByRole('heading', { name: 'Connection required', exact: true }).waitFor();
    await metrics(page, 'installed-profile-offline-cold-launch');
    await viewports(page, 'installed-offline', 'Connection required');
    assert.equal(await page.evaluate(() => localStorage.getItem('accesslobby-theme')), 'light');
    return cacheBoundary(page);
  });
  await check('installed.reconnect_and_preference', async () => {
    await context.setOffline(false);
    await page.getByRole('link', { name: 'Retry connection', exact: true }).click();
    await page.getByRole('heading', { name: 'One AccessLobby identity', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('accesslobby-theme')), 'light');
  });
} catch (error) {
  if (!report.checks.some(check => check.status === 'FAIL')) {
    report.checks.push({ name: 'browser.harness', status: 'FAIL', errorType: error.constructor.name });
  }
  process.exitCode = 1;
} finally {
  report.status = report.checks.some(check => check.status === 'FAIL') ? 'FAIL' : 'PASS';
  // This profile is test-owned and contains no credentials. Never repair or reset a user's storage.
  if (installed && browserCdp) {
    try { await browserCdp.send('PWA.uninstall', { manifestId: `${origin}/` }); } catch {}
  }
  await context?.close();
  await rm(profile, { recursive: true, force: true });
  await writeFile(resolve(artifactDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ metrics: report.metrics, viewports: report.viewports.length,
    appLaunch: report.appLaunch, phase: report.phase, failurePage: report.failurePage }));
  console.log(`PWA_STAGING_BROWSER_${report.status} deployed=${sha} browser=${report.browser ?? 'unavailable'}`);
}
