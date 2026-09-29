import assert from 'node:assert/strict';
import test from 'node:test';
import { AppEntryError, loadAppEntry } from '../app-entry.mjs';
import { appEntryRequired } from '../config.mjs';

const person = { accessToken: 'server-only' };
const appId = 'a578d4dc-4444-4444-8888-0231d5902d14';
const reply = body => async (url, init) => {
  assert.equal(url, 'https://api.test/v1/application-entry');
  assert.equal(init.headers.authorization, 'Bearer server-only');
  return { ok: true, json: async () => body };
};
test('entry check accepts only the current token client and positive contract', async () => {
  const valid = { contract: 'accesslobby.app-entry.v0.1', applicationId: appId, clientId: 'my-app', admitted: true };
  assert.equal(await loadAppEntry('https://api.test', person, 'my-app', reply(valid)), appId);
  for (const body of [{ ...valid, clientId: 'another-app' }, { ...valid, admitted: false }, { ...valid, applicationId: 'no' }]) {
    await assert.rejects(loadAppEntry('https://api.test', person, 'my-app', reply(body)),
      error => error instanceof AppEntryError && error.status === 503);
  }
  assert.equal(appEntryRequired('true'), true);
  assert.equal(appEntryRequired('false'), false);
});
