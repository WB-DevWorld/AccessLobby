import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { logoutVerifier } from '../src/logout.js';

test('first-party backchannel accepts signed session event and rejects mismatched or malformed tokens', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No server');
    const issuer = 'https://iam.example.test/realms/accesslobby-first-party';
    const verify = logoutVerifier(issuer, `http://127.0.0.1:${address.port}/jwks`, 'accesslobby-web');
    const sign = (claims: Record<string, unknown>, audience = 'accesslobby-web') =>
      new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer).setAudience(audience).setIssuedAt().setJti('unique-event')
        .setExpirationTime('2m').sign(privateKey);
    const valid = { sid: 'browser-session-1', events: { 'http://schemas.openid.net/event/backchannel-logout': {} } };
    assert.deepEqual(await verify(await sign(valid)), { sid: 'browser-session-1', jti: 'unique-event' });
    await assert.rejects(verify(await sign(valid, 'other-client')));
    await assert.rejects(verify(await sign({ ...valid, nonce: 'invalid' })));
    await assert.rejects(verify(await sign({ events: valid.events })));
  } finally { server.close(); await once(server, 'close'); }
});
