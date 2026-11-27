import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const account = readFileSync(new URL('../app/account/page.tsx', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../app/identity/page.tsx', import.meta.url), 'utf8');
const help = readFileSync(new URL('../app/help/page.tsx', import.meta.url), 'utf8');
const signOut = readFileSync(new URL('../components/sign-out-choices.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../components/app-shell.tsx', import.meta.url), 'utf8');

test('stable AccessLobby ID remains visible to its owner', () => {
  assert.match(account, /label="AccessLobby ID"/);
  assert.match(identity, /label="AccessLobby ID"/);
  assert.match(account, /CopyIdentifier/);
  assert.match(identity, /CopyIdentifier/);
  assert.doesNotMatch(identity, /Account ID available/);
});

test('identity and app-local account boundaries remain explicit', () => {
  assert.match(help, /Each app keeps its own local account, data and permissions/);
  assert.match(help, /Matching email addresses alone cannot link or merge/);
  assert.match(identity, /Apps keep their own accounts/);
  assert.match(shell, /label: 'Identity'/);
  assert.match(shell, /label: 'Apps', href: '\/apps'/);
  assert.match(shell, /AccessLobby Identity/);
});

test('owner-selected logout choices remain visible without overclaiming', () => {
  assert.match(signOut, />Sign out of this app</);
  assert.match(signOut, />Sign out of AccessLobby and supported apps</);
  assert.match(signOut, /Connected apps may take time to sign out/);
  assert.match(signOut, /This does not sign you out on every device/);
});
