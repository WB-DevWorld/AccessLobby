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
  page.on('requestfailed', request => { const u=new URL(request.url()); console.log('REQUEST_FAIL', request.method(), u.origin, u.pathname); });
  const response = await openPage(page, `${site.base}/wp-login.php`);
  if (!response?.ok()) throw new Error(`Login page returned ${response?.status()} for ${site.label}`);
  await page.locator('[data-accesslobby-start]').first().click();
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
    if (session.length !== 1 || !session[0].secure || !session[0].httpOnly) throw new Error('Site A session cookie was not one Secure host-only cookie');
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
    if (session.length !== 1 || !session[0].secure || !session[0].httpOnly || !session[0].path.startsWith('/gh')) {
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
  console.log('BROWSER_PASS');
} catch (error) {
  console.error('HTTPS_BROWSER_FAIL ' + error.name);
  process.exitCode = 1;
} finally {
  await browser.close();
}
