/** A deliberately small worker: no identity document or API response enters Cache Storage. */
export function serviceWorkerSource(buildId: string) {
  return `const BUILD_ID = ${JSON.stringify(buildId)};
const CACHE_PREFIX = 'accesslobby-static-';
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const OFFLINE_URL = '/offline.html';
const STATIC_SHELL = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_SHELL)));
  // A new worker waits until the application explicitly reaches a safe update boundary.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
    const previous = names.filter((name) => name !== CACHE_NAME).at(-1);
    await Promise.all(names.filter((name) => name !== CACHE_NAME && name !== previous)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACCESSLOBBY_ACTIVATE' &&
      event.source?.url && new URL(event.source.url).origin === self.location.origin) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached || new Response('<h1>Connection required</h1><p>Reconnect before using AccessLobby.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }));
    return;
  }

  // Only Next.js content-hashed build assets are eligible. All other requests use the network.
  if (!url.pathname.startsWith('/_next/static/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic' && !response.headers.has('set-cookie')) {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
`;
}
