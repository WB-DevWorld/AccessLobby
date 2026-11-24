import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordSharedSessionEnd } from '../lib/shared-logout';

test('shared logout marks only the bearer session, uses no-store and does not put credentials in a URL', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fake = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Response.json({ contract: 'accesslobby.browser-session.v0.1', ended: true });
  }) as typeof fetch;
  assert.equal(await recordSharedSessionEnd('private-server-token', 'https://api.example.test/', fake), 'recorded');
  assert.equal(calls[0]!.url, 'https://api.example.test/v1/session/end');
  assert.equal(calls[0]!.init?.cache, 'no-store'); assert.equal(calls[0]!.init?.body, undefined);
  assert.equal((calls[0]!.init?.headers as Record<string, string>).authorization, 'Bearer private-server-token');
  assert.equal(await recordSharedSessionEnd('token', 'https://api.example.test', (async () => new Response(null, { status: 404 })) as typeof fetch), 'legacy');
  await assert.rejects(recordSharedSessionEnd('token', 'https://api.example.test', (async () => new Response(null, { status: 503 })) as typeof fetch));
  await assert.rejects(recordSharedSessionEnd('token', 'https://api.example.test', (async () => Response.json({ ended: true })) as typeof fetch));
});
