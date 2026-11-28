import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAvailableApplications } from '../lib/applications';
import { applicationLaunchLink } from '../lib/application-launch';

const id = '11111111-1111-4111-8111-111111111111';
const response = (app: object) => ({ contract: 'accesslobby.applications.v0.1', applications: [{
  id, name: 'Sample app', admission: 'grant_required', ...app,
}] });

test('discovery alone never creates an entry grant or launch link', () => {
  for (const fields of [{}, { admitted: false }, { admission: 'authenticated_open', admitted: false }]) {
    const [app] = parseAvailableApplications(response({ launchUrl: 'https://app.example.test/', ...fields }))!;
    assert.equal(app!.admitted, false);
    assert.equal(app!.launchUrl, undefined);
    assert.equal(applicationLaunchLink(app!), null);
  }
});

test('approved destinations are bounded navigation metadata and unrelated claims are dropped', () => {
  for (const fields of [{ admitted: true }, { admission: 'authenticated_open' }]) {
    const [app] = parseAvailableApplications(response({ ...fields, launchUrl: 'https://app.example.test/home',
      role: 'administrator', subject: 'private-provider-canary', accessToken: 'private-token-canary' }))!;
    assert.equal(applicationLaunchLink(app!), 'https://app.example.test/home');
    assert.deepEqual(Object.keys(app!).sort(), ['admission', 'admitted', 'id', 'launchUrl', 'name']);
  }
});

test('malformed admission or unsafe navigation cannot become a working launch destination', () => {
  assert.equal(parseAvailableApplications(response({ admitted: 'true' })), null);
  for (const url of ['javascript:alert(1)', 'http://app.example.test/', 'https://name:secret@app.example.test/',
    'https://app.example.test/?redirect=https://elsewhere.example', 'https://app.example.test/#fragment']) {
    const [app] = parseAvailableApplications(response({ admitted: true, launchUrl: url }))!;
    assert.equal(app!.launchUrl, undefined);
    assert.equal(applicationLaunchLink(app!), null);
  }
});
