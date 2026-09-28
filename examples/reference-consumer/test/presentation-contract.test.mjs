import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('signed-in reference app distinguishes central identity from local account', () => {
  assert.match(server, /<strong>AccessLobby ID<\/strong>/);
  assert.match(server, /<strong>Reference App Account ID<\/strong>/);
  assert.match(server, /This app keeps a separate local account for its own data and permissions/);
  assert.match(server, /data-copy=/);
});

test('reference app exposes both owner-selected logout choices', () => {
  assert.match(server, />Sign out of this app<\/button>/);
  assert.match(server, />Sign out of AccessLobby and supported apps<\/button>/);
  assert.match(server, /may retain a separate local session until it processes the sign-out/);
});
