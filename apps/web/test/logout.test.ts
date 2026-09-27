import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from '../app/auth/logout/route';

test('local sign-out clears only web cookies; invalid or cross-origin requests do not sign out', async () => {
  const prior = process.env.WEB_BASE_URL;
  process.env.WEB_BASE_URL = 'http://localhost:3000';
  const form = (scope: string, origin = 'http://localhost:3000') => new NextRequest('http://localhost:3000/auth/logout', {
    method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ scope }).toString()
  });
  try {
    assert.equal((await POST(form('current', 'http://attacker.test'))).status, 403);
    assert.equal((await POST(form('bad'))).status, 400);
    const response = await POST(form('current'));
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), 'http://localhost:3000/');
    assert.match(response.headers.get('set-cookie') ?? '', /al-session=;/);
  } finally {
    if (prior === undefined) delete process.env.WEB_BASE_URL;
    else process.env.WEB_BASE_URL = prior;
  }
});

test('shared sign-out redirects to issuer only after explicit choice', async () => {
  const previous = { origin: process.env.WEB_BASE_URL, issuer: process.env.OIDC_ISSUER,
    client: process.env.OIDC_CLIENT_ID, fetch: globalThis.fetch };
  process.env.WEB_BASE_URL = 'http://localhost:3000';
  process.env.OIDC_ISSUER = 'https://iam.example.test/realms/accesslobby';
  process.env.OIDC_CLIENT_ID = 'accesslobby-web';
  globalThis.fetch = async () => new Response(JSON.stringify({
    issuer: process.env.OIDC_ISSUER,
    authorization_endpoint: 'https://iam.example.test/auth',
    token_endpoint: 'https://iam.example.test/token',
    jwks_uri: 'https://iam.example.test/jwks',
    end_session_endpoint: 'https://iam.example.test/logout'
  }), { status: 200 });
  try {
    const request = new NextRequest('http://localhost:3000/auth/logout', {
      method: 'POST', headers: { origin: 'http://localhost:3000', 'content-type': 'application/x-www-form-urlencoded' },
      body: 'scope=all'
    });
    const response = await POST(request);
    const destination = new URL(response.headers.get('location')!);
    assert.equal(response.status, 303);
    assert.equal(destination.origin, 'https://iam.example.test');
    assert.equal(destination.searchParams.get('client_id'), 'accesslobby-web');
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [['WEB_BASE_URL', previous.origin], ['OIDC_ISSUER', previous.issuer], ['OIDC_CLIENT_ID', previous.client]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
