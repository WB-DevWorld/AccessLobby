import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { generateKeyPair, SignJWT } from 'jose';
import { BACKCHANNEL_EVENT, verifyLogoutToken, removeSessions } from '../logout.mjs';

const issuer = 'https://iam.example.test/realms/accesslobby';
const client = 'reference-consumer';
const event = { [BACKCHANNEL_EVENT]: {} };

test('signed, scoped logout removes only the corresponding identity session', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const token = await new SignJWT({ events: event, sid: 's1', sub: 'user-1' })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(issuer).setAudience(client)
    .setIssuedAt().setExpirationTime('2m').setJti('event-1').sign(privateKey);
  const logout = await verifyLogoutToken(token, publicKey, issuer, client);
  const sessions = new Map([
    ['a', { sid: 's1', subject: 'user-1' }],
    ['b', { sid: 's2', subject: 'user-1' }],
    ['c', { sid: 's1', subject: 'user-2' }],
  ]);
  removeSessions(sessions, logout);
  assert.deepEqual([...sessions.keys()], ['b', 'c']);
  await assert.rejects(verifyLogoutToken(token, publicKey, issuer, 'another-client'));
  await assert.rejects(verifyLogoutToken(token, publicKey, 'https://other.example.test', client));
});

test('unsigned claims, nonce and missing session scope cannot clear sessions', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  for (const claims of [
    { events: event, sub: 'u', nonce: 'forbidden' },
    { events: event },
    { events: { 'wrong-event': {} }, sid: 's1' },
  ]) {
    const token = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256' })
      .setIssuer(issuer).setAudience(client).setIssuedAt().setJti('jti')
      .setExpirationTime('2m').sign(privateKey);
    await assert.rejects(verifyLogoutToken(token, publicKey, issuer, client));
  }
});
