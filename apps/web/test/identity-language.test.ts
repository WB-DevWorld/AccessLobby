import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const account = readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../app/identity/page.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/app-shell.tsx', import.meta.url), 'utf8');

test('stable AccessLobby ID remains visible to its owner', () => {
  assert.match(account, /label="AccessLobby ID"/);
  assert.match(identity, /label="AccessLobby ID"/);
  assert.match(account, /CopyIdentifier/);
  assert.match(identity, /CopyIdentifier/);
  assert.doesNotMatch(identity, /Account ID available/);
});

test('identity and app-local account boundaries remain explicit', () => {
  assert.match(home, /Each app may still keep its own local account/);
  assert.match(account, /Each app may keep its own local account/);
  assert.match(identity, /Apps keep their own accounts/);
  assert.match(shell, /label: 'Identity'/);
  assert.match(shell, /label: 'Apps & Access'/);
  assert.match(shell, /AccessLobby Identity/);
});

test('owner-selected logout choices remain visible without overclaiming', () => {
  assert.match(account, />Sign out of this app</);
  assert.match(account, />Sign out of AccessLobby and supported apps</);
  assert.match(account, /Some apps may keep a separate local session/);
});
