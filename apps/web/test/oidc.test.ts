import assert from 'node:assert/strict';
import test from 'node:test';
import { origin } from '../lib/oidc';

test('web session origin rejects public HTTP and non-origin URLs', () => {
  const previous = process.env.WEB_BASE_URL;
  try {
    process.env.WEB_BASE_URL = 'http://login.example.com';
    assert.throws(origin, /requires HTTPS/);
    process.env.WEB_BASE_URL = 'https://login.example.com/extra';
    assert.throws(origin, /plain origin/);
    process.env.WEB_BASE_URL = 'https://login.example.com';
    assert.equal(origin(), 'https://login.example.com');
    process.env.WEB_BASE_URL = 'http://localhost:3000';
    assert.equal(origin(), 'http://localhost:3000');
  } finally {
    if (previous === undefined) delete process.env.WEB_BASE_URL;
    else process.env.WEB_BASE_URL = previous;
  }
});
