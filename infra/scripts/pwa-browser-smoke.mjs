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
  await page.getByText('One AccessLobby identity').waitFor();

  await stop(server);
  server = await start('b'.repeat(40));
  await page.goto(`${origin}/account`);
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
  await page.getByText('Update ready').waitFor({ timeout: 15000 });
  assert.equal(await page.getByRole('button', { name: 'Update now' }).count(), 0);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Update now' }).click();
  await page.waitForFunction(async () => (await caches.keys()).some(name => name.endsWith('b'.repeat(40))), null, { timeout: 15000 });
  await page.getByText('One AccessLobby identity').waitFor();
  console.log('PWA_BROWSER_SMOKE_PASS manifest worker offline protected-route update-A-to-B');
} finally {
  await browser?.close();
  await stop(server);
}
