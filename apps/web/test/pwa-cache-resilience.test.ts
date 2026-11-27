import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { serviceWorkerSource } from '../lib/pwa-worker';

const origin = 'https://accesslobby.example.test';
const staticAssets = [
  { kind: 'JavaScript', path: '/_next/static/chunks/app-bootstrap-a1b2c3.js', destination: 'script' },
  { kind: 'stylesheet', path: '/_next/static/css/app-a1b2c3.css', destination: 'style' },
] as const;
type CacheFault = 'open' | 'match' | 'put';
type RequestFixture = { url: string; method: string; mode: string; destination: string; headers: Headers };

function assetResponse(body = 'synthetic static asset', init?: ResponseInit, type = 'basic') {
  const response = new Response(body, init);
  // Node's synthetic Response has type=default; a same-origin browser fetch
  // returns basic. Retain real Response cloning and body-stream semantics.
  Object.defineProperty(response, 'type', { value: type });
  return response;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(options: { fault?: CacheFault; pendingPut?: Promise<void>; networkError?: Error;
  response?: Response; cached?: Response } = {}) {
  const handlers = new Map<string, (event: any) => void>();
  const fetched: Array<{ request: RequestFixture; init?: RequestInit }> = [];
  const lookups: string[] = [], opened: string[] = [];
  const stored: Array<{ url: string; body: string }> = [];
  const network = options.response ?? assetResponse();
  const storageError = new Error('synthetic browser storage unavailable');
  storageError.name = 'QuotaExceededError';
  let putCalls = 0;
  const cache = {
    async match(request: RequestFixture | string) {
      lookups.push(typeof request === 'string' ? request : request.url);
      if (options.fault === 'match') throw storageError;
      return options.cached;
    },
    async put(request: RequestFixture, response: Response) {
      putCalls++;
      if (options.fault === 'put') throw storageError;
      await options.pendingPut;
      stored.push({ url: request.url, body: await response.text() });
    },
  };
  vm.runInNewContext(serviceWorkerSource('d'.repeat(40)), {
    URL, Response, Headers, setTimeout, clearTimeout,
    self: { location: new URL(origin),
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler) },
    caches: {
      async open(name: string) {
        opened.push(name);
        if (options.fault === 'open') throw storageError;
        return cache;
      },
      match: cache.match,
    },
    fetch: async (request: RequestFixture, init?: RequestInit) => {
      fetched.push({ request, init });
      if (options.networkError) throw options.networkError;
      return network;
    },
  });

  function dispatch(path: string, requestOptions: Partial<RequestFixture> = {}) {
    const request: RequestFixture = { url: new URL(path, origin).href, method: 'GET', mode: 'cors',
      destination: '', headers: new Headers(), ...requestOptions };
    let response: Promise<Response> | undefined;
    let dispatching = true;
    const background: Array<Promise<PromiseSettledResult<unknown>>> = [];
    handlers.get('fetch')!({ request,
      respondWith(value: Promise<Response> | Response) {
        assert.equal(dispatching, true, 'The fetch response must be registered during dispatch');
        assert.equal(response, undefined, 'A fetch has only one response');
        response = Promise.resolve(value);
      },
      waitUntil(value: Promise<unknown>) {
        assert.equal(dispatching, true, 'Background lifetime must be registered synchronously');
        // Attach rejection handling immediately, matching the browser's event
        // lifetime observation without allowing an unhandled fixture promise.
        background.push(Promise.resolve(value).then(
          result => ({ status: 'fulfilled' as const, value: result }),
          reason => ({ status: 'rejected' as const, reason })));
      },
    });
    dispatching = false;
    return { response, backgroundCount: background.length,
      async completeBackground() {
        const results = await Promise.all(background);
        assert.ok(results.every(result => result.status === 'fulfilled'), 'Optional storage may not reject the fetch lifetime');
      } };
  }
  return { dispatch, network, fetched, opened, lookups, stored, putCalls: () => putCalls };
}

async function promptResponse(response: Promise<Response> | undefined) {
  assert.ok(response, 'Static fetch must have an intercepted response');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([response, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('A ready network response was held by optional cache storage')), 300);
    })]);
  } finally { clearTimeout(timer); }
}

for (const asset of staticAssets) {
  for (const fault of ['open', 'match', 'put'] as const) {
    test(`${asset.kind} remains deliverable when cache ${fault} rejects`, async () => {
      const h = harness({ fault });
      const event = h.dispatch(asset.path, { destination: asset.destination });
      assert.equal(await promptResponse(event.response), h.network);
      assert.equal(h.fetched.length, 1, 'Storage failure must fall back to the actual network');
      assert.equal(await h.network.text(), 'synthetic static asset');
      await event.completeBackground();
    });
  }

  test(`${asset.kind} network response does not wait for a pending cache write`, async () => {
    const pending = deferred();
    const h = harness({ pendingPut: pending.promise });
    const event = h.dispatch(asset.path, { destination: asset.destination });
    try {
      assert.equal(await promptResponse(event.response), h.network);
      assert.equal(h.fetched.length, 1);
      assert.ok(event.backgroundCount > 0, 'Detached cache work must retain a synchronous event lifetime');
      assert.equal(h.stored.length, 0, 'The synthetic cache write is still pending');
    } finally { pending.resolve(); }
    await event.completeBackground();
    assert.equal(h.putCalls(), 1);
    assert.deepEqual(h.stored, [{ url: origin + asset.path, body: 'synthetic static asset' }]);
  });

  test(`${asset.kind} successful background storage preserves the network body and exact static URL`, async () => {
    const h = harness();
    const event = h.dispatch(asset.path, { destination: asset.destination });
    assert.equal(await promptResponse(event.response), h.network);
    assert.ok(event.backgroundCount > 0, 'Cache writes must be attached to the fetch event lifetime');
    assert.equal(await h.network.text(), 'synthetic static asset', 'Caching must clone rather than consume the delivered body');
    await event.completeBackground();
    assert.deepEqual(h.stored, [{ url: origin + asset.path, body: 'synthetic static asset' }]);
    assert.ok(h.opened.every(name => name.startsWith('accesslobby-static-')));
  });
}

test('offline navigation stays neutral when the offline cache lookup rejects', async () => {
  const h = harness({ fault: 'match', networkError: new Error('synthetic-private-authority-canary') });
  const event = h.dispatch('/admin', { mode: 'navigate', destination: 'document' });
  const response = await promptResponse(event.response);
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const body = await response.text();
  assert.match(body, /Connection required/);
  assert.doesNotMatch(body, /synthetic-private-authority-canary|Operator console|reviewApplications|managePeople/);
  assert.equal(h.putCalls(), 0);
  assert.deepEqual(h.lookups, ['/offline.html']);
  await event.completeBackground();
});

for (const fault of [undefined, 'open'] as const) {
  test(`a real static network failure is not hidden by ${fault ? 'failed' : 'healthy'} cache storage`, async () => {
    const networkError = new TypeError('synthetic actual network failure');
    const h = harness({ fault, networkError });
    const event = h.dispatch(staticAssets[0].path, { destination: 'script' });
    assert.ok(event.response);
    await assert.rejects(event.response, error => error === networkError);
    assert.equal(h.fetched.length, 1);
    assert.equal(h.putCalls(), 0, 'Network failure must not create a cached substitute');
    await event.completeBackground();
  });
}

test('existing eligible static cache hits stay usable without a network request', async () => {
  for (const asset of staticAssets) {
    const cached = assetResponse('previously cached immutable asset');
    const h = harness({ cached, networkError: new Error('offline') });
    const event = h.dispatch(asset.path, { destination: asset.destination });
    assert.equal(await promptResponse(event.response), cached);
    assert.equal(h.fetched.length, 0);
    assert.equal(h.putCalls(), 0);
    await event.completeBackground();
  }
});

test('ineligible static responses are delivered unchanged and never stored', async () => {
  for (const response of [assetResponse('missing', { status: 404 }),
    assetResponse('opaque fixture', undefined, 'opaque'),
    assetResponse('cookie fixture', { headers: { 'set-cookie': 'synthetic-test-cookie=unusable' } })]) {
    const h = harness({ response });
    const event = h.dispatch(staticAssets[0].path, { destination: 'script' });
    assert.equal(await promptResponse(event.response), response);
    await event.completeBackground();
    assert.equal(h.putCalls(), 0);
  }
});

test('private documents use no-store network delivery and never enter Cache Storage', async () => {
  for (const path of ['/admin', '/admin/people', '/account', '/auth/callback?code=synthetic-code', '/sign-out']) {
    const h = harness({ response: assetResponse('synthetic private document') });
    const event = h.dispatch(path, { mode: 'navigate', destination: 'document' });
    assert.equal(await promptResponse(event.response), h.network);
    assert.equal(h.fetched.length, 1);
    assert.equal(h.fetched[0].init?.cache, 'no-store');
    assert.equal(h.opened.length, 0);
    assert.equal(h.lookups.length, 0);
    assert.equal(h.putCalls(), 0);
    await event.completeBackground();
  }
});

test('API, RSC, cross-origin and mutating requests remain outside worker cache handling', async () => {
  for (const [path, request] of [
    ['/v1/admin/access', {}], ['/admin?_rsc=synthetic-flight-request', {}],
    ['https://api.accesslobby.example.test/v1/me', {}],
    ['https://another.example.test/_next/static/chunks/unrelated.js', {}],
    ['/admin/people/action', { method: 'POST' }],
    [staticAssets[0].path, { method: 'POST', destination: 'script' }],
  ] as const) {
    const h = harness();
    const event = h.dispatch(path, request);
    assert.equal(event.response, undefined, 'The browser must retain its normal network path');
    assert.equal(event.backgroundCount, 0);
    assert.equal(h.fetched.length, 0);
    assert.equal(h.opened.length, 0);
    assert.equal(h.putCalls(), 0);
  }
});

function lifecycleHarness(fault?: 'open' | 'addAll' | 'keys' | 'delete') {
  const handlers = new Map<string, (event: any) => void>();
  const current = 'accesslobby-static-' + 'd'.repeat(40);
  const previous = 'accesslobby-static-previous';
  const obsolete = 'accesslobby-static-obsolete';
  const unrelated = 'unrelated-application-static';
  const opened: string[] = [], deleted: string[] = [], precached: string[][] = [];
  let claims = 0, forcedActivations = 0;
  const storageError = new Error('synthetic optional lifecycle storage failure');
  vm.runInNewContext(serviceWorkerSource('d'.repeat(40)), {
    URL, Response, Headers, setTimeout, clearTimeout,
    self: {
      location: new URL(origin),
      addEventListener: (name: string, handler: (event: any) => void) => handlers.set(name, handler),
      clients: { claim: async () => { claims++; } },
      skipWaiting: async () => { forcedActivations++; },
    },
    caches: {
      async open(name: string) {
        opened.push(name);
        if (fault === 'open') throw storageError;
        return { async addAll(paths: string[]) {
          precached.push([...paths]);
          if (fault === 'addAll') throw storageError;
        } };
      },
      async keys() {
        if (fault === 'keys') throw storageError;
        return [unrelated, obsolete, current, previous];
      },
      async delete(name: string) {
        deleted.push(name);
        if (fault === 'delete') throw storageError;
        return true;
      },
    },
  });
  async function dispatch(name: 'install' | 'activate') {
    const lifetimes: Array<Promise<unknown>> = [];
    let dispatching = true;
    handlers.get(name)!({ waitUntil(promise: Promise<unknown>) {
      assert.equal(dispatching, true, 'Lifecycle work must be registered during dispatch');
      lifetimes.push(Promise.resolve(promise));
    } });
    dispatching = false;
    assert.ok(lifetimes.length > 0, 'Lifecycle event must retain its work');
    await assert.doesNotReject(Promise.all(lifetimes), 'Optional cache storage must not reject worker installation or activation');
  }
  return { dispatch, current, previous, obsolete, unrelated, opened, deleted, precached,
    claims: () => claims, forcedActivations: () => forcedActivations };
}

test('a worker installs when optional cache opening fails without forcing an update', async () => {
  const h = lifecycleHarness('open');
  await h.dispatch('install');
  assert.deepEqual(h.opened, [h.current]);
  assert.deepEqual(h.precached, []);
  assert.equal(h.claims(), 0);
  assert.equal(h.forcedActivations(), 0, 'Storage recovery must preserve explicit update activation');
});

test('a worker installs when neutral-shell precaching fails without forcing an update', async () => {
  const h = lifecycleHarness('addAll');
  await h.dispatch('install');
  assert.deepEqual(h.precached, [['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png']]);
  assert.equal(h.claims(), 0);
  assert.equal(h.forcedActivations(), 0);
});

test('cache enumeration and cleanup failures do not prevent an activated worker claiming clients', async () => {
  for (const fault of ['keys', 'delete'] as const) {
    const h = lifecycleHarness(fault);
    await h.dispatch('activate');
    assert.equal(h.claims(), 1, `Clients must be claimed after optional ${fault} failure`);
    assert.deepEqual(h.deleted, fault === 'keys' ? [] : [h.obsolete]);
    assert.equal(h.deleted.includes(h.unrelated), false);
    assert.equal(h.deleted.includes(h.current), false);
    assert.equal(h.deleted.includes(h.previous), false);
    assert.equal(h.forcedActivations(), 0);
  }
});

test('successful activation cleanup preserves current, previous and unrelated caches', async () => {
  const h = lifecycleHarness();
  await h.dispatch('activate');
  assert.deepEqual(h.deleted, [h.obsolete]);
  assert.equal(h.claims(), 1);
  assert.equal(h.forcedActivations(), 0);
});
