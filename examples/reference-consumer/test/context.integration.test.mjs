import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const personId = '76257b81-2222-4444-aaaa-638fa68c529c';
const orgId = '19d98b15-3333-4444-bbbb-7dad53c3fc97';
const listen = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};
const responseJson = (response, body, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

test('peer selection checks live membership while resource access still needs its own grant', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  let upstreamOrigin, nonce, membership = true, available = true;
  const upstream = createServer(async (request, response) => {
    const path = new URL(request.url, upstreamOrigin).pathname;
    const issuer = `${upstreamOrigin}/realms/accesslobby-first-party`;
    if (path.endsWith('/.well-known/openid-configuration')) return responseJson(response, {
      issuer,
      authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
      token_endpoint: `${issuer}/protocol/openid-connect/token`,
      jwks_uri: `${issuer}/protocol/openid-connect/certs`,
      end_session_endpoint: `${issuer}/protocol/openid-connect/logout`,
    });
    if (path.endsWith('/protocol/openid-connect/certs')) return responseJson(response, { keys: [jwk] });
    if (path.endsWith('/protocol/openid-connect/token')) {
      const id_token = await new SignJWT({ nonce, sid: 'test-session' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer).setAudience('reference-consumer').setSubject('issuer-subject').setIssuedAt().setExpirationTime('10m').sign(privateKey);
      const access_token = await new SignJWT({ azp: 'reference-consumer' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer).setAudience('accesslobby-api').setSubject('issuer-subject').setIssuedAt().setExpirationTime('10m').sign(privateKey);
      return responseJson(response, { id_token, access_token, expires_in: 600 });
    }
    if (path === '/v1/me') return responseJson(response, { contract: 'accesslobby.identity.v0.1', person: { id: personId, status: 'active' } });
    if (path === '/v1/my-organizations') return available
      ? responseJson(response, { contract: 'accesslobby.memberships.v0.1', person: { id: personId },
        organizations: membership ? [{ id: orgId, name: '<Example team>', role: 'member' }] : [] })
      : responseJson(response, { error: 'unavailable' }, 503);
    return responseJson(response, {}, 404);
  });
  upstreamOrigin = `http://127.0.0.1:${await listen(upstream)}`;
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, PORT: String(port), CONSUMER_ORIGIN: origin,
      OIDC_ISSUER: `${upstreamOrigin}/realms/accesslobby-first-party`, OIDC_CLIENT_ID: 'reference-consumer',
      ACCESSLOBBY_API_URL: upstreamOrigin, GRANTED_PERSON_IDS: personId },
    stdio: 'ignore',
  });
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      try { if ((await fetch(`${origin}/health/live`)).ok) break; }
      catch { if (child.exitCode !== null) throw new Error('Consumer exited'); await delay(50); }
    }
    const login = await fetch(`${origin}/login`, { redirect: 'manual' });
    assert.equal(login.status, 303);
    const authorization = new URL(login.headers.get('location'));
    nonce = authorization.searchParams.get('nonce');
    const flowCookie = login.headers.getSetCookie()[0].split(';')[0];
    const callback = await fetch(`${origin}/callback?state=${authorization.searchParams.get('state')}&code=mock-code`, {
      headers: { cookie: flowCookie }, redirect: 'manual',
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), '/account-choice');
    const pendingCookie = callback.headers.getSetCookie().find(value => value.startsWith('ref-pending=')).split(';')[0];
    const join = await fetch(`${origin}/join`, { method: 'POST', redirect: 'manual',
      headers: { cookie: pendingCookie, origin } });
    assert.equal(join.status, 303);
    const sessionCookie = join.headers.getSetCookie().find(value => value.startsWith('ref-session=')).split(';')[0];
    const get = path => fetch(`${origin}${path}`, { headers: { cookie: sessionCookie } });
    const choose = value => fetch(`${origin}/context`, { method: 'POST', redirect: 'manual',
      headers: { cookie: sessionCookie, origin, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ organizationId: value }) });

    const home = await (await get('/')).text();
    assert.match(home, /&lt;Example team&gt;/);
    assert.doesNotMatch(home, /<Example team>/);
    assert.equal((await choose('00000000-0000-0000-0000-000000000000')).status, 403);
    assert.equal((await choose(orgId)).status, 303);
    assert.equal((await get('/private')).status, 200);
    membership = false;
    assert.equal((await get('/private')).status, 403);
    available = false;
    assert.equal((await get('/private')).status, 503);
    assert.match(await (await get('/')).text(), /For yourself/);
    assert.equal((await choose('personal')).status, 303);
    assert.equal((await get('/private')).status, 200); // Local grant remains independent.
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await new Promise(resolve => upstream.close(resolve));
  }
});
