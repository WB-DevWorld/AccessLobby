import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountSessionsContract, accountSessionsPath, handleAccountSessionEnd, parseAccountSessions,
  accountSecurityEventsContract, accountSecurityEventsPath, parseAccountSecurityHistory } from '../lib/account-sessions';
import type { CurrentIdentityResult } from '../lib/current-identity-model';

const origin = 'https://account.example.test';
const handle = '11111111-1111-4111-8111-111111111111';
const person = '22222222-2222-4222-8222-222222222222';
const expectedState = 'a'.repeat(64);
const row = { handle, clientId: 'recorded-app', applicationName: 'Recorded app', createdAt: '2026-11-28T10:00:00.000Z',
  expiresAt: '2026-11-28T10:05:00.000Z', receiptCount: 2, expectedState, currentBrowser: true };
const payload = { contract: accountSessionsContract, sessions: [row], nextCursor: null };
const identity: CurrentIdentityResult = { state: 'ready', person: { id: person, status: 'active' } };
const fields = () => new URLSearchParams({ intent: 'end-recorded-session', handle, expectedState, confirmEnd: 'yes' });
const request = (body: BodyInit = fields(), headers: Record<string, string> = {}, method = 'POST') => new Request(`${origin}/security/action`, {
  method, headers: { origin, 'content-type': 'application/x-www-form-urlencoded', ...headers }, ...(method === 'POST' ? { body } : {}),
});

test('recorded-session parsing accepts only bounded safe metadata and generates account-only cursors', () => {
  assert.deepEqual(parseAccountSessions(payload), { sessions: [row], nextCursor: null });
  const parsed = parseAccountSessions({ ...payload, sessions: [{ ...row, rawSid: 'never-return', accessToken: 'also-private' }] });
  assert(!JSON.stringify(parsed).includes('never-return')); assert(!JSON.stringify(parsed).includes('also-private'));
  for (const value of [null, [], { ...payload, contract: 'accesslobby.admin.v0.1' }, { ...payload, nextCursor: 'evil?token=secret' },
    { ...payload, sessions: Array.from({ length: 26 }, () => row) }, { ...payload, sessions: [row, { ...row, handle: handle.toUpperCase() }] }]) {
    assert.equal(parseAccountSessions(value), null);
  }
  for (const bad of [{ ...row, currentBrowser: 'yes' }, { ...row, expectedState: 'token' }, { ...row, handle: 'sid-123' },
    { ...row, applicationName: 'Bad\nname' }, { ...row, clientId: 'app?token=private' }, { ...row, receiptCount: -1 },
    { ...row, createdAt: 'yesterday' }, { ...row, expiresAt: '' }]) {
    assert.equal(parseAccountSessions({ ...payload, sessions: [bad] }), null);
  }
  assert.equal(accountSessionsPath(undefined), '/v1/account/sessions');
  assert.equal(accountSessionsPath(handle.toUpperCase()), `/v1/account/sessions?after=${handle}`);
  for (const value of ['', null, [], 'https://foreign.invalid', '0 OR 1=1']) assert.equal(accountSessionsPath(value), null);
});

test('an ordinary signed-in person can end a confirmed own record without requesting a person or operator grant', async () => {
  let calls = 0;
  const response = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => identity,
    api: async (path, init) => {
      calls++; assert.equal(path, `/v1/account/sessions/${handle}/end`);
      assert.deepEqual(init, { method: 'POST', body: { expectedState } });
      return Response.json({ contract: accountSessionsContract, handle, ended: true, changed: true, receiptCount: 2 });
    } });
  assert.equal(calls, 1); assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${origin}/security?notice=ended`);
  assert.match(response.headers.get('cache-control')!, /private.*no-store/);
  const uppercase = fields(); uppercase.set('handle', handle.toUpperCase());
  const unchanged = await handleAccountSessionEnd(request(uppercase), origin, { getIdentity: async () => identity,
    api: async () => Response.json({ contract: accountSessionsContract, handle, ended: true, changed: false, receiptCount: 2 }) });
  assert.equal(unchanged.headers.get('location'), `${origin}/security?notice=unchanged`);
});

test('same-origin and fresh account checks precede any recorded-session mutation', async () => {
  let calls = 0;
  const api = async () => { calls++; throw new Error('must not call'); };
  for (const originValue of ['https://attacker.invalid', 'null', '']) {
    const result = await handleAccountSessionEnd(request(fields(), { origin: originValue }), origin, { getIdentity: async () => identity, api });
    assert.equal(result.status, 403);
  }
  const get = await handleAccountSessionEnd(request(fields(), {}, 'GET'), origin, { getIdentity: async () => identity, api });
  assert.equal(get.status, 405);
  for (const state of ['signed-out', 'restricted', 'unavailable'] as const) {
    const result = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => ({ state }), api });
    assert.equal(result.status, state === 'signed-out' ? 303 : state === 'restricted' ? 403 : 503);
    if (state === 'signed-out') assert.equal(result.headers.get('location'), `${origin}/auth/login`);
  }
  const unavailable = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => { throw new Error('unavailable'); }, api });
  assert.equal(unavailable.status, 503); assert.equal(calls, 0);
});

test('confirmation, exact fields and bounded form decoding prevent authority or redirect injection', async () => {
  let calls = 0;
  const dependencies = { getIdentity: async () => identity, api: async () => { calls++; throw new Error('must not call'); } };
  const invalid: URLSearchParams[] = [];
  for (const key of ['intent', 'handle', 'expectedState', 'confirmEnd']) { const form = fields(); form.delete(key); invalid.push(form); }
  for (const key of ['intent', 'handle', 'expectedState', 'confirmEnd']) { const form = fields(); form.append(key, form.get(key)!); invalid.push(form); }
  for (const [key, value] of [['personId', person], ['sid', 'private-session'], ['returnTo', 'https://attacker.invalid'], ['__proto__', 'attack'],
    ['handle', 'sid-instead-of-handle'], ['expectedState', 'invalid'], ['confirmEnd', 'no'], ['intent', 'end-all-sessions']]) {
    const form = fields(); form.set(key, value!); invalid.push(form);
  }
  for (const form of invalid) {
    const response = await handleAccountSessionEnd(request(form), origin, dependencies);
    assert.equal(response.status, 400);
  }
  for (const type of ['application/json', 'multipart/form-data; boundary=test', 'text/plain']) {
    const response = await handleAccountSessionEnd(request(fields(), { 'content-type': type }), origin, dependencies);
    assert.equal(response.status, 400);
  }
  assert.equal((await handleAccountSessionEnd(request('x'.repeat(4097)), origin, dependencies)).status, 400);
  assert.equal((await handleAccountSessionEnd(request(new Uint8Array([0xc3, 0x28])), origin, dependencies)).status, 400);
  assert.equal(calls, 0);
});

test('uncertain or unauthorized API replies never become a successful ending or a reflected error', async () => {
  for (const response of [Response.json({ contract: accountSessionsContract, handle: person, ended: true, changed: true }),
    Response.json({ contract: 'wrong', handle, ended: true, changed: true }), Response.json({ contract: accountSessionsContract, handle, ended: true, changed: 'yes' }),
    Response.json({ error: 'secret-token-value' }, { status: 500 }), new Response('not json', { status: 200 })]) {
    const result = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => identity, api: async () => response });
    assert.equal(result.headers.get('location'), `${origin}/security?notice=unavailable`);
  }
  const failed = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => identity, api: async () => { throw new Error('unknown outcome'); } });
  assert.equal(failed.headers.get('location'), `${origin}/security?notice=unavailable`);
  const stale = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => identity,
    api: async () => Response.json({ error: 'app_session_snapshot_changed' }, { status: 409 }) });
  assert.equal(stale.headers.get('location'), `${origin}/security?notice=app_session_snapshot_changed`);
  const expired = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => identity, api: async () => new Response(null, { status: 401 }) });
  assert.equal(expired.headers.get('location'), `${origin}/auth/login`);
  const denied = await handleAccountSessionEnd(request(), origin, { getIdentity: async () => identity, api: async () => new Response(null, { status: 403 }) });
  assert.equal(denied.status, 403); assert.equal(await denied.text(), 'Account unavailable');
});

test('personal history models reject widened scope, invalid rows and non-opaque cursors', () => {
  const event = { id: handle, action: 'app_session_ended', clientId: 'recorded-app', applicationName: 'Recorded app',
    occurredAt: '2026-11-28T11:00:00.000Z', receiptCount: 2 };
  const value = { contract: accountSecurityEventsContract, events: [event], nextCursor: null };
  assert.deepEqual(parseAccountSecurityHistory(value), { events: [event], nextCursor: null });
  const narrowed = parseAccountSecurityHistory({ ...value, events: [{ ...event, sid: 'private-sid', receipt: 'private-capability', personId: person }] });
  for (const secret of ['private-sid', 'private-capability', person]) assert(!JSON.stringify(narrowed).includes(secret));
  for (const bad of [null, [], { ...value, contract: 'accesslobby.admin.v0.1' }, { ...value, nextCursor: '123' },
    { ...value, events: Array.from({ length: 26 }, () => event) }, { ...value, events: [event, event] }]) {
    assert.equal(parseAccountSecurityHistory(bad), null);
  }
  for (const badEvent of [{ ...event, id: '1' }, { ...event, action: 'password_changed' }, { ...event, receiptCount: 0 },
    { ...event, applicationName: '<bad\nname>' }, { ...event, occurredAt: 'yesterday' }, { ...event, clientId: 'app?token=value' }]) {
    assert.equal(parseAccountSecurityHistory({ ...value, events: [badEvent] }), null);
  }
  assert.equal(accountSecurityEventsPath(undefined), '/v1/account/security-events');
  assert.equal(accountSecurityEventsPath(handle.toUpperCase()), `/v1/account/security-events?after=${handle}`);
  for (const after of [null, [], '', '123', 'https://foreign.invalid', '0 OR 1=1']) assert.equal(accountSecurityEventsPath(after), null);
});
