import { PWA_UPDATE_SAFE_PATH } from './pwa-update-policy';

/** A deliberately small worker: no identity document or API response enters Cache Storage. */
export function serviceWorkerSource(buildId: string) {
  return `const BUILD_ID = ${JSON.stringify(buildId)};
const CACHE_PREFIX = 'accesslobby-static-';
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const OFFLINE_URL = '/offline.html';
const STATIC_SHELL = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];
const SAFE_UPDATE_PATH = ${JSON.stringify(PWA_UPDATE_SAFE_PATH)};
let activationInProgress = false;

function neutralWindow(client) {
  const url = new URL(client.url);
  return url.origin === self.location.origin && url.pathname === SAFE_UPDATE_PATH;
}

function checkWindow(client) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (safe) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(safe);
    };
    const timer = setTimeout(() => finish(false), 1500);
    channel.port1.onmessage = (event) => finish(event.data?.safe === true);
    try {
      client.postMessage({ type: 'ACCESSLOBBY_CHECK_UPDATE_SAFETY' }, [channel.port2]);
    } catch { finish(false); }
  });
}

self.addEventListener('install', (event) => {
  // Cache Storage is optional. A storage failure must not prevent a worker
  // that can still deliver network responses and the neutral offline fallback.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)).catch(() => {}));
  // A new worker waits until the application explicitly reaches a safe update boundary.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
      const previous = names.filter((name) => name !== CACHE_NAME).at(-1);
      await Promise.all(names.filter((name) => name !== CACHE_NAME && name !== previous)
        .map((name) => caches.delete(name)));
    } catch { /* Optional old-cache cleanup cannot prevent taking control. */ }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'ACCESSLOBBY_ACTIVATE' || !event.source?.url ||
      new URL(event.source.url).origin !== self.location.origin) return;
  const reply = (status) => {
    event.ports?.[0]?.postMessage({ type: 'ACCESSLOBBY_ACTIVATION_RESULT', status });
    event.ports?.[0]?.close();
  };
  if (activationInProgress) { reply('blocked'); return; }
  activationInProgress = true;
  event.waitUntil((async () => {
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (!clients.some((client) => client.id === event.source.id) ||
          !neutralWindow(event.source) || !clients.every(neutralWindow)) {
        reply('blocked'); return;
      }
      // Build B's caller has no safety-reply protocol. Its home has no forms;
      // the URL gate above keeps that first upgrade compatible and bounded.
      if (event.data.protocol === 2 && !(await Promise.all(clients.map(checkWindow))).every(Boolean)) {
        reply('blocked'); return;
      }
      const checkedIds = new Set(clients.map((client) => client.id));
      const current = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (!current.some((client) => client.id === event.source.id) ||
          !current.every((client) => checkedIds.has(client.id) && neutralWindow(client))) {
        reply('blocked'); return;
      }
      await self.skipWaiting();
      reply('accepted');
    } catch { reply('failed'); }
    finally { activationInProgress = false; }
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => {
      try {
        const cached = await caches.match(OFFLINE_URL);
        if (cached) return cached;
      } catch { /* The same neutral fallback works without browser storage. */ }
      return new Response('<h1>Connection required</h1><p>Reconnect before using AccessLobby.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }));
    return;
  }

  // Only Next.js content-hashed build assets are eligible. All other requests use the network.
  if (!url.pathname.startsWith('/_next/static/')) return;
  let cacheWrite = Promise.resolve();
  const response = (async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch { cache = undefined; }
    const network = await fetch(request);
    if (cache && network.ok && network.type === 'basic' && !network.headers.has('set-cookie')) {
      try {
        // Clone before handing the response to the browser. Storage rejection
        // or a stalled write must not discard or delay a ready JS/CSS response.
        cacheWrite = Promise.resolve(cache.put(request, network.clone())).catch(() => {});
      } catch { /* A synchronous clone/storage failure is optional too. */ }
    }
    return network;
  })();
  event.respondWith(response);
  // Register the lifetime during dispatch, independently of response delivery.
  // A genuine network failure still rejects respondWith, not this cleanup task.
  event.waitUntil(response.then(() => cacheWrite).catch(() => {}));
});
`;
}
