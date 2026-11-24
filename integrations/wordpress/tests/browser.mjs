import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(fileURLToPath(new URL('../../../package.json', import.meta.url)))('playwright');
const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const allowedHost = host => host === '127.0.0.1' || host === 'localhost' || host.endsWith('.alwp.test');
for (const site of config.sites) {
  const url = new URL(site.base);
  if (!allowedHost(url.hostname)) throw new Error('Refusing a fixture outside the disposable hosts');
}
if (!allowedHost(new URL(config.issuer).hostname) || !allowedHost(new URL(config.api).hostname)) {
  throw new Error('Refusing a fixture outside the disposable hosts');
}
function returnedTo(site) {
  const expected = new URL(site.base);
  return url => url.hostname === expected.hostname && url.port === expected.port;
}
const siteA = config.sites.find(site => site.label === 'a');
const siteB = config.sites.find(site => site.label === 'b');
if (!siteA?.woo || siteB?.prefix !== '/gh') throw new Error('Expected WooCommerce root site A and subdirectory site B');

function wp(site, args) {
  const result = spawnSync(config.php, [config.wpCli, `--path=${site.path}`, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'wp-cli failed').slice(-2000));
  return result.stdout.trim();
}

function wpEval(site, code) {
  return wp(site, ['eval', code]);
}

function optionPatch(site, php) {
  wpEval(site, `$o=get_option('accesslobby_sso'); ${php} update_option('accesslobby_sso',$o); echo 'ok';`);
}

function backchannelDeliveries(label) {
  const text = readFileSync(join(config.logDir || config.artifactDir, `wordpress-${label}.log`), 'utf8');
  return text.split(/\r?\n/).filter(line => line.includes('backchannel-logout') && /\s200(?:\s|$)/.test(line)).length;
}

function auditCount(site, event) {
  if (event !== 'backchannel_accepted' && event !== 'backchannel_rejected') throw new Error('Unexpected audit event');
  return Number(wpEval(site, `global $wpdb; $store = new AccessLobby\\WordPress\\Store($wpdb); echo (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM %i WHERE event=%s', $store->table('audit'), '${event}'));`));
}

async function cookieSession(page, url) {
  await openPage(page, url);
  if (page.url().includes('/realms/')) throw new Error(`Cookie probe started a new sign-in at ${page.url()}`);
  return identity(page);
}

async function identity(page) {
  const node = page.locator('#fixture-identity');
  await node.waitFor({ state: 'attached', timeout: 20000 });
  return { user: Number(await node.getAttribute('data-user')), admin: await node.getAttribute('data-admin') };
}

async function keycloak(page, username) {
  await page.locator('#username').waitFor({ timeout: 20000 });
  const password = page.locator('#password');
  if (!(await password.isVisible())) {
    await page.locator('#username').fill(username);
    await page.locator('#kc-login').click();
  }
  await page.locator('#username').fill(username);
  await password.fill(config.password);
  await page.locator('#kc-login').click();
}

async function openPage(page, url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (error) { last = error; }
  }
  throw last;
}

async function continueWith(page, site) {
  page.on('requestfailed', request => console.log('REQUEST_FAIL', request.url(), request.failure()?.errorText ?? ''));
  const response = await openPage(page, `${site.base}/wp-login.php`);
  if (!response?.ok()) throw new Error(`Login page returned ${response?.status()} for ${site.label}`);
  await page.locator('[data-accesslobby-start]').first().click();
}

function userCount(site) {
  return Number(wpEval(site, 'echo count_users()["total_users"];'));
}

function linkCount(site) {
  return Number(wpEval(site, `global $wpdb; $store = new AccessLobby\\WordPress\\Store($wpdb); echo (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM %i', $store->table('links')));`));
}

function setAdmission(value) {
  if (value !== 'grant_required' && value !== 'authenticated_open') throw new Error('Unexpected admission value');
  const result = spawnSync('docker', ['exec', 'alwp-https-pg', 'psql', '-U', 'accesslobby', '-d', 'accesslobby', '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE applications SET admission='${value}' WHERE client_id='wordpress-a'`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Could not update application admission');
}

function linkState(site, user) {
  return wpEval(site, `global $wpdb; $store = new AccessLobby\\WordPress\\Store($wpdb); $row = $store->link_for_user(${Number(user)}); echo $row['link_state'] ?? 'missing';`);
}

async function keycloakLogin(page, email) {
  await page.waitForURL(/\/realms\/accesslobby-first-party\//, { timeout: 20000 });
  await page.locator('#username').fill(email);
  await page.locator('#password').fill(config.password);
  await page.locator('#kc-login').click();
  if (!page.url().includes('a.alwp.test')) await page.waitForURL(url => url.hostname === 'a.alwp.test', { timeout: 30000 });
}

async function assertBrowserTls(browser) {
  const page = await (await browser.newContext()).newPage();
  const response = await page.goto('https://a.alwp.test:8443/wp-login.php', { waitUntil: 'domcontentloaded', timeout: 20000 });
  const security = response && await response.securityDetails();
  const now = Date.now() / 1000;
  if (!security || security.validFrom > now || security.validTo < now) throw new Error('Browser did not expose a current verified certificate');
  const details = { verification: 'verified', subjectName: security.subjectName, issuer: security.issuer, protocol: security.protocol };
  console.log('TLS_BROWSER', JSON.stringify(details));
  if (!String(security.issuer).includes('AccessLobby Fixture CA') || security.subjectName !== 'a.alwp.test' || !['TLS 1.2', 'TLS 1.3'].includes(security.protocol)) {
    throw new Error('Browser TLS session did not present the fixture certificate');
  }
  await page.context().close();
}

async function verificationLink(email) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const found = await (await fetch(`http://127.0.0.1:${config.mailPort}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const message = found.messages && found.messages[0];
    if (message) {
      const full = await (await fetch(`http://127.0.0.1:${config.mailPort}/api/v1/message/${message.ID}`)).json();
      const match = `${full.Text || ''} ${full.HTML || ''}`.match(/https:\/\/auth\.alwp\.test:8443\/[^"'\s<]+/);
      if (!match) throw new Error('Verification message had no fixture link');
      return match[0].replace(/&amp;/g, '&');
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Verification message did not arrive');
}

async function openJoin(page, site) {
  const response = await openPage(page, `${site.base}/wp-login.php`);
  if (!response?.ok()) throw new Error('Join could not open the site login page');
  await page.locator('#fixture-join').click();
  await page.waitForURL(/\/realms\/accesslobby-first-party\//, { timeout: 20000 });
}

async function submitRegistration(page, email) {
  await page.locator('#kc-register-form').waitFor({ timeout: 20000 });
  await page.locator('#firstName').fill('Join');
  await page.locator('#lastName').fill('Fixture');
  const username = page.locator('#username');
  if (await username.isVisible()) await username.fill(email);
  await page.locator('#email').fill(email);
  const password = page.locator('#password');
  if (await password.count()) {
    await password.fill(config.password);
    const confirm = page.locator('#password-confirm');
    if (await confirm.count()) await confirm.fill(config.password);
  }
  await page.locator('#kc-register-form input[type="submit"], #kc-register-form button[type="submit"]').first().click();
}

async function finishVerifiedRegistration(page, email) {
  await submitRegistration(page, email);
  try {
    await page.goto(await verificationLink(email), { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (error) {
    throw new Error('Verification link did not open');
  }
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline && !page.url().includes('a.alwp.test')) {
    const updated = page.locator('#password-new');
    if (await updated.isVisible().catch(() => false)) {
      await updated.fill(config.password);
      await page.locator('#password-confirm').fill(config.password);
      await page.locator('#kc-submit').click();
      await page.waitForURL(url => !url.href.includes('UPDATE_PASSWORD'), { timeout: 15000 }).catch(() => undefined);
      continue;
    }
    const password = page.locator('#password');
    if (await password.isVisible().catch(() => false)) {
      await password.fill(config.password);
      const confirm = page.locator('#password-confirm');
      if (await confirm.isVisible().catch(() => false)) await confirm.fill(config.password);
      await page.locator('#kc-form-buttons input, #kc-form-buttons button').first().click();
      await page.waitForURL(url => !url.href.includes('UPDATE_PASSWORD'), { timeout: 15000 }).catch(() => undefined);
      continue;
    }
    const proceed = page.getByRole('link', { name: /proceed|continue|click here/i });
    if (await proceed.first().isVisible().catch(() => false)) {
      await proceed.first().click();
      continue;
    }
    await page.waitForTimeout(300);
  }
  if (!page.url().includes('a.alwp.test')) throw new Error('Verified registration did not return to the initiating site');
}

async function joinFlows(browser, site) {
  const beforeUsers = userCount(site);
  const beforeLinks = linkCount(site);
  const cancel = await (await browser.newContext()).newPage();
  await openJoin(cancel, site);
  await cancel.getByRole('link', { name: /back to login/i }).click();
  if (userCount(site) !== beforeUsers || linkCount(site) !== beforeLinks) throw new Error('Cancelled Join created a local account or mapping');
  console.log('FLOW join-cancelled');

  const unverified = await (await browser.newContext()).newPage();
  await openJoin(unverified, site);
  await submitRegistration(unverified, 'unverified-join@example.test');
  await unverified.locator('.kc-feedback-text').waitFor({ timeout: 20000 });
  if (userCount(site) !== beforeUsers || linkCount(site) !== beforeLinks) throw new Error('Unverified Join created a local account or mapping');
  console.log('FLOW join-unverified');

  wpEval(site, `if (!username_exists('local_only')) { wp_insert_user(array('user_login'=>'local_only','user_pass'=>wp_generate_password(),'user_email'=>'local-only@example.test','role'=>'customer')); } echo 'ok';`);
  const collisionUsers = userCount(site);
  const collisionLinks = linkCount(site);
  const collision = await (await browser.newContext()).newPage();
  await openJoin(collision, site);
  await finishVerifiedRegistration(collision, 'local-only@example.test');
  if (!(await collision.locator('body').innerText()).includes('account_link_required')) throw new Error('Join used an existing email to create or link an account');
  const localOnly = Number(wpEval(site, `echo (int) get_user_by('email','local-only@example.test')->ID;`));
  if (wpEval(site, `global $wpdb; $store = new AccessLobby\\WordPress\\Store($wpdb); echo $store->link_for_user(${localOnly}) ? 'linked' : 'unlinked';`) !== 'unlinked') {
    throw new Error('Join collision created a mapping');
  }
  if (userCount(site) !== collisionUsers || linkCount(site) !== collisionLinks) throw new Error('Join collision changed local accounts or mappings');
  console.log('FLOW join-email-collision');

  const deniedUsers = userCount(site);
  const deniedLinks = linkCount(site);
  setAdmission('grant_required');
  try {
    const denied = await (await browser.newContext()).newPage();
    await openJoin(denied, site);
    await finishVerifiedRegistration(denied, 'denied-join@example.test');
    if (!(await denied.locator('body').innerText()).includes('application_entry_denied')) throw new Error('Denied admission completed Join');
    if (userCount(site) !== deniedUsers || linkCount(site) !== deniedLinks) throw new Error('Denied admission created a local account or mapping');
    console.log('FLOW join-admission-denied');
  } finally {
    setAdmission('authenticated_open');
  }

  const partialUsers = userCount(site);
  const partialLinks = linkCount(site);
  const partial = await (await browser.newContext()).newPage();
  await openJoin(partial, site);
  await finishVerifiedRegistration(partial, 'partial-join@example.test');
  if (!(await partial.locator('body').innerText()).includes('local_account_creation_failed')) throw new Error('Partial provisioning completed Join');
  if (Number(wpEval(site, `echo email_exists('partial-join@example.test') ? 1 : 0;`)) !== 0) throw new Error('Partial provisioning left a local account');
  if (userCount(site) !== partialUsers || linkCount(site) !== partialLinks) throw new Error('Partial provisioning created a local account or mapping');
  console.log('FLOW join-partial-provisioning');

  const joined = await (await browser.newContext()).newPage();
  await openJoin(joined, site);
  await finishVerifiedRegistration(joined, 'joiner@example.test');
  if (!joined.url().startsWith(site.protected)) throw new Error(`Join did not return to the initiating destination: ${joined.url().split('?')[0]}`);
  const person = await identity(joined);
  if (!(person.user > 0) || person.admin !== 'no') throw new Error('Join did not establish an unprivileged local account');
  if (wpEval(site, `echo implode(',', get_userdata(${person.user})->roles);`) !== 'customer') throw new Error('Join granted an unexpected role');
  if (wpEval(site, `global $wpdb; $store = new AccessLobby\\WordPress\\Store($wpdb); echo $store->link_for_user(${person.user}) ? 'linked' : 'unlinked';`) !== 'linked') {
    throw new Error('Join did not keep the local mapping');
  }
  console.log('FLOW join-verified', person.user);
  await joined.goto(`${site.base}/my-account/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await joined.getByRole('button', { name: 'Disconnect AccessLobby' }).click();
  await joined.waitForURL(/\/realms\/accesslobby-first-party\//, { timeout: 20000 });
  await joined.goto(`${site.base}/my-account/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  if (linkState(site, person.user) !== 'active') throw new Error('Leaving the unlink flow changed the mapping');
  console.log('FLOW unlink-cancelled');
  await joined.getByRole('button', { name: 'Disconnect AccessLobby' }).click();
  await keycloakLogin(joined, 'joiner@example.test');
  if (linkState(site, person.user) !== 'unlinked') throw new Error('Fresh proof did not unlink the local mapping');
  if (wpEval(site, `echo implode(',', get_userdata(${person.user})->roles);`) !== 'customer') throw new Error('Unlink changed the local role');
  console.log('FLOW unlink');
  const login = wpEval(site, `wp_set_password(${JSON.stringify(config.password)}, ${person.user}); echo get_userdata(${person.user})->user_login;`);
  await openPage(joined, `${site.base}/wp-login.php`);
  await joined.locator('#user_login').fill(login);
  await joined.locator('#user_pass').fill(config.password);
  await joined.locator('#wp-submit').click();
  await joined.goto(`${site.base}/my-account/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await joined.getByRole('button', { name: 'Connect AccessLobby' }).click();
  await keycloakLogin(joined, 'joiner@example.test');
  if (linkState(site, person.user) !== 'active') throw new Error('Fresh dual proof did not restore the same mapping');
  if (Number(wpEval(site, `global $wpdb; $store = new AccessLobby\\WordPress\\Store($wpdb); $row = $store->link_for_user(${person.user}); echo (int) $row['user_id'];`)) !== person.user) {
    throw new Error('Relink attached a different local account');
  }
  console.log('FLOW relink', person.user);
}

const browser = await chromium.launch({
  headless: true,
  args: config.tls ? ['--host-resolver-rules=MAP a.alwp.test 127.0.0.1, MAP b.alwp.test 127.0.0.1, MAP auth.alwp.test 127.0.0.1, MAP api.alwp.test 127.0.0.1'] : [],
});
try {
  const device1 = await browser.newContext();
  const first = await device1.newPage();
  await continueWith(first, siteA);
  await keycloak(first, 'newperson');
  await first.waitForURL(returnedTo(siteA), { timeout: 30000 });
  const created = await identity(first);
  if (!(created.user > 0) || created.admin !== 'no' || created.user === siteA.legacyUser) {
    throw new Error(`JIT sign-in did not create an unprivileged local user: ${JSON.stringify(created)}`);
  }
  const role = wpEval(siteA, `echo implode(',', get_userdata(${created.user})->roles);`);
  if (role !== 'customer') throw new Error(`JIT role was ${role}`);
  if (config.tls) {
    const hostA = new URL(siteA.base).hostname;
    const hostB = new URL(siteB.base).hostname;
    const session = (await device1.cookies()).filter(cookie => cookie.domain === hostA && cookie.name.startsWith('wordpress_logged_in_'));
    if (session.length !== 1 || !session[0].secure) throw new Error('Site A session cookie was not one Secure host-only cookie');
    if ((await device1.cookies()).some(cookie => cookie.name === session[0].name && cookie.domain === hostB)) {
      throw new Error('Site A session cookie was visible to site B');
    }
  }
  console.log('FLOW jit-sign-in', created.user);

  const collision = await (await browser.newContext()).newPage();
  await continueWith(collision, siteA);
  await keycloak(collision, 'shopper');
  await collision.waitForSelector('body', { timeout: 20000 });
  const collisionText = await collision.locator('body').innerText();
  if (!collisionText.includes('account_link_required')) throw new Error('Matching email signed in without an explicit link');
  console.log('FLOW email-does-not-link');

  const linker = await (await browser.newContext()).newPage();
  await linker.goto(siteA.frontend, { waitUntil: 'domcontentloaded' });
  await linker.fill('#user_login', 'legacy_shopper');
  await linker.fill('#user_pass', config.password);
  await linker.click('#wp-submit');
  await linker.goto(siteA.account, { waitUntil: 'domcontentloaded' });
  await linker.getByRole('button', { name: 'Connect AccessLobby' }).click();
  await keycloak(linker, 'shopper');
  await linker.goto(siteA.account, { waitUntil: 'domcontentloaded' });
  if (!(await linker.locator('body').innerText()).includes('Connected.')) throw new Error('Explicit link did not connect the local account');
  const commerce = wpEval(siteA, `$o=wc_get_order(${siteA.orderId}); echo $o->get_total().'|'.$o->get_customer_id().'|'.get_user_meta(${siteA.legacyUser},'billing_address_1',true).'|'.get_user_meta(${siteA.legacyUser},'fixture_b2b_approved',true);`);
  if (commerce !== `73.00|${siteA.legacyUser}|Preserved fixture address|yes`) {
    throw new Error(`Commerce or membership data changed: ${commerce}`);
  }
  const guest = wp(siteA, ['option', 'get', 'woocommerce_enable_guest_checkout']);
  if (guest !== 'yes') throw new Error(`Guest checkout changed: ${guest}`);
  console.log('FLOW linked-account-preserves-commerce');

  const quiet = await device1.newPage();
  await continueWith(quiet, siteB);
  const prompted = await quiet.locator('#username').waitFor({ timeout: 8000 }).then(() => true, () => false);
  if (prompted) throw new Error('Second site asked for credentials while the browser SSO session was active');
  const second = await identity(quiet);
  if (!(second.user > 0) || second.admin !== 'no') throw new Error(`Quiet SSO did not enter site B: ${JSON.stringify(second)}`);
  if (config.tls) {
    const hostB = new URL(siteB.base).hostname;
    const session = (await device1.cookies()).filter(cookie => cookie.domain === hostB && cookie.name.startsWith('wordpress_logged_in_'));
    if (session.length !== 1 || !session[0].secure || !session[0].path.startsWith('/gh')) {
      throw new Error('Site B session cookie was not a Secure subdirectory cookie');
    }
  }
  console.log('FLOW quiet-sso', second.user);

  await openPage(quiet, `${siteB.base}/wp-login.php?action=al_logout`);
  await quiet.getByRole('button', { name: 'Sign out of this site' }).click();
  await quiet.getByText('You are signed out of this site.').waitFor();
  if ((await identity(quiet)).user !== 0) throw new Error('Site-only logout left a local session');
  await quiet.getByRole('link', { name: 'Continue with AccessLobby' }).click();
  const resigned = await identity(quiet);
  if (resigned.user !== second.user) throw new Error(`Quiet re-entry returned user ${resigned.user} instead of ${second.user}`);
  console.log('FLOW site-only-logout-and-quiet-reentry');

  const device2 = await (await browser.newContext()).newPage();
  await continueWith(device2, siteA);
  await keycloak(device2, 'newperson');
  const otherDevice = await identity(device2);
  if (otherDevice.user !== created.user) throw new Error('Second device did not reach the same local user');
  const acceptedBefore = auditCount(siteB, 'backchannel_accepted');
  const rejectedBefore = auditCount(siteB, 'backchannel_rejected');
  const deliveriesBefore = backchannelDeliveries('b');
  await openPage(first, `${siteA.base}/wp-login.php?action=al_logout`);
  await first.getByRole('button', { name: 'Sign out of all connected apps' }).click();
  await Promise.race([
    first.waitForURL(returnedTo(siteA), { timeout: 20000 }),
    first.waitForURL(/\/realms\/accesslobby-first-party\//, { timeout: 20000 }),
  ]);
  if (first.url().includes('/realms/')) {
    const confirmLogout = first.locator('#kc-logout, input[name="confirmLogout"], button[name="confirmLogout"]');
    if (!(await confirmLogout.count())) {
      throw new Error(`Keycloak did not end the session and offered no confirm control at ${first.url()}`);
    }
    await confirmLogout.first().click();
    await first.waitForURL(returnedTo(siteA), { timeout: 20000 });
  }
  let accepted = acceptedBefore;
  for (let attempt = 0; attempt < 20 && accepted <= acceptedBefore; attempt += 1) {
    accepted = auditCount(siteB, 'backchannel_accepted');
    if (accepted <= acceptedBefore) await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (accepted <= acceptedBefore) throw new Error('Site B did not accept a signed backchannel through its HTTP controller');
  if (backchannelDeliveries('b') <= deliveriesBefore) throw new Error('Gateway did not record a new successful backchannel POST to site B');
  const siteBAfter = await cookieSession(quiet, siteB.protected);
  if (siteBAfter.user !== 0) throw new Error(`All-apps logout left the existing site B session usable for user ${siteBAfter.user}`);
  const siteAAfter = await cookieSession(first, siteA.protected);
  if (siteAAfter.user !== 0) throw new Error(`All-apps logout left the existing site A session usable for user ${siteAAfter.user}`);
  await device2.reload({ waitUntil: 'domcontentloaded' });
  if ((await identity(device2)).user !== created.user) throw new Error('All-apps logout ended a different device session');
  const logoutResponse = await first.goto(`${siteA.base}/wp-login.php?action=al_logout`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  const logoutCache = logoutResponse.headers()['cache-control'] || '';
  if (!logoutCache.includes('private') || !logoutCache.includes('no-store')) {
    throw new Error(`Logout response did not carry the application cache header: ${logoutCache}`);
  }
  await openPage(first, `${siteA.base}/wp-login.php`);
  await first.locator('[data-accesslobby-start]').first().click();
  if (!(await first.locator('#username').isVisible())) throw new Error(`All-apps logout left the shared browser session signed in at ${first.url()}`);
  console.log('FLOW all-apps-logout-revokes-both-sites');
  const forged = await quiet.evaluate(async (url) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ logout_token: 'not-a-signed-logout-token' }),
    });
    return { status: response.status, cache: response.headers.get('cache-control') || '' };
  }, `${siteB.base}/?rest_route=/accesslobby/v1/backchannel-logout`);
  if (forged.status !== 400 || !forged.cache.includes('no-store')) {
    throw new Error(`Malformed logout was not refused with the application cache header: ${forged.status}`);
  }
  if (auditCount(siteB, 'backchannel_rejected') <= rejectedBefore) throw new Error('Malformed logout did not reach the controller rejection audit');
  await device2.reload({ waitUntil: 'domcontentloaded' });
  if ((await identity(device2)).user !== created.user) throw new Error('Malformed logout changed another device');
  console.log('FLOW backchannel-http-negative');

  optionPatch(siteA, `$o['jit']=false;`);
  try {
    const denied = await (await browser.newContext()).newPage();
    await continueWith(denied, siteA);
    await keycloak(denied, 'staff');
    if (!(await denied.locator('body').innerText()).includes('account_link_required')) throw new Error('Disabled JIT created or linked an account');
    console.log('FLOW jit-disabled');
  } finally {
    optionPatch(siteA, `$o['jit']=true;`);
  }

  optionPatch(siteB, `$o['mode']='enforced';`);
  try {
    const enforced = await (await browser.newContext()).newPage();
    await openPage(enforced, `${siteB.base}/wp-login.php`);
    await enforced.waitForURL(/\/realms\/accesslobby-first-party\//, { timeout: 20000 });
    console.log('FLOW enforced-login-redirect');
  } finally {
    optionPatch(siteB, `$o['mode']='hybrid';`);
  }
  if (config.tls) await assertBrowserTls(browser);
  if (config.join) await joinFlows(browser, siteA);
  console.log('BROWSER_PASS');
} finally {
  await browser.close();
}
