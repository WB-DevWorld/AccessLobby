import assert from 'node:assert/strict';
import test from 'node:test';
import { notesFixture } from './notes-fixture.mjs';
import { Notes } from '../notes.mjs';

test('Enben HTTP story: two accounts, live admission, safe note changes and both logout scopes', async () => {
  const fixture = await notesFixture();
  try {
    const { origin } = fixture;
    const get = (path, cookie) => fetch(`${origin}${path}`, { headers: { cookie }, redirect: 'manual' });
    const post = (path, cookie, body, extra = {}) => fetch(`${origin}${path}`, { method: 'POST', redirect: 'manual',
      headers: { cookie, origin, 'content-type': 'application/x-www-form-urlencoded', ...extra }, body: new URLSearchParams(body) });
    assert.match(await (await get('/', '')).text(), /Enben Notes/);
    assert.equal((await get('/notes', '')).status, 401);
    assert.equal((await get('/register', '')).status, 404);
    const alice = await fixture.login('alice'), bob = await fixture.login('bob');
    assert.notEqual(alice, bob);
    assert.equal(alice.split('=')[1].includes('.'), false); // Opaque cookie, not a JWT.
    assert.equal((await post('/notes', alice, { title: '<script>bad</script>', body: '</textarea><script>bad</script>' })).status, 303);
    const listResponse = await get('/notes', alice);
    assert.equal(listResponse.headers.get('cache-control'), 'no-store');
    const list = await listResponse.text();
    assert.match(list, /&lt;script&gt;bad&lt;\/script&gt;/);
    const notePath = /href="(\/notes\/[a-f0-9-]{36})"/.exec(list)[1];
    const editor = await (await get(notePath, alice)).text();
    assert.match(editor, /&lt;\/textarea&gt;&lt;script&gt;/); assert.doesNotMatch(editor, /<script>bad/);
    assert.doesNotMatch(await (await get('/notes', bob)).text(), /bad/);
    for (const attempt of [() => get(notePath, bob), () => post(notePath, bob, { title: 'steal', body: '' }), () => post(`${notePath}/delete`, bob, {})]) assert.equal((await attempt()).status, 404);
    assert.equal((await get(`${notePath}/delete`, alice)).status, 405);
    assert.equal((await post('/notes', alice, { title: 'forged', body: '' }, { origin: 'https://other.example.test' })).status, 403);
    assert.equal((await post('/notes', alice, { title: 'forged', body: '' }, { origin: '' })).status, 403);
    assert.equal((await post('/notes', alice, { title: 'valid', body: '' }, { 'content-type': 'application/json' })).status, 415);
    assert.equal((await post('/notes', alice, { title: ' ', body: '' })).status, 400);
    assert.equal((await post('/notes', alice, { title: 'a'.repeat(121), body: '' })).status, 400);
    assert.equal((await post('/notes', alice, { title: 'valid', body: 'a'.repeat(10001) })).status, 400);
    assert.equal((await post('/notes', alice, { title: 'valid', body: 'a'.repeat(131073) })).status, 413);
    fixture.setEntry('denied');
    assert.equal((await get('/notes', alice)).status, 403);
    assert.equal((await post(notePath, alice, { title: 'not saved', body: '' })).status, 403);
    assert.equal((await post(`${notePath}/delete`, alice, {})).status, 403);
    fixture.setEntry('unavailable');
    const unavailable = await get(notePath, alice);
    assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /bad/);
    assert.equal((await post('/notes', alice, { title: 'not saved', body: '' })).status, 503);
    fixture.setEntry('allowed');
    assert.match(await (await get(notePath, alice)).text(), /&lt;script&gt;bad/);
    assert.equal((await post(notePath, alice, { title: 'Edited note', body: 'Saved text' })).status, 303);
    assert.match(await (await get('/notes', alice)).text(), /Edited note/);
    assert.equal((await post('/logout', alice, { scope: 'current' })).headers.get('location'), '/');
    assert.equal((await get(notePath, alice)).status, 401);
    assert.equal((await get('/notes', bob)).status, 200);
    const aliceAgain = await fixture.login('alice');
    assert.match(await (await get(notePath, aliceAgain)).text(), /Saved text/); // Notes survive sign-out; owner link is stable.
    assert.equal((await post(`${notePath}/delete`, aliceAgain, {})).status, 303);
    assert.equal((await get(notePath, aliceAgain)).status, 404);
    const shared = await post('/logout', aliceAgain, { scope: 'all' });
    const destination = new URL(shared.headers.get('location'));
    assert.equal(destination.origin, new URL(fixture.issuer).origin);
    assert.equal(destination.searchParams.get('client_id'), fixture.clientId);
    assert.equal(destination.searchParams.get('post_logout_redirect_uri'), `${origin}/`);
    assert.equal((await get('/notes', aliceAgain)).status, 401);
    assert.equal((await post('/backchannel-logout', '', { logout_token: 'invalid' })).status, 400);
    assert.equal((await get('/notes', bob)).status, 200);
    const token = await fixture.logoutToken('bob');
    assert.equal((await post('/backchannel-logout', '', { logout_token: token })).status, 200);
    assert.equal((await post('/backchannel-logout', '', { logout_token: token })).status, 400);
    assert.equal((await get('/notes', bob)).status, 401);
  } finally { await fixture.close(); }
});

test('disposable note storage bounds per-account growth without changing another account', () => {
  const notes = new Notes();
  for (let i = 0; i < 50; i++) notes.create('local-a', `Note ${i}`, '');
  assert.throws(() => notes.create('local-a', 'Over limit', ''), error => error.status === 409);
  const id = notes.create('local-b', 'My note', '');
  assert.throws(() => notes.get('local-a', id), error => error.status === 404);
  notes.delete('local-a', notes.list('local-a')[0].id);
  notes.create('local-a', 'Room again', '');
  assert.equal(notes.list('local-b').length, 1);
});
