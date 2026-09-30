import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import { serviceWorkerSource } from '../lib/pwa-worker';

function harness() {
  const origin = 'https://accesslobby.example.test';
  const handlers = new Map<string, (event: any) => void>();
  let activations = 0;
  let calls = 0;
  let failEnumeration = false;
  let onSecondEnumeration = () => {};
  const window = (id: string, path = '/', safe: boolean | null = true) => ({
    id, url: origin + path, safe,
    postMessage(_message: unknown, ports: any[]) {
      if (this.safe !== null) ports[0].postMessage({ safe: this.safe });
      ports[0].close();
    },
  });
  const initiator = window('home');
  let clients = [initiator];
  vm.runInNewContext(serviceWorkerSource('c'.repeat(40)), {
    URL, Set, MessageChannel, setTimeout, clearTimeout,
    self: {
      location: new URL(origin),
      addEventListener: (type: string, handler: (event: any) => void) => handlers.set(type, handler),
      skipWaiting: async () => { activations++; },
      clients: { matchAll: async (options: { type: string; includeUncontrolled: boolean }) => {
        assert.equal(options.type, 'window');
        assert.equal(options.includeUncontrolled, true);
        if (failEnumeration) throw new Error('browser unavailable');
        if (++calls === 2) onSecondEnumeration();
        return clients;
      } },
    },
  });
  return {
    window, initiator,
    clients: (next: typeof clients) => { clients = next; },
    fail: (value: boolean) => { failEnumeration = value; },
    beforeRecheck: (action: () => void) => { onSecondEnumeration = action; },
    activations: () => activations,
    async request(protocol?: number, source = initiator, withReply = true) {
      calls = 0;
      const results: string[] = [];
      let done: Promise<unknown> | undefined;
      handlers.get('message')!({
        data: { type: 'ACCESSLOBBY_ACTIVATE', protocol }, source,
        ports: withReply ? [{ postMessage: (result: { status: string }) => results.push(result.status), close() {} }] : [],
        waitUntil: (promise: Promise<unknown>) => { done = promise; },
      });
      await done;
      return results;
    },
  };
}

test('legacy installed caller is blocked by any account window and can retry after it closes', async () => {
  const h = harness();
  h.clients([h.initiator, h.window('other', '/auth/callback')]);
  assert.deepEqual(await h.request(), ['blocked']);
  assert.equal(h.activations(), 0);
  h.clients([h.initiator]);
  assert.deepEqual(await h.request(), ['accepted']);
  assert.equal(h.activations(), 1);
  assert.deepEqual(await h.request(undefined, h.initiator, false), []);
  assert.equal(h.activations(), 2);
  h.initiator.url += 'account';
  assert.deepEqual(await h.request(), ['blocked']);
  const outsider = h.window('foreign');
  outsider.url = 'https://iam.example.test/';
  assert.deepEqual(await h.request(2, outsider), []);
  assert.equal(h.activations(), 2);
});

test('all current windows must acknowledge clean state; dirty peer blocks until a safe retry', async () => {
  const h = harness();
  const peer = h.window('peer', '/', false);
  h.clients([h.initiator, peer]);
  assert.deepEqual(await h.request(2), ['blocked']);
  assert.equal(h.activations(), 0);
  peer.safe = true;
  assert.deepEqual(await h.request(2), ['accepted']);
  assert.equal(h.activations(), 1);
});

test('unresponsive window and failed enumeration fail closed without trapping a later retry', async () => {
  const h = harness();
  h.clients([h.initiator, h.window('unknown', '/', null)]);
  assert.deepEqual(await h.request(2), ['blocked']);
  h.fail(true);
  assert.deepEqual(await h.request(2), ['failed']);
  assert.equal(h.activations(), 0);
  h.fail(false); h.clients([h.initiator]);
  assert.deepEqual(await h.request(2), ['accepted']);
});

test('new window or navigation during safety replies blocks activation on the final recheck', async () => {
  const h = harness();
  h.beforeRecheck(() => h.clients([h.initiator, h.window('new-window')]));
  assert.deepEqual(await h.request(2), ['blocked']);
  h.clients([h.initiator]);
  h.beforeRecheck(() => { h.initiator.url += 'apps'; });
  assert.deepEqual(await h.request(2), ['blocked']);
  assert.equal(h.activations(), 0);
});
