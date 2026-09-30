#!/usr/bin/env node
/** Production-build, same-origin installed-worker/offline/update smoke. No IAM credentials required. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { cpSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const web = resolve(root, 'apps/web');
const output = resolve(web, '.next/standalone/apps/web');
const bin = resolve(output, 'server.js');
const port = 4177;
const origin = `http://127.0.0.1:${port}`;
let server;
let browser;

// Match the Dockerfile's runtime filesystem when running the standalone build locally.
mkdirSync(resolve(output, '.next'), { recursive: true });
cpSync(resolve(web, 'public'), resolve(output, 'public'), { recursive: true });
cpSync(resolve(web, '.next/static'), resolve(output, '.next/static'), { recursive: true });

async function start(sha) {
  const child = spawn(process.execPath, [bin], {
    cwd: root,
    env: { ...process.env, GIT_SHA: sha, WEB_BASE_URL: origin,
      OIDC_ISSUER: 'http://127.0.0.1:8080/realms/accesslobby-first-party',
      OIDC_CLIENT_ID: 'accesslobby-web', SESSION_SECRET: Buffer.alloc(32, 4).toString('base64url'),
      API_INTERNAL_URL: 'http://127.0.0.1:3001', NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next exited: ${output.slice(-1200)}`);
    try { if ((await fetch(`${origin}/manifest.webmanifest`)).ok) return child; } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  child.kill('SIGTERM');
  throw new Error(`Next did not start: ${output.slice(-1200)}`);
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = once(child, 'exit');
  child.kill('SIGTERM');
  await done;
}

try {
  server = await start('a'.repeat(40));
  browser = await chromium.launch();
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  const manifest = await (await fetch(`${origin}/manifest.webmanifest`)).json();
  assert.equal(manifest.name, 'AccessLobby');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.equal((await fetch(`${origin}${icon.src}`)).status, 200);
  const workerResponse = await fetch(`${origin}/sw.js`);
  assert.match(workerResponse.headers.get('cache-control') ?? '', /no-store/);
  assert.match(workerResponse.headers.get('content-type') ?? '', /javascript/);
  assert.match(await workerResponse.text(), /const BUILD_ID = "a{40}"/);
  await page.goto(origin);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });

  await page.goto(`${origin}/account`);
  assert.match((await page.request.get(`${origin}/account`)).headers()['cache-control'] ?? '', /no-store/);
  const keys = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(item => new URL(item.url).pathname)))).flat();
  });
  assert(keys.includes('/offline.html'));
  assert(keys.every(path => path === '/offline.html' || path.startsWith('/icons/') || path.startsWith('/_next/static/')));

  await context.setOffline(true);
  await page.goto(`${origin}/account`);
  await page.getByRole('heading', { name: 'Connection required' }).waitFor();
  assert.equal(await page.getByText('Sign in to continue').count(), 0);
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Connection required' }).waitFor();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Retry connection' }).click();
  await page.getByRole('heading', { name: 'One AccessLobby identity', exact: true }).waitFor();

  await stop(server);
  server = await start('b'.repeat(40));
  await page.goto(`${origin}/account`);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.getByText('Update ready').waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole('button', { name: 'Update now' }).count(), 0);
  await page.goto(origin);

  const peer = await context.newPage();
  await peer.goto(`${origin}/account`);
  await peer.getByText('Update ready', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Update now', exact: true }).click();
  await page.getByText('Finish or close other AccessLobby windows, then try Update now again.', { exact: true }).waitFor();
  assert(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)));
  await peer.getByRole('heading', { name: 'Sign in to continue', exact: true }).waitFor();

  async function editFixtureForm(target) {
    // A temporary browser-only fixture exercises the app's real global dirty-form guard.
    await target.evaluate(() => {
      const form = document.createElement('form');
      const input = document.createElement('input');
      input.setAttribute('aria-label', 'Update guard fixture');
      form.append(input); document.body.append(form);
    });
    await target.getByRole('textbox', { name: 'Update guard fixture' }).fill('unfinished');
  }
  await peer.goto(origin);
  await peer.getByRole('button', { name: 'Update now', exact: true }).waitFor();
  await editFixtureForm(peer);
  await peer.getByText('Finish this account step, then return home to update.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Update now', exact: true }).click();
  await page.getByText('Finish or close other AccessLobby windows, then try Update now again.', { exact: true }).waitFor();
  assert.equal(await peer.getByRole('textbox', { name: 'Update guard fixture' }).inputValue(), 'unfinished');

  await editFixtureForm(page);
  await page.getByText('Finish this account step, then return home to update.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Update now', exact: true }).count(), 0);
  // Explicit user reload ends the fixture edits; an update must never do this on their behalf.
  await page.reload(); await peer.reload();
  await page.getByRole('button', { name: 'Update now', exact: true }).waitFor();
  await peer.getByRole('button', { name: 'Update now', exact: true }).waitFor();

  const inert = await context.newPage();
  await inert.addInitScript(() => {
    // Simulate a stalled window without changing service-worker network/caching behavior.
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'ACCESSLOBBY_CHECK_UPDATE_SAFETY') event.stopImmediatePropagation();
    }, true);
  });
  await inert.goto(origin);
  await inert.getByRole('button', { name: 'Update now', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Update now', exact: true }).click();
  await page.getByText('Finish or close other AccessLobby windows, then try Update now again.', { exact: true }).waitFor();
  assert(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting)));
  await inert.close();

  await context.addCookies([{ name: 'pwa-smoke-state', value: 'preserved', url: origin, httpOnly: true }]);
  await page.evaluate(() => localStorage.setItem('accesslobby-theme', 'dark'));
  await peer.evaluate(() => { window.pwaSmokeDocument = 'unchanged'; });
  const priorPeerController = await peer.evaluateHandle(() => navigator.serviceWorker.controller);
  await page.getByRole('button', { name: 'Update now' }).click();
  await peer.waitForFunction(previous => navigator.serviceWorker.controller !== previous, priorPeerController, { timeout: 15000 });
  await page.getByRole('heading', { name: 'One AccessLobby identity', exact: true }).waitFor();
  await page.waitForFunction(async () => !(await navigator.serviceWorker.getRegistration()).waiting, null, { timeout: 15000 });
  assert.equal(await peer.evaluate(() => window.pwaSmokeDocument), 'unchanged', 'other window must not reload');
  await peer.getByText('Update ready', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => localStorage.getItem('accesslobby-theme')), 'dark');
  assert((await context.cookies()).some(cookie => cookie.name === 'pwa-smoke-state' && cookie.value === 'preserved' && cookie.httpOnly));
  await priorPeerController.dispose();
  console.log('PWA_BROWSER_SMOKE_PASS manifest worker offline protected-route update-A-to-B critical-peer dirty-forms unresponsive-peer retry peer-no-reload state-preserved');
} finally {
  await browser?.close();
  await stop(server);
}
