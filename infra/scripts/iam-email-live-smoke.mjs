/** Disposable CI IAM only; fixtures mutate, the diagnostic itself only GETs. No mail is sent. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diagnoseIamEmail } from './iam-email-diagnostics.mjs';
import { withScopedClientToken } from './private-client-token.mjs';

const token = process.env.IAM_SMOKE_TOKEN;
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || !token) throw new Error('Disposable CI IAM required');
const base = 'http://127.0.0.1:8080';
const issuer = 'http://localhost:8080/realms/accesslobby-first-party';
const realm = `${base}/admin/realms/accesslobby-first-party`;
const username = `al-qual-email-${randomUUID()}`;
let id;
const admin = async (path, init = {}) => {
  const response = await fetch(realm + path, { ...init, headers: { authorization: `Bearer ${token}`,
    ...(init.body ? { 'content-type': 'application/json' } : {}) }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  assert.ok(response.ok, 'Disposable email fixture operation failed');
  return response;
};
try {
  const before = await (await admin('')).json();
  const created = await admin('/users', { method: 'POST', body: JSON.stringify({ username,
    email: `${username}@example.test`, enabled: true, emailVerified: false, requiredActions: ['VERIFY_EMAIL'] }) });
  id = created.headers.get('location')?.split('/').at(-1);
  assert.ok(id && /^[a-f0-9-]{36}$/i.test(id));
  let reads = 0;
  const report = await diagnoseIamEmail({ base, username, token, fetcher: async (url, init) => {
    assert.equal(init.method, 'GET'); reads++; return fetch(url, init);
  } });
  assert.equal(reads, 3); assert.equal(report.assessed, true);
  assert.equal(report.testUser.emailVerified, false);
  assert.equal(report.testUser.verificationActionAssigned, true);
  assert.ok(report.blockers.includes('test_user_email_unverified'));
  assert.equal(report.deliveryTestPerformed, false);
  assert.ok(!JSON.stringify(report).includes(token));
  const childEnv = { ...process.env }; delete childEnv.IAM_SMOKE_TOKEN;
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./iam-email-diagnostics.mjs', import.meta.url)),
    '--base', base, '--username', username], { input: token + '\n', encoding: 'utf8', env: childEnv,
    timeout: 20000, maxBuffer: 65536 });
  assert.equal(cli.status, 1, 'CLI must report incomplete verification with exit1');
  assert.equal(JSON.parse(cli.stdout).assessed, true);
  assert.ok(!cli.stdout.includes(token) && !cli.stderr.includes(token), 'CLI must not expose the operator token');
  const user = await (await admin(`/users/${id}`)).json();
  assert.equal(user.emailVerified, false);
  assert.ok(user.requiredActions.includes('VERIFY_EMAIL'));
  const after = await (await admin('')).json();
  assert.ok(JSON.stringify(before.smtpServer) === JSON.stringify(after.smtpServer), 'Diagnostic changed SMTP');
  assert.equal(before.verifyEmail, after.verifyEmail);
  await withScopedClientToken({ base, issuer, adminToken: token }, async scoped => {
    const denied = await diagnoseIamEmail({ base, username, token: scoped });
    assert.equal(denied.assessed, false);
    assert.ok(denied.errors.some(error => error.status === 403));
    assert.ok(!JSON.stringify(denied).includes(scoped));
  });
  console.info('IAM_EMAIL_METADATA_PASS: real readback, unverified refusal, no mutation/mail, client-only scope denied');
} finally {
  if (id) await admin(`/users/${id}`, { method: 'DELETE' });
}
