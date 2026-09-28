import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const listen = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};

test('health separates process and dependency failure; logs correlate without callback data', async () => {
  let dependencyReady = true;
  let upstreamOrigin;
  const upstream = createServer((request, response) => {
    const path = new URL(request.url, upstreamOrigin).pathname;
    response.setHeader('content-type', 'application/json');
    if (path === '/realms/accesslobby-first-party/.well-known/openid-configuration') {
      const issuer = upstreamOrigin + '/realms/accesslobby-first-party';
      response.end(JSON.stringify({
        issuer, authorization_endpoint: issuer + '/protocol/openid-connect/auth',
        token_endpoint: issuer + '/protocol/openid-connect/token',
        jwks_uri: issuer + '/protocol/openid-connect/certs',
        end_session_endpoint: issuer + '/protocol/openid-connect/logout',
      }));
    } else if (path === '/health/ready') {
      response.statusCode = dependencyReady ? 200 : 503;
      response.end(JSON.stringify({ status: dependencyReady ? 'ready' : 'unavailable' }));
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  upstreamOrigin = `http://127.0.0.1:${await listen(upstream)}`;
  const reservation = createServer();
  const consumerPort = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const consumerOrigin = `http://127.0.0.1:${consumerPort}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env, PORT: String(consumerPort), CONSUMER_ORIGIN: consumerOrigin,
      OIDC_ISSUER: upstreamOrigin + '/realms/accesslobby-first-party',
      OIDC_CLIENT_ID: 'reference-consumer', ACCESSLOBBY_API_URL: upstreamOrigin,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });

  try {
    let live;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        live = await fetch(consumerOrigin + '/health/live', {
          headers: { 'x-request-id': 'probe_1', cookie: 'sensitive=do-not-log' },
        });
        break;
      } catch {
        if (child.exitCode !== null) throw new Error('Reference consumer exited before readiness');
        await delay(50);
      }
    }
    assert.ok(live, 'Reference consumer did not start');
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), { status: 'ok' });
    assert.equal(live.headers.get('x-request-id'), 'probe_1');

    const ready = await fetch(consumerOrigin + '/health/ready');
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { status: 'ready' });
    dependencyReady = false;
    const unavailable = await fetch(consumerOrigin + '/health/ready');
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
    assert.equal((await fetch(consumerOrigin + '/health/live')).status, 200);

    const invalidCallback = await fetch(consumerOrigin + '/callback?code=do-not-log&state=invalid', {
      headers: { 'x-request-id': 'callback_1' },
    });
    assert.equal(invalidCallback.status, 400);
    for (let attempt = 0; attempt < 20 && !logs.includes('"requestId":"callback_1"'); attempt++) {
      await delay(20);
    }
    assert.match(logs, /"requestId":"probe_1".*"route":"\/health\/live".*"status":200/);
    assert.match(logs, /"requestId":"callback_1".*"route":"\/callback".*"status":400/);
    assert.doesNotMatch(logs, /do-not-log|sensitive=/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    await new Promise(resolve => upstream.close(resolve));
  }
});
