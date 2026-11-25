#!/usr/bin/env node
/** Joined round-3 qualification: real isolated PostgreSQL, compiled Nest API,
 * production Next UI and browser, with synthetic signed OIDC and DNS fixtures.
 * No live IAM, estate, installed-device or production acceptance is inferred. */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apiDirectory = resolve(root, 'apps/api'), web = resolve(root, 'apps/web');
const requireApi = createRequire(resolve(apiDirectory, 'package.json'));
const { Pool } = requireApi('pg');
const { EncryptJWT, SignJWT, generateKeyPair, exportJWK } = await import(pathToFileURL(requireApi.resolve('jose')).href);
const { migrationFiles } = await import(pathToFileURL(resolve(apiDirectory, 'dist/migration-files.js')).href);
const { manageOperatorRole } = await import(pathToFileURL(resolve(apiDirectory, 'dist/manage-operator.js')).href);
const { ApplicationStore } = await import(pathToFileURL(resolve(apiDirectory, 'dist/applications.js')).href);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for isolated round-3 qualification');

const schema = 'alround3_' + randomBytes(8).toString('hex');
assert.match(schema, /^alround3_[a-f0-9]{16}$/);
const database = new URL(process.env.TEST_DATABASE_URL);
database.searchParams.set('options', '-c search_path=' + schema);
const adminDatabase = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
const pool = new Pool({ connectionString: database.href, max: 8 });
const artifacts = resolve(root, 'artifacts/operator-round3');
mkdirSync(artifacts, { recursive: true });
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirtyWorktree = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim().length > 0;
const actors = Object.fromEntries(['reader', 'reviewer', 'identityOperator', 'appOperator', 'owner', 'outsider', 'target', 'browserTarget'].map(name => [name, {
  id: randomUUID(), subject: 'private-round3-subject-' + name + '-' + randomUUID(), sid: 'private-round3-sid-' + randomUUID(),
}]));
const sealedKey = randomBytes(32), secrets = new Set();
for (const actor of Object.values(actors)) { secrets.add(actor.subject); secrets.add(actor.sid); }
const checks = [], children = [], contexts = [], browserErrors = [], usedPorts = new Set();
let browser, issuerServer, schemaCreated = false, issuer, apiOrigin, origin, mint;
let stage = 'setup';
const tokens = {};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listener = createServer();
    listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    if (!usedPorts.has(port)) { usedPorts.add(port); return port; }
  }
  throw new Error('No independent fixture port');
}
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-10000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-10000); });
  child.on('error', () => {});
  child.fixtureOutput = () => output;
  children.push(child); return child;
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 180; attempt++) {
    if (child.exitCode !== null || child.signalCode) throw new Error('Fixture process exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
    await delay(100);
  }
  throw new Error('Fixture readiness timed out');
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode) return;
  const stopped = once(child, 'exit').catch(() => {});
  child.kill('SIGTERM');
  let timer;
  await Promise.race([stopped, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000); })]);
  clearTimeout(timer);
}
async function check(name, work) {
  stage = name;
  try { await work(); checks.push({ name, result: 'PASS' }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, result: 'FAIL', error: error?.name ?? 'Error' }); throw error; }
}
async function api(path, token, status = 200, init = {}) {
  const response = await fetch(apiOrigin + path, {
    ...init,
    headers: { ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
    signal: AbortSignal.timeout(6000),
  });
  const statuses = Array.isArray(status) ? status : [status];
  assert(statuses.includes(response.status), 'Unexpected HTTP status ' + response.status + ' for ' + path + '; expected ' + statuses.join('/'));
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const value = await response.json();
  return value;
}
function post(body) { return { method: 'POST', body: JSON.stringify(body) }; }
function privateValuesAbsent(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of secrets) assert(!text.includes(secret), 'A private authentication value reached page or API output');
}
function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join('[private]');
  return text.replace(/eyJ[A-Za-z0-9_.-]+/g, '[token]');
}
async function contextFor(token) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  contexts.push(context);
  context.on('page', page => page.on('pageerror', error => browserErrors.push(error.name)));
  if (token) {
    const sealed = await new EncryptJWT({ accessToken: token }).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .setIssuedAt().setExpirationTime('15m').encrypt(sealedKey);
    secrets.add(sealed);
    await context.addCookies([{ name: 'al-session', value: sealed, url: origin, httpOnly: true, sameSite: 'Lax' }]);
  }
  return context;
}
async function currentToken(actor) {
  const result = await pool.query('SELECT session_not_before FROM persons WHERE id=$1', [actor.id]);
  const cutoff = Number(result.rows[0]?.session_not_before ?? 0);
  for (let attempt = 0; Math.floor(Date.now() / 1000) < cutoff; attempt++) {
    if (attempt >= 35) throw new Error('Fresh-token cutoff did not become current');
    await delay(100);
  }
  return mint(actor);
}
async function submitNative(page, buttonName, destination) {
  const button = page.getByRole('button', { name: buttonName, exact: true });
  const confirm = await button.getAttribute('data-confirm');
  const finished = page.waitForURL(destination, { timeout: 12000 });
  await button.click();
  if (confirm) {
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click();
  }
  await finished;
}
function editable(application, reference, changes = {}) {
  const names = ['name', 'platform', 'redirectUri', 'logoutUri', 'backchannelLogoutUri', 'visibility', 'admission'];
  const fields = Object.fromEntries(names.map(name => [name, application[name]]));
  return { ...fields, expectedConfigurationHash: application.configurationHash, reference, ...changes };
}
async function assertProtectedPage(page, path, heading) {
  const response = await page.goto(origin + path);
  assert.match(response.headers()['cache-control'] ?? '', /no-store/);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
  privateValuesAbsent(await page.content());
}
async function csrf(context, path, form) {
  const response = await context.request.post(origin + path, {
    headers: { origin: 'https://unrelated.example.test' }, form, maxRedirects: 0,
  });
  assert.equal(response.status(), 403);
  assert.match(response.headers()['cache-control'] ?? '', /no-store/);
}

try {
  await adminDatabase.query('CREATE SCHEMA ' + schema); schemaCreated = true;
  for (const migration of migrationFiles) await pool.query(readFileSync(resolve(apiDirectory, 'migrations', migration), 'utf8'));
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'round3-fixture', alg: 'RS256', use: 'sig' };
  issuerServer = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/realms/accesslobby-first-party/.well-known/openid-configuration') return res.end(JSON.stringify({
      issuer, jwks_uri: issuer + '/certs', authorization_endpoint: issuer + '/auth',
      token_endpoint: issuer + '/token', end_session_endpoint: issuer + '/logout',
    }));
    if (req.url === '/realms/accesslobby-first-party/certs') return res.end(JSON.stringify({ keys: [jwk] }));
    res.statusCode = 404; res.end(JSON.stringify({ error: 'synthetic_endpoint_only' }));
  });
  issuerServer.listen(0, '127.0.0.1'); await once(issuerServer, 'listening');
  issuer = 'http://127.0.0.1:' + issuerServer.address().port + '/realms/accesslobby-first-party';
  usedPorts.add(issuerServer.address().port);
  const apiPort = await freePort(), webPort = await freePort();
  apiOrigin = 'http://127.0.0.1:' + apiPort; origin = 'http://127.0.0.1:' + webPort;
  mint = async (actor, client = 'accesslobby-web', issuedAt = Math.floor(Date.now() / 1000)) => {
    const token = await new SignJWT({
      azp: client, sid: actor.sid,
      realm_access: { roles: ['admin', 'identity_operator', 'application_operator', 'application_reviewer'] },
    }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setSubject(actor.subject)
      .setAudience('accesslobby-api').setIssuedAt(issuedAt).setExpirationTime(Math.floor(Date.now() / 1000) + 900).sign(privateKey);
    secrets.add(token); return token;
  };
  for (const actor of Object.values(actors)) {
    await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [actor.id]);
    await pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3)', [issuer, actor.subject, actor.id]);
  }
  for (const [actor, role] of [['reader', 'support_reader'], ['reviewer', 'application_reviewer'],
    ['identityOperator', 'identity_operator'], ['appOperator', 'application_operator']]) {
    await manageOperatorRole(pool, actors[actor].id, 'grant', role, 'round3-fixture-' + actor);
  }
  const organizationId = randomUUID();
  await pool.query("INSERT INTO organizations(id,name,created_by) VALUES($1,'Round three qualification organization',$2)", [organizationId, actors.owner.id]);
  await pool.query("INSERT INTO organization_memberships(organization_id,person_id,role,status) VALUES($1,$2,'owner','active'),($1,$3,'member','active')", [organizationId, actors.owner.id, actors.target.id]);
  // Explicit synthetic directory fixture: enough stored members for two real API pages.
  for (let i=0;i<26;i++) {
    const id=randomUUID();
    await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')",[id]);
    await pool.query("INSERT INTO organization_memberships(organization_id,person_id,role,status) VALUES($1,$2,'member','active')",[organizationId,id]);
  }
  await pool.query("INSERT INTO organization_invitations(id,organization_id,invited_person_id,invited_by,role,status,expires_at) VALUES($1,$2,$3,$4,'member','pending',now()+interval '7days')",[randomUUID(),organizationId,actors.outsider.id,actors.owner.id]);
  await pool.query("INSERT INTO organization_events(organization_id,actor_person_id,target_person_id,action) VALUES($1,$2,$3,'invitation.created')",[organizationId,actors.owner.id,actors.outsider.id]);
  const dns = new Map();
  const applications = new ApplicationStore(pool, [], async host => dns.has(host) ? [[dns.get(host)]] : []);
  async function fixtureApp(name, suffix, active = false) {
    const hostname = suffix + '.round3.example.test';
    const requested = await applications.request(actors.owner.id, {
      clientId: 'round3-' + suffix + '-' + randomUUID(), name, platform: 'web',
      redirectUri: 'https://' + hostname + '/callback', logoutUri: 'https://' + hostname + '/',
      visibility: 'hidden', admission: 'grant_required',
    });
    dns.set(requested.originVerificationHost, requested.originVerificationValue);
    await applications.verifyOrigin(actors.owner.id, requested.id);
    if (active) {
      // Explicit synthetic legacy-active registry fixture; no IAM client or DNS claim.
      await pool.query("UPDATE applications SET status='active',trust_class='first_party',activated_at=now(),review_reference='round3-legacy-fixture' WHERE id=$1", [requested.id]);
    }
    return requested;
  }
  const activeApp = await fixtureApp('Existing active application', 'active', true);
  await applications.grant(actors.owner.id, activeApp.id, actors.target.id, undefined);
  const sessionApp = await fixtureApp('Session association application', 'session-app', true);
  await applications.grant(actors.owner.id, sessionApp.id, actors.target.id, undefined);
  await applications.grant(actors.owner.id, sessionApp.id, actors.browserTarget.id, undefined);
  const lifecycleApp = await fixtureApp('HTTP lifecycle fixture', 'http-lifecycle');
  const queueApp = await fixtureApp('HTTP activation queue fixture', 'http-activation');
  const browserLifecycleApp = await fixtureApp('Browser owner lifecycle fixture', 'browser-lifecycle');
  const browserQueueApp = await fixtureApp('Browser activation queue fixture', 'browser-activation');
  const deniedQueueApp = await fixtureApp('No approved review fixture', 'no-review');
  for (const [name, actor] of Object.entries(actors)) tokens[name] = await mint(actor, 'accesslobby-web', Math.floor(Date.now() / 1000) - 5);
  const apiChild = start(['dist/main.js'], apiDirectory, {
    DATABASE_URL: database.href, OIDC_ISSUER: issuer, OIDC_API_AUDIENCE: 'accesslobby-api',
    ALLOWED_CLIENT_IDS: 'accesslobby-web,round3-peer', PORT: String(apiPort), GIT_SHA: 'operator-round3-fixture',
  });
  await ready(apiOrigin + '/health/ready', apiChild);
  const standalone = resolve(web, '.next/standalone/apps/web');
  cpSync(resolve(web, 'public'), resolve(standalone, 'public'), { recursive: true });
  cpSync(resolve(web, '.next/static'), resolve(standalone, '.next/static'), { recursive: true });
  const webChild = start([resolve(standalone, 'server.js')], root, {
    WEB_BASE_URL: origin, API_INTERNAL_URL: apiOrigin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'accesslobby-web',
    SESSION_SECRET: sealedKey.toString('base64url'), PUBLIC_REGISTRATION_ENABLED: 'false',
    NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(webPort), NEXT_TELEMETRY_DISABLED: '1',
  });
  await ready(origin + '/manifest.webmanifest', webChild);
  browser = await chromium.launch({ ...(process.env.UI_BROWSER_EXECUTABLE ? {
    executablePath: process.env.UI_BROWSER_EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  } : {}) });
  const anonymousContext = await contextFor(), anonymousPage = await anonymousContext.newPage();
  const readerContext = await contextFor(tokens.reader), readerPage = await readerContext.newPage();
  const identityContext = await contextFor(tokens.identityOperator), identityPage = await identityContext.newPage();
  const ownerContext = await contextFor(tokens.owner), ownerPage = await ownerContext.newPage();
  const activationContext = await contextFor(tokens.appOperator), activationPage = await activationContext.newPage();
  const oldTargetContext = await contextFor(tokens.target), oldTargetPage = await oldTargetContext.newPage();
  for (const page of [anonymousPage, readerPage, identityPage, ownerPage, activationPage, oldTargetPage]) page.setDefaultTimeout(10000);



  async function issueReceipt(actor, application) {
    const token=await mint(actor,application.clientId);
    const value=await api('/v1/me',token,200,{headers:{'x-accesslobby-session-receipt':'1'}});
    assert.equal(value.person.id,actor.id);assert(value.peerSession?.receipt);
    secrets.add(value.peerSession.receipt);return value.peerSession.receipt;
  }
  async function receiptStatus(receipt,application,status=200){
    return api('/v1/peer-sessions/status',null,status,{method:'POST',headers:{
      authorization:'PeerSession '+receipt,'x-accesslobby-client-id':application.clientId}});
  }
  let preservedReceipt, freshReceipt;
  await check('new investigation and control routes require current platform authority',async()=>{
    for(const path of [`/v1/admin/people/${actors.target.id}/sessions`,`/v1/admin/applications/${activeApp.id}/suspension`,
      `/v1/admin/organizations/${organizationId}`,`/v1/admin/organizations/${organizationId}/members`]){
      await api(path,null,401);await api(path,tokens.owner,403);await api(path,tokens.outsider,403);
      privateValuesAbsent(await api(path,tokens.reader));
    }
    const detail=await api(`/v1/admin/applications/${activeApp.id}/suspension`,tokens.appOperator);
    assert.equal(detail.canSuspend,true);assert.equal((await api(`/v1/admin/applications/${activeApp.id}/suspension`,tokens.reader)).canSuspend,false);
    await api(`/v1/admin/applications/${activeApp.id}/suspension`,tokens.reader,403,post({
      expectedStatus:'active',expectedVersion:detail.application.version,confirmationClientId:activeApp.clientId,reference:'issue:76-reader'}));
  });
  await check('organization inspection paginates actual stored members and separates invitations and history',async()=>{
    const detail=await api(`/v1/admin/organizations/${organizationId}`,tokens.reader);
    assert.equal(detail.organization.totalMembershipCount,28);assert.equal(detail.organization.activeOwnerCount,1);
    const first=await api(`/v1/admin/organizations/${organizationId}/members`,tokens.reader);
    assert.equal(first.members.length,25);assert(first.nextCursor);
    const second=await api(`/v1/admin/organizations/${organizationId}/members?after=${encodeURIComponent(first.nextCursor)}`,tokens.reader);
    assert.equal(second.members.length,3);assert.equal(second.nextCursor,null);
    assert.equal(new Set([...first.members,...second.members].map(m=>m.personId)).size,28);
    const invitations=await api(`/v1/admin/organizations/${organizationId}/invitations`,tokens.reader);
    assert.equal(invitations.invitations.length,1);assert.equal(invitations.invitations[0].personId,actors.outsider.id);
    const events=await api(`/v1/admin/organizations/${organizationId}/events`,tokens.reader);assert.equal(events.events.length,1);
    for(const value of [detail,first,second,invitations,events])privateValuesAbsent(value);
    await api(`/v1/admin/organizations/${randomUUID()}`,tokens.reader,404);
    await api(`/v1/admin/organizations/${organizationId}/members?after=malformed`,tokens.reader,400);
  });
  await check('receipt-backed app selection is opaque and stale inspection cannot end renewed associations',async()=>{
    const oldReceipt=await issueReceipt(actors.target,activeApp);
    preservedReceipt=await issueReceipt(actors.target,sessionApp);
    const list=await api(`/v1/admin/people/${actors.target.id}/sessions`,tokens.identityOperator);
    assert.equal(list.sessions.length,2);privateValuesAbsent(list);
    const selected=list.sessions.find(x=>x.clientId===activeApp.clientId);assert(selected);
    assert.match(selected.handle,/^[a-f0-9-]{36}$/i);assert.match(selected.expectedState,/^[a-f0-9]{64}$/);
    const additional=await issueReceipt(actors.target,activeApp);
    await api(`/v1/admin/people/${actors.target.id}/sessions/${selected.handle}/end`,tokens.identityOperator,409,
      post({reference:'issue:76-stale',expectedState:selected.expectedState}));
    assert.equal((await receiptStatus(oldReceipt,activeApp)).active,true);
    assert.equal((await receiptStatus(additional,activeApp)).active,true);
    const current=(await api(`/v1/admin/people/${actors.target.id}/sessions`,tokens.identityOperator)).sessions.find(x=>x.clientId===activeApp.clientId);
    assert.equal(current.receiptCount,2);
    const body={reference:'issue:76-end',expectedState:current.expectedState};
    await api(`/v1/admin/people/${actors.target.id}/sessions/${current.handle}/end`,tokens.reader,403,post(body));
    const result=await api(`/v1/admin/people/${actors.target.id}/sessions/${current.handle}/end`,tokens.identityOperator,200,post(body));
    assert.equal(result.changed,true);assert.equal(result.receiptCount,2);privateValuesAbsent(result);
    await receiptStatus(oldReceipt,activeApp,401);await receiptStatus(additional,activeApp,401);
    assert.equal((await receiptStatus(preservedReceipt,sessionApp)).active,true);
    freshReceipt=await issueReceipt(actors.target,activeApp);
    const replay=await api(`/v1/admin/people/${actors.target.id}/sessions/${current.handle}/end`,tokens.identityOperator,200,post(body));
    assert.equal(replay.changed,false);assert.equal((await receiptStatus(freshReceipt,activeApp)).active,true);
  });
  await check('private organization pages expose real records and native pagination at narrow and wide widths',async()=>{
    const anonymousResponse=await anonymousPage.goto(origin+`/admin/organizations/${organizationId}`);
    assert.match(anonymousResponse.headers()['cache-control']??'',/no-store/);
    assert(!(await anonymousPage.content()).includes('Round three qualification organization'));
    for(const width of [360,1440]){
      await readerPage.setViewportSize({width,height:900});
      await assertProtectedPage(readerPage,`/admin/organizations/${organizationId}`,'Organization record');
      assert((await readerPage.content()).includes('Round three qualification organization'));
      await readerPage.screenshot({path:resolve(artifacts,'organization-'+width+'.png'),fullPage:true});
    }
    await Promise.all([readerPage.waitForURL(url=>url.searchParams.has('after')),
      readerPage.getByRole('link',{name:'Next page',exact:true}).click()]);
    await Promise.all([readerPage.waitForURL(url=>url.searchParams.get('section')==='invitations'),
      readerPage.getByRole('link',{name:'Invitations',exact:true}).click()]);
    await readerPage.getByText(actors.outsider.id,{exact:true}).waitFor();
    await Promise.all([readerPage.waitForURL(url=>url.searchParams.get('section')==='events'),
      readerPage.getByRole('link',{name:'Organization history',exact:true}).click()]);
    assert((await readerPage.content()).includes('Recorded event')||(await readerPage.content()).includes('Invitation'));
    privateValuesAbsent(await readerPage.content());
  });
  await check('native app-association ending is confirmed, same-origin and visible to actual peer checks',async()=>{
    const browserReceipt=await issueReceipt(actors.browserTarget,sessionApp);
    const path=`/admin/people/${actors.browserTarget.id}/sessions`;
    await assertProtectedPage(identityPage,path,'Participating app sessions');
    await identityPage.screenshot({path:resolve(artifacts,'app-sessions.png'),fullPage:true});
    const selected=(await api(`/v1/admin/people/${actors.browserTarget.id}/sessions`,tokens.identityOperator)).sessions[0];
    await csrf(identityContext,path+'/action',{intent:'end-association',handle:selected.handle,
      expectedState:selected.expectedState,reference:'issue:76-csrf'});
    assert.equal((await receiptStatus(browserReceipt,sessionApp)).active,true);
    await identityPage.getByLabel('Change reference for Session association application',{exact:true}).fill('issue:76-native-session');
    await submitNative(identityPage,'End app association',/notice=ended/);
    await receiptStatus(browserReceipt,sessionApp,401);
    assert.equal((await receiptStatus(preservedReceipt,sessionApp)).active,true);
    privateValuesAbsent(await identityPage.content());
  });
  await check('native suspension invalidates client receipts and denies admission without claiming IAM mutation',async()=>{
    const path=`/admin/applications/${activeApp.id}/suspension`;
    const before=await api(`/v1/admin/applications/${activeApp.id}/suspension`,tokens.appOperator);
    const body={expectedStatus:'active',expectedVersion:before.application.version,confirmationClientId:activeApp.clientId,reference:'issue:76-native-app'};
    await assertProtectedPage(activationPage,path,'Application suspension');
    await csrf(activationContext,path+'/action',{intent:'suspend',...body});
    assert.equal((await receiptStatus(freshReceipt,activeApp)).active,true);
    await activationPage.getByLabel('Confirm exact client ID',{exact:true}).fill(activeApp.clientId);
    await activationPage.getByLabel('Change reference',{exact:true}).fill(body.reference);
    await submitNative(activationPage,'Suspend application',/notice=suspended/);
    const after=await api(`/v1/admin/applications/${activeApp.id}/suspension`,tokens.appOperator);
    assert.equal(after.application.status,'suspended');assert.equal(after.canSuspend,false);
    const replay=await api(`/v1/admin/applications/${activeApp.id}/suspension`,tokens.appOperator,200,post(body));
    assert.equal(replay.changed,false);
    await receiptStatus(freshReceipt,activeApp,401);
    await api('/v1/me',await mint(actors.target,activeApp.clientId),401);
    assert.equal((await receiptStatus(preservedReceipt,sessionApp)).active,true);
    const audit=await api('/v1/admin/audit',tokens.reader);assert(audit.events.some(x=>x.action.includes('suspend')));
    privateValuesAbsent(after);privateValuesAbsent(audit);
    await assertProtectedPage(activationPage,path,'Application suspension');
    await activationPage.getByText(body.reference,{exact:true}).waitFor();
    assert.equal(await activationPage.getByRole('button',{name:'Suspend application',exact:true}).count(),0);
    await activationPage.screenshot({path:resolve(artifacts,'application-suspended.png'),fullPage:true});
  });
  await check('new controls reject existing browser authority immediately after role revocation',async()=>{
    await manageOperatorRole(pool,actors.identityOperator.id,'revoke','identity_operator','issue:76-revocation');
    await api(`/v1/admin/people/${actors.target.id}/sessions`,tokens.identityOperator,403);
    await identityPage.goto(origin+`/admin/people/${actors.target.id}/sessions`);
    assert.equal(await identityPage.getByRole('button',{name:'End app association',exact:true}).count(),0);
    assert.deepEqual(browserErrors,[]);
  });

} catch (error) {
  if (!checks.some(value => value.result === 'FAIL')) checks.push({ name: stage, result: 'FAIL', error: error?.name ?? 'Error' });
  console.error('FAIL round-3 qualification (' + (error?.name ?? 'Error') + '): ' + redact(error?.message ?? 'unknown'));
  process.exitCode = 1;
} finally {
  const cleanup = async (name, work) => {
    try { await work(); } catch {
      checks.push({ name: 'cleanup ' + name, result: 'FAIL', error: 'CleanupError' }); process.exitCode = 1;
    }
  };
  await cleanup('browser contexts', () => Promise.all(contexts.map(context => context.close().catch(() => {}))));
  await cleanup('browser', async () => { await browser?.close(); });
  for (const child of [...children].reverse()) await cleanup('fixture process', () => stop(child));
  await cleanup('issuer', async () => { if (issuerServer) await new Promise(resolve => issuerServer.close(resolve)); });
  await cleanup('schema pool', () => pool.end());
  await cleanup('isolated schema', async () => { if (schemaCreated) await adminDatabase.query('DROP SCHEMA ' + schema + ' CASCADE'); });
  await cleanup('admin pool', () => adminDatabase.end());
  writeFileSync(resolve(artifacts, 'report.json'), JSON.stringify({
    source, dirtyWorktree, observedAt: new Date().toISOString(),
    scope: 'synthetic OIDC and DNS fixtures; real isolated PostgreSQL, compiled API and production Next browser',
    privateIamConsole: 'Requires separate disposable native fixture; not run by this synthetic-issuer smoke',
    liveIam: 'NOT RUN', estate: 'NOT RUN', installedDevices: 'NOT RUN', staging: 'NOT RUN', production: 'NOT RUN',
    result: process.exitCode ? 'FAIL' : 'PASS', checks,
  }, null, 2) + '\n');
}
