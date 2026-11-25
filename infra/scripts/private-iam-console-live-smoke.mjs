#!/usr/bin/env node
// Disposable real-Keycloak proof. No existing IAM, realm, SMTP or host route is used.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, chmod, chown, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { chromium } from 'playwright';
import { createConnectProxy } from '../private-iam/connect-proxy.mjs';
import { loopbackHttpsGet } from '../private-iam/loopback-https.mjs';
import { errorCategory, logCategories, startupFailureEvidence } from '../private-iam/diagnostics.mjs';

const execute = promisify(execFile);
const repository = resolve(new URL('../..', import.meta.url).pathname);
const token = randomBytes(6).toString('hex');
const project = `al-private-${token}`;
const names = { db: `${project}-db`, iam: `${project}-iam`, public: `${project}-public` };
const networks = { backend: `${project}-backend`, edge: `${project}-iam-edge`, public: `${project}-public-edge` };
const canonicalHost = 'iam.private-fixture.test';
const canonicalOrigin = `https://${canonicalHost}:8443`;
const issuer = `${canonicalOrigin}/realms/accesslobby-first-party`;
const reportPath = resolve('artifacts/private-iam-console/report.json');
const report = { contract: 'accesslobby.private-iam-native.v1', disposable: true, stagingQualified: false,
  productionQualified: false, startedAt: new Date().toISOString(), checks: {}, passed: false };
const iamImage = process.env.IAM_IMAGE || 'accesslobby-iam:ci';
const gatewayImage = process.env.GATEWAY_IMAGE || 'accesslobby-iam-gateway:ci';
let phase = 'prerequisites';
let work, browser, helper, publicPort;
const createdContainers = [];
const createdNetworks = [];
const composeFiles = [];
const ownedServices = new Map();
const dbPassword = randomBytes(24).toString('hex');
const adminPassword = randomBytes(24).toString('hex');
const childEnv = { ...process.env, POSTGRES_PASSWORD: dbPassword, KC_DB_PASSWORD: dbPassword,
  KC_BOOTSTRAP_ADMIN_PASSWORD: adminPassword };

async function command(program, args, options = {}) {
  try {
    const { stdout } = await execute(program, args, { cwd: repository, env: childEnv,
      timeout: 120000, maxBuffer: 1024 * 1024, ...options });
    return stdout.trim();
  } catch (error) {
    const failure = new Error('command_failed');
    failure.category = error.killed ? 'command_timeout' : typeof error.code === 'number' ? 'command_exit_nonzero' : 'command_unavailable';
    throw failure; // Never echo arguments, stderr or auth URLs.
  }
}
async function docker(args, options) { return command('docker', args, options); }
async function privileged(program, args) {
  return process.getuid?.() === 0 ? command(program, args) : command('sudo', ['-n', program, ...args]);
}
async function availablePort() {
  const server = net.createServer();
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const port = server.address().port;
  await new Promise(resolveClose => server.close(resolveClose));
  return port;
}
async function addContainer(name, args, beforeStart) {
  const id = await docker(['create', '--name', name, '--label', `accesslobby.private-fixture=${token}`, ...args]);
  assert.match(id, /^[a-f0-9]{64}$/);
  createdContainers.push(id);
  ownedServices.set(name === names.db ? 'database' : name === names.iam ? 'iam' : 'public_gateway', id);
  assert.equal(await docker(['inspect', '--format', '{{index .Config.Labels "accesslobby.private-fixture"}}', id]), token);
  if (beforeStart) await beforeStart(id);
  await docker(['start', id]);
}
async function createNetwork(name, { internal = false, edge = false } = {}) {
  const args = ['network', 'create', '--driver', 'bridge', '--label', `accesslobby.private-fixture=${token}`];
  if (internal) args.push('--internal');
  if (edge) args.push('--label', 'com.docker.compose.network=iam-edge', '--label', `com.docker.compose.project=${project}`);
  const id = await docker([...args, name]);
  assert.match(id, /^[a-f0-9]{64}$/);
  createdNetworks.push(id);
}
async function publicGet(path) {
  const result = await loopbackHttpsGet({ canonicalOrigin, tunnelPort: publicPort,
    ca: await readFile(join(work, 'ca.crt')), path, collectBody: true });
  assert.equal(result.authorized, true);
  return result;
}
async function containerState(id) {
  const value = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', id], { timeout: 10000 }));
  return { running: value.Running === true, status: ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'].includes(value.Status) ? value.Status : 'unknown',
    exitCode: Number.isInteger(value.ExitCode) ? value.ExitCode : null, oomKilled: value.OOMKilled === true };
}
async function collectFailureDiagnostics() {
  const result = {};
  for (const [service, id] of ownedServices) {
    try {
      const state = await containerState(id);
      let text = '';
      try {
        const logs = await execute('docker', ['logs', '--tail', '80', id], { cwd: repository, env: childEnv, timeout: 10000, maxBuffer: 262144 });
        text = logs.stdout + logs.stderr;
      } catch {} // No raw logs or exception strings ever leave this function.
      result[service] = { ...state, logCategories: logCategories(text), startupFailure: startupFailureEvidence(text) };
    } catch { result[service] = { inspectUnavailable: true }; }
  }
  return result;
}
async function publicBoundary(label) {
  report.publicBoundaries ||= {};
  const observations = report.publicBoundaries[label] = {};
  const discovery = await publicGet('/realms/accesslobby-first-party/.well-known/openid-configuration');
  observations.discoveryStatus = discovery.status;
  assert.equal(discovery.status, 200);
  const metadata = JSON.parse(discovery.body);
  assert.equal(metadata.issuer, issuer);
  observations.exactIssuer = true;
  for (const key of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'end_session_endpoint']) {
    const url = new URL(metadata[key]);
    assert.equal(url.origin, canonicalOrigin);
    assert.ok(url.pathname.startsWith('/realms/accesslobby-first-party/'));
  }
  const keys = await publicGet(new URL(metadata.jwks_uri).pathname);
  observations.jwksStatus = keys.status;
  assert.equal(keys.status, 200);
  assert.ok(JSON.parse(keys.body).keys.length > 0);
  for (const [name, path] of Object.entries({ adminRoot: '/admin/', adminConsole: '/admin/master/console/', masterDiscovery: '/realms/master/.well-known/openid-configuration', health: '/health', metrics: '/metrics' })) {
    const result = await publicGet(path);
    observations[name] = result.status;
    assert.equal(result.status, 404);
  }
  report.checks[label] = true;
}
async function privateGet(port, path, headers = {}) {
  const ca = await readFile(join(work, 'ca.crt'));
  return loopbackHttpsGet({ canonicalOrigin, tunnelPort: port, ca, path, hostOverride: headers.Host });
}
async function renderAndStart(keyFile, label, port, rootMode = false) {
  phase = `${label}_render`;
  const output = join(work, `package-${label}`);
  const image = await docker(['image', 'inspect', gatewayImage, '--format', '{{.Id}}']);
  const args = [join(repository, 'infra/private-iam/render.py'), '--canonical-origin', canonicalOrigin,
    '--network', networks.edge, '--proxy-image', image, '--certificate', join(work, 'tls.crt'),
    '--private-key', keyFile, '--ca-file', join(work, 'ca.crt'), '--port', String(port), '--output-directory', output];
  if (rootMode) await privileged('python3', args); else await command('python3', args);
  const compose = join(output, 'compose.json');
  const composeProject = `${project}-${label}`;
  assert.equal(await docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${composeProject}`]), '');
  composeFiles.push({ compose, composeProject, rootMode });
  const composeCommand = ['compose', '-p', composeProject, '-f', compose];
  phase = `${label}_config_test`;
  if (rootMode) await privileged('docker', [...composeCommand, 'run', '--rm', '--no-deps', 'iam-admin-private', '-t']);
  else await docker([...composeCommand, 'run', '--rm', '--no-deps', 'iam-admin-private', '-t']);
  phase = `${label}_start`;
  if (rootMode) await privileged('docker', [...composeCommand, 'up', '-d', '--no-build']);
  else await docker([...composeCommand, 'up', '-d', '--no-build']);
  const id = rootMode ? await privileged('docker', [...composeCommand, 'ps', '-q', 'iam-admin-private']) : await docker([...composeCommand, 'ps', '-q', 'iam-admin-private']);
  assert.match(id, /^[a-f0-9]{12,64}$/);
  ownedServices.set(`private_${label}`, id);
  phase = `${label}_isolation`;
  const inspected = JSON.parse(await docker(['inspect', id]))[0];
  const binding = inspected.HostConfig.PortBindings['8443/tcp'];
  assert.deepEqual(binding, [{ HostIp: '127.0.0.1', HostPort: String(port) }]);
  assert.deepEqual(Object.keys(inspected.NetworkSettings.Networks), [networks.edge]);
  assert.equal(inspected.HostConfig.ReadonlyRootfs, true);
  assert.ok(inspected.HostConfig.CapDrop.includes('ALL'));
  assert.deepEqual((inspected.HostConfig.CapAdd || []).sort(), rootMode ? ['SETGID', 'SETUID'] : []);
  assert.ok(inspected.Mounts.filter(m => m.Type === 'bind').every(m => m.RW === false));
  phase = `${label}_trusted_tls`;
  for (let i = 0; i < 30; i++) {
    try { if ((await privateGet(port, '/realms/master/.well-known/openid-configuration')).status === 200) break; } catch {}
    if (i === 29) throw new Error('private_proxy_not_ready');
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
  }
  const trusted = await privateGet(port, '/realms/master/.well-known/openid-configuration');
  assert.equal(trusted.status, 200);
  assert.equal(trusted.authorized, true);
  assert.equal((await privateGet(port, '/metrics')).status, 404);
  assert.equal((await privateGet(port, '/admin/master/console/', { Host: 'other.example.test:8443' })).status, 421);
  if (rootMode) {
    const processes = await docker(['top', id, '-eo', 'uid,args']);
    assert.match(processes, /(?:^|\n)\s*0\s+nginx: master process/);
    assert.match(processes, /(?:^|\n)\s*101\s+nginx: worker process/);
  }
  report.checks[`${label}ImageConfigAndTrustedTls`] = true;
  return id;
}

try {
  for (const [program, args] of [['docker', ['version']], ['openssl', ['version']], ['certutil', ['-H']]]) {
    // certutil -H writes help to stderr and can return nonzero; inspect availability instead.
    if (program === 'certutil') await command('sh', ['-c', 'command -v certutil']);
    else await command(program, args);
  }
  await docker(['image', 'inspect', iamImage]);
  await docker(['image', 'inspect', gatewayImage]);
  assert.equal(await docker(['run', '--rm', '--network', 'none', '--entrypoint', 'id', gatewayImage, '-u', 'nginx']), '101');
  assert.equal(await docker(['run', '--rm', '--network', 'none', '--entrypoint', 'id', gatewayImage, '-g', 'nginx']), '101');
  report.source = await command('git', ['rev-parse', 'HEAD']);
  report.dirtyWorktree = Boolean(await command('git', ['status', '--porcelain']));
  work = await mkdtemp(join(tmpdir(), `${project}-`));
  await chmod(work, 0o755); // Only public fixture cert/realm files need traversal; keys stay0600.
  phase = 'fixture_certificates';
  await command('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', join(work, 'ca.key'), '-out', join(work, 'ca.crt'), '-subj', '/CN=AccessLobby Private Fixture CA', '-addext', 'basicConstraints=critical,CA:TRUE']);
  await command('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(work, 'tls.key'), '-out', join(work, 'tls.csr'), '-subj', `/CN=${canonicalHost}`]);
  await writeFile(join(work, 'extensions'), `subjectAltName=DNS:${canonicalHost}\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
  await command('openssl', ['x509', '-req', '-in', join(work, 'tls.csr'), '-CA', join(work, 'ca.crt'), '-CAkey', join(work, 'ca.key'), '-CAcreateserial', '-days', '2', '-out', join(work, 'tls.crt'), '-extfile', join(work, 'extensions')]);
  await chmod(join(work, 'ca.key'), 0o600);
  await chmod(join(work, 'tls.key'), 0o600);
  await chmod(join(work, 'ca.crt'), 0o644);
  await chmod(join(work, 'tls.crt'), 0o644);
  const nonrootUid = process.getuid?.() || 65532;
  const nonrootGid = process.getgid?.() || 65532;
  if (process.getuid?.() === 0) await chown(join(work, 'tls.key'), nonrootUid, nonrootGid);
  const fixtureRealm = { realm: 'accesslobby-first-party', enabled: true,
    sslRequired: 'external', registrationAllowed: false, verifyEmail: false, resetPasswordAllowed: false,
    clients: [], smtpServer: {} };
  // Keycloak26.7.4 DirImportProvider derives the realm from this exact basename
  // and throws on a mismatch with JSON.realm; this is a startup requirement.
  const realmFilename = `${fixtureRealm.realm}-realm.json`;
  assert.equal(realmFilename, 'accesslobby-first-party-realm.json');
  await writeFile(join(work, realmFilename), JSON.stringify(fixtureRealm), { mode: 0o644 });
  report.checks.importFilenameMatchesRealm = true;
  phase = 'fixture_networks';
  await createNetwork(networks.backend, { internal: true });
  await createNetwork(networks.edge, { internal: true, edge: true });
  await createNetwork(networks.public);
  phase = 'database_create_start';
  await addContainer(names.db, ['--memory', '512m', '--network', networks.backend, '--network-alias', 'private-db',
    '-e', 'POSTGRES_DB=private_iam', '-e', 'POSTGRES_USER=private_iam', '-e', 'POSTGRES_PASSWORD', 'postgres:17.11']);
  phase = 'database_readiness';
  for (let i = 0; i < 60; i++) {
    try { await docker(['exec', names.db, 'pg_isready', '-U', 'private_iam', '-d', 'private_iam']); break; } catch {}
    if (i === 59) throw new Error('postgres_not_ready');
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  report.checks.fixtureDatabaseReady = true;
  phase = 'iam_create_start';
  await addContainer(names.iam, ['--memory', '1536m', '--network', networks.backend, '-e', 'KC_DB=postgres',
    '-e', 'KC_DB_URL=jdbc:postgresql://private-db:5432/private_iam', '-e', 'KC_DB_USERNAME=private_iam', '-e', 'KC_DB_PASSWORD',
    '-e', `KC_HOSTNAME=${canonicalOrigin}`, '-e', 'KC_HTTP_ENABLED=true', '-e', 'KC_PROXY_HEADERS=xforwarded',
    '-e', 'KC_BOOTSTRAP_ADMIN_USERNAME=private-fixture-admin', '-e', 'KC_BOOTSTRAP_ADMIN_PASSWORD',
    '--mount', `type=bind,src=${join(work, realmFilename)},dst=/opt/keycloak/data/import/${realmFilename},readonly`,
    iamImage, 'start', '--import-realm'], id => docker(['network', 'connect', '--alias', 'iam', networks.edge, id]));
  // Fixture public TLS terminator retains the source gateway's exact allowlist.
  const publicSource = await readFile(join(repository, 'infra/iam-gateway/default.conf'), 'utf8');
  assert.equal((publicSource.match(/listen 8080;/g) || []).length, 1);
  const publicConfig = publicSource.replace('listen 8080;', 'listen 8443 ssl;\n    ssl_certificate /fixture/tls.crt;\n    ssl_certificate_key /fixture/tls.key;\n    ssl_protocols TLSv1.2 TLSv1.3;')
    .replaceAll('X-Forwarded-Port 443;', 'X-Forwarded-Port 8443;');
  await writeFile(join(work, 'public.conf'), publicConfig, { mode: 0o644 });
  phase = 'public_gateway_create_start';
  publicPort = await availablePort();
  await addContainer(names.public, ['--network', networks.edge, '--publish', `127.0.0.1:${publicPort}:8443`,
    '--mount', `type=bind,src=${join(work, 'public.conf')},dst=/etc/nginx/conf.d/default.conf,readonly`,
    '--mount', `type=bind,src=${join(work, 'tls.crt')},dst=/fixture/tls.crt,readonly`,
    '--mount', `type=bind,src=${join(work, 'tls.key')},dst=/fixture/tls.key,readonly`, gatewayImage],
    id => docker(['network', 'connect', '--alias', canonicalHost, networks.public, id]));
  const publicBinding = JSON.parse(await docker(['inspect', '--format', '{{json .HostConfig.PortBindings}}', names.public]));
  assert.deepEqual(publicBinding['8443/tcp'], [{ HostIp: '127.0.0.1', HostPort: String(publicPort) }]);
  report.checks.distinctPublicGatewayLoopbackBinding = true;
  phase = 'public_issuer_readiness';
  const readinessDeadline = Date.now() + 90000;
  for (let i = 0; ; i++) {
    try {
      const result = await publicGet('/realms/accesslobby-first-party/.well-known/openid-configuration');
      report.lastPublicProbe = { attempt: i + 1, status: result.status, trustedTls: result.authorized };
      if (result.status === 200) break;
    } catch (error) { report.lastPublicProbe = { attempt: i + 1, category: errorCategory(error) }; }
    if (Date.now() >= readinessDeadline) throw new Error('iam_not_ready');
    if (i % 4 === 0) {
      for (const service of ['iam', 'public_gateway']) {
        const state = await containerState(ownedServices.get(service));
        if (!state.running || state.oomKilled) throw new Error('fixture_service_exited');
      }
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 750));
  }
  phase = 'public_before';
  await publicBoundary('publicBefore');
  phase = 'nonroot_private_proxy';
  const nonrootPort = await availablePort();
  await renderAndStart(join(work, 'tls.key'), 'nonroot', nonrootPort, false);
  phase = 'root_private_proxy';
  const rootKey = join(work, 'root-tls.key');
  await privileged('install', ['-m', '600', '-o', '0', '-g', '0', join(work, 'tls.key'), rootKey]);
  const rootPort = await availablePort();
  await renderAndStart(rootKey, 'root', rootPort, true);
  phase = 'trusted_browser';
  const browserHome = join(work, 'browser-home');
  const nss = join(browserHome, '.pki/nssdb');
  await mkdir(browserHome, { mode: 0o700 });
  await mkdir(nss, { recursive: true });
  await command('certutil', ['-N', '--empty-password', '-d', `sql:${nss}`]);
  await command('certutil', ['-A', '-d', `sql:${nss}`, '-t', 'C,,', '-n', 'accesslobby-private-fixture', '-i', join(work, 'ca.crt')]);
  helper = await createConnectProxy({ canonicalOrigin, tunnelPort: rootPort });
  browser = await chromium.launch({ headless: true, env: { ...process.env, HOME: browserHome },
    proxy: { server: `http://127.0.0.1:${helper.port}` } });
  const context = await browser.newContext({ locale: 'en-US' });
  const page = await context.newPage();
  const observations = { masterAuthentication: false, consoleAsset: false, foreignOrigin: false, tlsFailure: false };
  page.on('request', req => {
    const url = new URL(req.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== canonicalOrigin) observations.foreignOrigin = true;
    if (url.pathname === '/realms/master/protocol/openid-connect/auth') observations.masterAuthentication = true;
  });
  page.on('requestfailed', req => { if (/CERT|SSL|TLS/.test(req.failure()?.errorText || '')) observations.tlsFailure = true; });
  page.on('response', res => { const url = new URL(res.url()); if (res.status() === 200 && url.origin === canonicalOrigin && url.pathname.startsWith('/resources/') && /\.(?:js|css)$/.test(url.pathname)) observations.consoleAsset = true; });
  await page.goto(`${canonicalOrigin}/admin/master/console/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#username').waitFor({ state: 'visible', timeout: 60000 });
  await page.locator('#username').fill('private-fixture-admin');
  await page.locator('#password').fill(adminPassword);
  await page.locator('#kc-login').click();
  phase = 'realm_controls';
  const manageRealms = page.getByRole('link', { name: 'Manage realms', exact: true });
  await manageRealms.waitFor({ state: 'visible', timeout: 60000 });
  await manageRealms.click();
  await page.getByRole('button', { name: 'Create realm', exact: true }).or(page.getByRole('link', { name: 'Create realm', exact: true })).first().waitFor({ state: 'visible', timeout: 30000 });
  report.checks.authenticatedMasterConsole = true;
  report.checks.realmCreationControlVisible = true;
  report.checks.realmCreated = false;
  phase = 'client_controls';
  await page.getByRole('link', { name: 'accesslobby-first-party', exact: true }).first().click();
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'Create client', exact: true }).or(page.getByRole('link', { name: 'Create client', exact: true })).first().waitFor({ state: 'visible', timeout: 30000 });
  report.checks.clientCreationControlVisible = true;
  report.checks.clientCreated = false;
  assert.equal(observations.masterAuthentication, true);
  assert.equal(observations.consoleAsset, true);
  assert.equal(observations.foreignOrigin, false);
  assert.equal(observations.tlsFailure, false);
  // A fresh authenticated page response must expose a genuinely verified TLS channel.
  const response = await page.reload({ waitUntil: 'domcontentloaded' });
  const security = await response.securityDetails();
  assert.equal(security.subjectName, canonicalHost);
  assert.equal(security.issuer, 'AccessLobby Private Fixture CA');
  assert.match(security.protocol, /^TLS 1\.[23]$/);
  report.checks.browserTlsValidated = true;
  report.checks.canonicalMasterAuthAndAssets = true;
  phase = 'console_logout';
  const userMenu = page.getByRole('button', { name: /private-fixture-admin|user menu|user dropdown/i }).first();
  await userMenu.click();
  await page.getByRole('menuitem', { name: /sign out/i }).or(page.getByRole('link', { name: /sign out/i })).or(page.getByRole('button', { name: /^sign out$/i })).first().click();
  await page.locator('#username').waitFor({ state: 'visible', timeout: 30000 });
  await page.goto(`${canonicalOrigin}/admin/master/console/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#username').waitFor({ state: 'visible', timeout: 30000 });
  report.checks.consoleSignOut = true;
  report.browserVersion = browser.version();
  phase = 'public_after';
  await publicBoundary('publicAfter');
  report.passed = true;
} catch (error) {
  report.failure = { phase, category: errorCategory(error) };
  report.servicesAtFailure = await collectFailureDiagnostics();
  process.exitCode = 1;
} finally {
  phase = 'cleanup';
  if (browser) await browser.close().catch(() => {});
  if (helper) await helper.close().catch(() => {});
  let cleaned = true;
  for (const { compose, composeProject, rootMode } of composeFiles.reverse()) {
    try {
      const args = ['compose', '-p', composeProject, '-f', compose, 'down', '--remove-orphans'];
      if (rootMode) await privileged('docker', args); else await docker(args);
    } catch { cleaned = false; }
  }
  for (const id of createdContainers.reverse()) {
    try {
      assert.equal(await docker(['inspect', '--format', '{{index .Config.Labels "accesslobby.private-fixture"}}', id]), token);
      await docker(['rm', '-f', '-v', id]);
    } catch { cleaned = false; }
  }
  for (const id of createdNetworks.reverse()) {
    try {
      const inspected = JSON.parse(await docker(['network', 'inspect', id]))[0];
      assert.equal(inspected.Labels['accesslobby.private-fixture'], token);
      await docker(['network', 'rm', id]);
    } catch { cleaned = false; }
  }
  if (work) {
    try { await privileged('rm', ['-rf', '--', work]); } catch { cleaned = false; }
  }
  report.checks.ownedResourcesCleaned = cleaned;
  if (!cleaned) { report.passed = false; process.exitCode = 1; }
  report.completedAt = new Date().toISOString();
  await mkdir(resolve('artifacts/private-iam-console'), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ contract: report.contract, passed: report.passed,
    ...(report.failure ? { failurePhase: report.failure.phase } : {}), ownedResourcesCleaned: cleaned }) + '\n');
}
