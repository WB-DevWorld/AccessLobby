import assert from 'node:assert/strict';
import test from 'node:test';
import { GET } from '../app/auth/login/route';

test('switching people requests a fresh IAM challenge without logging out on a GET', async () => {
  const keys = ['WEB_BASE_URL', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'SESSION_SECRET'] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch;
  process.env.WEB_BASE_URL = 'http://localhost:3000';
  process.env.OIDC_ISSUER = 'https://iam.example.test/realms/accesslobby';
  process.env.OIDC_CLIENT_ID = 'accesslobby-web';
  process.env.SESSION_SECRET = Buffer.alloc(32, 3).toString('base64url');
  globalThis.fetch = async () => Response.json({
    issuer: process.env.OIDC_ISSUER,
    authorization_endpoint: 'https://iam.example.test/auth',
    token_endpoint: 'https://iam.example.test/token',
    jwks_uri: 'https://iam.example.test/jwks',
    end_session_endpoint: 'https://iam.example.test/logout',
  });
  try {
    const response = await GET(new Request('http://localhost:3000/auth/login?intent=switch'));
    const url = new URL(response.headers.get('location')!);
    assert.equal(url.searchParams.get('prompt'), 'login');
    assert.equal(url.searchParams.get('client_id'), 'accesslobby-web');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.match(response.headers.get('set-cookie') ?? '', /al-flow=/);
    assert.doesNotMatch(response.headers.get('set-cookie') ?? '', /al-session=;/);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
