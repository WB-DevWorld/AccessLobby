import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import manifest from '../app/manifest';
import { GET as workerRoute } from '../app/sw.js/route';
import { serviceWorkerSource } from '../lib/pwa-worker';
import { safeUpdateBoundary } from '../lib/pwa-update-policy';

test('manifest has a stable installed identity and usable approved-mark PNGs', () => {
  const data = manifest();
  assert.equal(data.name, 'AccessLobby');
  assert.equal(data.id, '/');
  assert.equal(data.start_url, '/');
  assert.equal(data.scope, '/');
  assert.equal(data.display, 'standalone');
  assert.deepEqual(data.icons?.map(icon => icon.sizes), ['192x192', '512x512', '512x512']);
});

test('worker response has a web-root scope, JavaScript type, no-store and exact build identity', async () => {
  const previous = process.env.GIT_SHA;
  process.env.GIT_SHA = 'a'.repeat(40);
  try {
    const response = workerRoute();
    assert.match(response.headers.get('content-type') ?? '', /javascript/);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(response.headers.get('service-worker-allowed'), '/');
    assert.match(await response.text(), /const CACHE_NAME = CACHE_PREFIX \+ BUILD_ID/);
    assert.match(serviceWorkerSource('a'.repeat(40)), /const BUILD_ID = "a{40}"/);
  } finally {
    if (previous === undefined) delete process.env.GIT_SHA;
    else process.env.GIT_SHA = previous;
  }
});

test('updates wait for an explicit message and critical account flows cannot request activation', () => {
  const source = serviceWorkerSource('a'.repeat(40));
  assert.doesNotMatch(source.slice(source.indexOf("self.addEventListener('install'"),
    source.indexOf("self.addEventListener('activate'")), /self\.skipWaiting\(\)/);
  for (const route of ['/auth/callback', '/recovery', '/account', '/identity', '/contexts',
    '/organizations/id', '/apps']) assert.equal(safeUpdateBoundary(route, false), false);
  assert.equal(safeUpdateBoundary('/', true), false);
  assert.equal(safeUpdateBoundary('/', false), true);
});

test('worker precaches only a neutral shell, never stores private routes or API responses', async () => {
  const handlers = new Map<string, (event: any) => void>();
  const entries = new Map<string, unknown>();
  let fetches = 0;
  const cache = {
    addAll: async (urls: string[]) => { urls.forEach(url => entries.set(url, { offline: url })); },
    match: async (request: { url: string } | string) => entries.get(typeof request === 'string' ? request : request.url),
    put: async (request: { url: string }, response: unknown) => { entries.set(request.url, response); },
  };
  const fakeCaches = {
    open: async () => cache,
    keys: async () => ['accesslobby-static-old', 'accesslobby-static-' + 'a'.repeat(40)],
    delete: async () => true,
    match: cache.match,
  };
  vm.runInNewContext(serviceWorkerSource('a'.repeat(40)), {
    self: { addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
      clients: { claim: async () => {} }, location: new URL('https://accesslobby.example.test/') },
    caches: fakeCaches, URL, Response,
    fetch: async (request: { url: string }) => {
      fetches++;
      if (request.url.includes('/account') || request.url.includes('/auth/callback')) throw new Error('offline');
      return { ok: true, type: 'basic', headers: new Headers(), clone() { return this; } };
    },
  });
  let installed: Promise<unknown> | undefined;
  handlers.get('install')!({ waitUntil: (promise: Promise<unknown>) => { installed = promise; } });
  await installed;
  assert.deepEqual([...entries.keys()], ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png']);

  async function request(url: string, mode: string, method = 'GET') {
    let response: Promise<unknown> | undefined;
    handlers.get('fetch')!({ request: { url, mode, method },
      respondWith: (promise: Promise<unknown>) => { response = promise; } });
    return response && await response;
  }
  assert.equal(await request('https://api.accesslobby.example.test/v1/me', 'cors'), undefined);
  assert.equal(await request('https://accesslobby.example.test/apps/action', 'cors', 'POST'), undefined);
  assert.equal(await request('https://accesslobby.example.test/account', 'navigate'), entries.get('/offline.html'));
  assert.equal(await request('https://accesslobby.example.test/auth/callback?code=secret', 'navigate'), entries.get('/offline.html'));
  assert.equal(await request('https://accesslobby.example.test/apps', 'cors'), undefined);
  assert.equal(fetches, 2);
  assert.deepEqual([...entries.keys()], ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png']);
});
