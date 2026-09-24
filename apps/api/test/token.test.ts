import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { tokenVerifier } from '../src/auth.js';
import type { Config } from '../src/config.js';

test('cryptographic verification rejects wrong issuer, audience, expiry and signature', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local server');
    const settings: Config = { databaseUrl: '', issuer: 'https://issuer.example/realms/test',
      audience: 'accesslobby-api', allowedClients: ['pilot'], port: 0, version: 'test' };
    const verify = tokenVerifier(settings, `http://127.0.0.1:${address.port}/jwks`);
    const sign = (claims: { issuer?: string; audience?: string; expiry?: number; key?: typeof privateKey } = {}) =>
      new SignJWT({ azp: 'pilot' }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(claims.issuer ?? settings.issuer).setSubject('subject')
        .setAudience(claims.audience ?? settings.audience).setIssuedAt()
        .setExpirationTime(claims.expiry ?? '5m').sign(claims.key ?? privateKey);
    assert.equal((await verify(await sign())).subject, 'subject');
    for (const token of [await sign({ issuer: 'https://other.example' }),
      await sign({ audience: 'unrelated' }), await sign({ expiry: Math.floor(Date.now() / 1000) - 120 }),
      await sign({ key: other.privateKey }), 'malformed']) {
      await assert.rejects(verify(token));
    }
  } finally { server.close(); await once(server, 'close'); }
});
