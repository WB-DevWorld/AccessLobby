#!/usr/bin/env node
/** Private operator metadata only. GETs only; never sends mail or grants verification. */
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const REALM = 'accesslobby-first-party';
const MAX_BODY = 1024 * 1024;
const present = value => typeof value === 'string' && value.trim().length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validTarget(base, username) {
  try {
    const url = new URL(base);
    return url.protocol === 'http:' && ['iam', 'localhost', '127.0.0.1'].includes(url.hostname) &&
      url.port === '8080' && url.pathname === '/' && !url.username && !url.password &&
      !url.search && !url.hash && /^al-qual-[a-z0-9][a-z0-9-]{0,79}$/.test(username);
  } catch { return false; }
}

const failure = (code, extra = {}) => ({ contract: 'accesslobby.iam-email-metadata.v1',
  assessed: false, metadataChecksPassed: false, deliveryTestPerformed: false,
  freshOidcClaimTested: false, error: code, ...extra });

export function assessEmailMetadata({ realm, action, users }, username) {
  if (!object(realm) || realm.realm !== REALM || !object(action) || action.alias !== 'VERIFY_EMAIL' ||
      !Array.isArray(users) || (realm.smtpServer != null && !object(realm.smtpServer))) {
    return failure('invalid_metadata');
  }
  const smtp = realm.smtpServer ?? {};
  const user = users.length === 1 && object(users[0]) && users[0].username === username ? users[0] : null;
  const blockers = [];
  if (realm.enabled !== true) blockers.push('realm_disabled');
  if (!present(smtp.host) || !present(smtp.from)) blockers.push('smtp_configuration_incomplete');
  if (action.enabled !== true) blockers.push('verify_email_action_disabled');
  if (!user) blockers.push(users.length === 0 ? 'test_user_not_found' : 'test_user_not_unique_or_exact');
  else {
    if (user.enabled !== true) blockers.push('test_user_disabled');
    if (!present(user.email)) blockers.push('test_user_email_missing');
    if (user.emailVerified !== true) blockers.push('test_user_email_unverified');
  }
  // Deliberately construct every output field; no source object, ID, address or secret is returned.
  return { contract: 'accesslobby.iam-email-metadata.v1', assessed: true,
    metadataChecksPassed: blockers.length === 0, deliveryTestPerformed: false,
    freshOidcClaimTested: false, realmRequiresVerifiedEmail: realm.verifyEmail === true,
    accessTokenLifespanSeconds: Number.isSafeInteger(realm.accessTokenLifespan) && realm.accessTokenLifespan > 0
      ? realm.accessTokenLifespan : null,
    smtp: { hostConfigured: present(smtp.host), fromConfigured: present(smtp.from),
      authenticationEnabled: smtp.auth === 'true' || smtp.auth === true,
      sslEnabled: smtp.ssl === 'true' || smtp.ssl === true,
      startTlsEnabled: smtp.starttls === 'true' || smtp.starttls === true },
    verificationActionEnabled: action.enabled === true,
    verificationActionDefault: action.defaultAction === true,
    testUser: { found: Boolean(user), enabled: user ? user.enabled === true : null,
      emailPresent: user ? present(user.email) : null, emailVerified: user ? user.emailVerified === true : null,
      verificationActionAssigned: user ? Array.isArray(user.requiredActions) && user.requiredActions.includes('VERIFY_EMAIL') : null },
    blockers };
}

async function boundedJson(response) {
  let length = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > MAX_BODY) throw new Error('oversized');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function diagnoseIamEmail({ base = 'http://iam:8080', username, token, fetcher = fetch }) {
  if (!validTarget(base, username) || typeof token !== 'string' || token.length > 65536 ||
      !/^[A-Za-z0-9._~-]+$/.test(token)) return failure('invalid_input');
  const origin = new URL(base).origin;
  const query = new URLSearchParams({ username, exact: 'true' });
  const endpoints = [
    ['realm', `/admin/realms/${REALM}`],
    ['action', `/admin/realms/${REALM}/authentication/required-actions/VERIFY_EMAIL`],
    ['users', `/admin/realms/${REALM}/users?${query}`],
  ];
  const results = await Promise.allSettled(endpoints.map(async ([name, path]) => {
    const response = await fetcher(origin + path, { method: 'GET', redirect: 'manual',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      await response.body?.cancel();
      return { name, error: response.status >= 300 && response.status < 400 ? 'redirect_refused' : 'http_error',
        status: response.status };
    }
    return { name, data: await boundedJson(response) };
  }));
  const errors = [];
  const data = {};
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') errors.push({ endpoint: endpoints[i][0], error: 'unavailable_or_invalid_response' });
    else if (result.value.error) errors.push({ endpoint: result.value.name, error: result.value.error, status: result.value.status });
    else data[result.value.name] = result.value.data;
  }
  if (errors.length) return failure('metadata_unavailable', { errors });
  return assessEmailMetadata(data, username);
}

export async function main(argv = process.argv.slice(2), input = process.stdin, write = value => console.log(JSON.stringify(value))) {
  let options;
  try {
    options = parseArgs({ args: argv, allowPositionals: false, strict: true,
      options: { base: { type: 'string', default: 'http://iam:8080' }, username: { type: 'string' }, help: { type: 'boolean' } } }).values;
  } catch { write(failure('invalid_options')); return 2; }
  if (options.help) {
    write({ usage: 'Private operator token on stdin | node iam-email-diagnostics.mjs --base http://iam:8080 --username al-qual-name',
      scope: 'GET-only metadata; no mail, mutation, raw configuration or delivery claim' });
    return 0;
  }
  if (!validTarget(options.base, options.username)) { write(failure('invalid_input')); return 2; }
  if (input.isTTY) { write(failure('private_token_pipe_required')); return 2; }
  let token;
  try {
    let length = 0;
    const chunks = [];
    for await (const chunk of input) {
      length += Buffer.byteLength(chunk);
      if (length > 65536) throw new Error('oversized');
      chunks.push(Buffer.from(chunk));
    }
    token = Buffer.concat(chunks).toString('utf8').trim();
  } catch { write(failure('invalid_private_input')); return 2; }
  const report = await diagnoseIamEmail({ base: options.base, username: options.username, token });
  write(report);
  return !report.assessed ? 2 : report.metadataChecksPassed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = await main(); }
  catch { console.log(JSON.stringify(failure('diagnostic_unavailable'))); process.exitCode = 2; }
}
