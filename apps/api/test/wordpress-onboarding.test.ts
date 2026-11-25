import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { openIsolatedDatabase } from './isolated-database.js';
import { recordFixtureApproval } from './application-review-fixture.js';
import { ApplicationError, ApplicationStore, exactApplicationUrl } from '../src/applications.js';
import { proofValue } from '../src/origin-proof.js';
import { provisionApp, representation } from '../src/provision-app.js';

const callback = 'https://wordpress.example.test/gh/wp-login.php?action=al_callback';
const logout = 'https://wordpress.example.test/gh/wp-login.php?action=al_signed_out';
const backchannel = 'https://wordpress.example.test/gh/?rest_route=/accesslobby/v1/backchannel-logout';

test('WordPress permits only fixed login actions and the plain REST backchannel query', () => {
  assert.equal(exactApplicationUrl(callback, 'wordpress', 'callback'), callback);
  assert.equal(exactApplicationUrl(logout, 'wordpress', 'logout'), logout);
  for (const url of [backchannel, backchannel.replace('/accesslobby/v1/backchannel-logout', '%2Faccesslobby%2Fv1%2Fbackchannel-logout'),
    'https://wordpress.example.test/gh/wp-json/accesslobby/v1/backchannel-logout']) {
    assert.equal(exactApplicationUrl(url, 'wordpress', 'backchannel'), url);
  }
  for (const url of [callback, logout, backchannel]) assert.throws(() => exactApplicationUrl(url), ApplicationError);
  for (const url of [callback + '&redirect_to=https://evil.example/', callback + '&action=al_signed_out',
    callback.replace('al_callback', '%61l_callback'), callback.replace('wp-login.php', 'custom-login.php'),
    callback.replace('/gh/', '/gh%2f'), callback + '#fragment', callback + '&code=secret']) {
    assert.throws(() => exactApplicationUrl(url, 'wordpress', 'callback'), ApplicationError);
  }
  for (const url of [backchannel + '&token=secret', backchannel.replace('backchannel-logout', 'users'),
    backchannel + '&rest_route=/accesslobby/v1/backchannel-logout', backchannel.replace('/accesslobby', '%252Faccesslobby')]) {
    assert.throws(() => exactApplicationUrl(url, 'wordpress', 'backchannel'), ApplicationError);
  }
});

test('real WordPress request, domain proof and private provisioning retain exact subdirectory URLs',
  { skip: !process.env.TEST_DATABASE_URL }, async () => {
    const { pool, close } = await openIsolatedDatabase();
    const person = randomUUID(), clientId = `wp-${randomUUID()}`;
    let challenge = '', created: ReturnType<typeof representation> | undefined;
    const lookupTxt = async (host: string) => {
      assert.equal(host, '_accesslobby-verify.wordpress.example.test');
      return [[proofValue(challenge)]];
    };
    const apps = new ApplicationStore(pool, [], lookupTxt);
    const base = 'http://iam:8080/admin/realms/accesslobby-first-party/clients';
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === `${base}?clientId=${clientId}`) return Response.json(created ? [{ id: 'wp-client', clientId }] : []);
      if (String(url) === base && init?.method === 'POST') {
        created = JSON.parse(String(init.body)) as ReturnType<typeof representation>;
        return new Response(null, { status: 201 });
      }
      if (String(url) === `${base}/wp-client`) return Response.json({ ...created, id: 'wp-client' });
      if (String(url) === `${base}/wp-client/protocol-mappers/models`) return Response.json(created?.protocolMappers);
      throw new Error('Unexpected IAM operation');
    }) as typeof fetch;
    const input = { clientId, name: 'WordPress subdirectory', platform: 'wordpress', redirectUri: callback,
      logoutUri: logout, backchannelLogoutUri: backchannel, visibility: 'hidden', admission: 'grant_required' };
    try {
      await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [person]);
      await assert.rejects(apps.request(person, { ...input, platform: 'web' }), ApplicationError);
      await assert.rejects(apps.request(person, { ...input, logoutUri: logout.replace('/gh/', '/intl/') }),
        error => error instanceof ApplicationError && error.code === 'application_path_mismatch');
      const app = await apps.request(person, input);
      assert.equal(app.platform, 'wordpress');
      challenge = app.originVerificationValue.slice('accesslobby-verify='.length);
      await apps.verifyOrigin(person, app.id);
      await recordFixtureApproval(pool, app.id, 'wordpress-review-61');
      const options = { issuer: 'https://iam.example.test/realms/accesslobby-first-party', lookupTxt,
        token: 'test-private-token', base: 'http://iam:8080', fetcher };
      const plan = await provisionApp(pool, app.id, '--plan', undefined, options);
      assert.deepEqual(plan.client.redirectUris, [callback]);
      assert.equal(plan.client.attributes['post.logout.redirect.uris'], logout);
      assert.equal(plan.client.attributes['backchannel.logout.url'], backchannel);
      assert.equal(await apps.allowedClient(clientId), false);
      await provisionApp(pool, app.id, '--activate-first-party', 'wordpress-review-61', options);
      assert.equal(await apps.allowedClient(clientId), true);
      assert.equal((await apps.mine(person))[0].platform, 'wordpress');
      await assert.rejects(apps.entry(person, clientId), ApplicationError);
      await apps.grant(person, app.id, person, undefined);
      assert.equal((await apps.entry(person, clientId)).admitted, true);
    } finally { await close(); }
  });
