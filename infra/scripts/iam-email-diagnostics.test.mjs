import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { assessEmailMetadata, diagnoseIamEmail, main } from './iam-email-diagnostics.mjs';

const username = 'al-qual-email-test';
const token = 'operator-token-canary';
const fixture = () => ({
  realm: { realm: 'accesslobby-first-party', enabled: true, verifyEmail: false, accessTokenLifespan: 300,
    smtpServer: { host: 'private-smtp-canary', from: 'private-from-canary@example.test',
      user: 'private-user-canary', password: 'private-password-canary', auth: 'true', starttls: 'true' },
    secret: 'private-realm-canary' },
  action: { alias: 'VERIFY_EMAIL', enabled: true, defaultAction: false },
  users: [{ id: 'private-user-id-canary', username, email: 'private-address-canary@example.test', enabled: true,
    emailVerified: false, requiredActions: ['VERIFY_EMAIL'], attributes: { private: ['private-attribute-canary'] } }],
});
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

test('unverified user blocks metadata pass without leaking configuration or identity', () => {
  const report = assessEmailMetadata(fixture(), username);
  assert.equal(report.assessed, true);
  assert.equal(report.metadataChecksPassed, false);
  assert.deepEqual(report.blockers, ['test_user_email_unverified']);
  assert.equal(report.accessTokenLifespanSeconds, 300);
  assert.equal(report.testUser.verificationActionAssigned, true);
  assert.equal(report.deliveryTestPerformed, false);
  assert.equal(report.freshOidcClaimTested, false);
  assert.ok(!/canary|example\.test|al-qual-email-test/.test(JSON.stringify(report)));
});

test('metadata pass still does not claim mail delivery or a verified OIDC token', () => {
  const data = fixture(); data.users[0].emailVerified = true;
  const report = assessEmailMetadata(data, username);
  assert.equal(report.metadataChecksPassed, true);
  assert.equal(report.deliveryTestPerformed, false);
  assert.equal(report.freshOidcClaimTested, false);
});

test('missing SMTP, disabled action and unavailable account remain distinct', () => {
  const data = fixture(); data.realm.smtpServer = {}; data.action.enabled = false; data.users = [];
  assert.deepEqual(assessEmailMetadata(data, username).blockers,
    ['smtp_configuration_incomplete', 'verify_email_action_disabled', 'test_user_not_found']);
  for (const users of [[{ ...fixture().users[0], username: 'another-account' }], fixture().users.concat(fixture().users)]) {
    const report = assessEmailMetadata({ ...fixture(), users }, username);
    assert.equal(report.testUser.emailVerified, null);
    assert.ok(report.blockers.includes('test_user_not_unique_or_exact'));
  }
  assert.equal(assessEmailMetadata({ ...fixture(), action: {} }, username).assessed, false);
});

test('only exact private targets, synthetic labels and header-safe tokens can make requests', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw new Error('must not request'); };
  for (const options of [
    { base: 'https://iam.example.test' }, { base: 'http://iam:8080/path' },
    { base: 'http://iam:8080?private=x' }, { base: 'http://user:pass@iam:8080' },
    { base: 'http://iam:8081' }, { username: 'owner' }, { username: 'al-qual-x&email=other' },
    { token: 'secret\nheader' }, { token: '' },
  ]) {
    const report = await diagnoseIamEmail({ base: 'http://iam:8080', username, token, fetcher, ...options });
    assert.equal(report.assessed, false);
  }
  assert.equal(calls, 0);
});

test('all diagnostic requests are GET-only, bounded, non-redirecting and exact-user scoped', async () => {
  const data = fixture(), calls = [];
  const report = await diagnoseIamEmail({ base: 'http://127.0.0.1:8080', username, token,
    fetcher: async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual');
      assert.equal(init.headers.authorization, `Bearer ${token}`); assert.ok(init.signal);
      if (url.includes('/users?')) {
        assert.equal(new URL(url).searchParams.get('exact'), 'true');
        assert.equal(new URL(url).searchParams.get('username'), username);
        return json(data.users);
      }
      return json(url.includes('/authentication/') ? data.action : data.realm);
    } });
  assert.equal(calls.length, 3);
  assert.equal(report.assessed, true);
  assert.ok(!JSON.stringify(report).includes(token));
});

test('HTTP denial, redirect, thrown secrets, malformed and oversized bodies never leak or follow', async () => {
  for (const fetcher of [
    async () => new Response('private-error-canary', { status: 403 }),
    async () => new Response('private-redirect-canary', { status: 302, headers: { location: 'https://evil.example.test/private' } }),
    async () => { throw new Error('private-thrown-canary'); },
    async () => new Response('private-invalid-canary'),
    async () => new Response('x'.repeat(1024 * 1024 + 1)),
  ]) {
    const report = await diagnoseIamEmail({ username, token, fetcher });
    assert.equal(report.assessed, false);
    assert.ok(!/canary|evil|private/.test(JSON.stringify(report)));
  }
});

test('CLI refuses token arguments, interactive entry and oversized stdin without echo', async () => {
  for (const [args, input] of [
    [['--token', 'private-cli-canary'], Readable.from([])],
    [['--username', username], Object.assign(Readable.from([]), { isTTY: true })],
    [['--username', username], Readable.from(['private-input-canary'.repeat(4000)])],
  ]) {
    let report;
    assert.equal(await main(args, input, value => { report = value; }), 2);
    assert.ok(!JSON.stringify(report).includes('canary'));
  }
});
