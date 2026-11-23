/** Actual Keycloak/API/WordPress browser acceptance; disposable loopback fixtures only. */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const fixture = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [a, b] = fixture.sites;
assert(fixture.sites.every(site => new URL(site.base).hostname === '127.0.0.1'));
const cases = [];
const browsers = [];
const browser = await chromium.launch({ headless: true, executablePath: process.env.ALWP_CHROMIUM || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true }); // One-day loopback fixture certificate only.
browsers.push(context);
const page = await context.newPage();
page.setDefaultTimeout(20000);

function wp(site, code) {
  return execFileSync(fixture.php, [fixture.wpCli, '--path=' + site.path, 'eval', code],
    { encoding: 'utf8', timeout: 30000, env: process.env }).trim();
}
function config(site, changes) {
  const encoded = Buffer.from(JSON.stringify(changes)).toString('base64');
  wp(site, '$c=get_option("accesslobby_sso");$v=json_decode(base64_decode("' + encoded + '"),true);' +
    'update_option("accesslobby_sso",array_merge($c,$v));');
}
async function test(name, operation) {
  const start = performance.now();
  try { await operation(); cases.push({ name, status: 'PASS', milliseconds: Math.round(performance.now() - start) });
    console.log('BROWSER_PASS ' + name); }
  catch (error) { cases.push({ name, status: 'FAIL', error: String(error.message).replace(/([?&](?:code|state|session_state)=)[^&\s]+/g, '$1[redacted]') }); throw error; }
}
async function identity(site, tab = page) {
  await tab.goto(site.account);
  return Number(await tab.locator('#fixture-identity').getAttribute('data-user'));
}
async function localLogin(site, username, tab = page) {
  await tab.goto(site.base + '/wp-login.php');
  await tab.locator('#user_login').fill(username);
  await tab.locator('#user_pass').fill(fixture.password);
  await Promise.all([tab.waitForURL(url => !url.pathname.endsWith('wp-login.php')), tab.locator('#wp-submit').click()]);
}
async function iamLogin(tab, username) {
  await tab.locator('#username').waitFor();
  await tab.locator('#username').fill(username);
  await tab.locator('#password').fill(fixture.password);
  await tab.locator('#kc-login').click();
  await tab.waitForURL(url => ['8441', '8442'].includes(url.port) && !url.search.includes('al_callback'));
}
async function siteLogout(site, tab = page) {
  await tab.goto(site.base + '/wp-login.php?action=al_logout');
  await tab.getByRole('button', { name: 'Sign out of this site', exact: true }).click();
  await tab.getByText('You are signed out of this site.', { exact: true }).waitFor();
}

try {
  await test('hybrid core login exposes AccessLobby and preserves local form', async () => {
    await page.goto(a.base + '/wp-login.php');
    assert.equal(await page.locator('#user_pass').count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Continue with AccessLobby', exact: true }).count(), 1);
  });
  await test('hybrid local customer login retains original local account', async () => {
    await localLogin(a, 'legacy_shopper');
    assert.equal(await identity(a), a.legacyUser);
  });
  await test('fresh dual proof links existing WooCommerce customer', async () => {
    await page.getByRole('button', { name: 'Connect AccessLobby', exact: true }).click();
    await iamLogin(page, 'shopper');
    assert.equal(await identity(a), a.legacyUser);
    const data = JSON.parse(wp(a, '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);' +
      '$u=get_userdata(' + a.legacyUser + ');$o=wc_get_order(' + a.orderId + ');' +
      'echo wp_json_encode(["linked"=>$s->link_for_user($u->ID)["link_state"],"roles"=>$u->roles,' +
      '"customer"=>$o->get_customer_id(),"total"=>$o->get_total(),"address"=>get_user_meta($u->ID,"billing_address_1",true),' +
      '"b2b"=>get_user_meta($u->ID,"fixture_b2b_approved",true)]);'));
    assert.equal(data.linked, 'active'); assert.deepEqual(data.roles, ['customer']);
    assert.equal(data.customer, a.legacyUser); assert.equal(data.total, '73.00');
    assert.equal(data.address, 'Preserved fixture address'); assert.equal(data.b2b, 'yes');
  });
  await test('site-only logout clears WP without automatically re-entering', async () => {
    await siteLogout(a);
    assert.equal(await identity(a), 0);
  });
  await test('quiet SSO re-entry preserves original protected destination', async () => {
    await page.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.protected));
    await page.waitForURL(a.protected);
    assert.equal(await page.locator('#fixture-identity').getAttribute('data-user'), String(a.legacyUser));
  });
  let bUser;
  await test('second independent subdirectory WP reuses IAM session without credentials', async () => {
    await page.goto(b.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(b.protected));
    await page.waitForURL(b.protected);
    bUser = Number(await page.locator('#fixture-identity').getAttribute('data-user'));
    assert(bUser > 0);
    assert.equal(wp(b, 'echo implode(",",get_userdata(' + bUser + ')->roles);'), 'subscriber');
    assert.equal(wp(a, 'echo implode(",",get_userdata(' + a.legacyUser + ')->roles);'), 'customer');
    assert.notEqual(bUser, a.legacyUser);
  });
  await test('site-only logout on A leaves independent B session active', async () => {
    await siteLogout(a);
    assert.equal(await identity(a), 0);
    assert.equal(await identity(b), bUser);
  });
  await test('subdirectory repeat login resolves exactly one local account', async () => {
    const count = wp(b, 'echo count_users()["total_users"];');
    await siteLogout(b);
    await page.goto(b.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(b.account));
    await page.waitForURL(b.account);
    assert.equal(await identity(b), bUser);
    assert.equal(wp(b, 'echo count_users()["total_users"];'), count);
  });
  await test('WordPress sessions use Secure and HttpOnly cookies over HTTPS', async () => {
    const cookies = (await context.cookies()).filter(c => c.name.startsWith('wordpress_logged_in_'));
    assert(cookies.length > 0); assert(cookies.every(c => c.secure && c.httpOnly));
  });
  await test('callback rejects missing state without creating a session', async () => {
    const negative = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(negative);
    const tab = await negative.newPage();
    const response = await tab.goto(a.base + '/wp-login.php?action=al_callback&code=untrusted');
    assert.equal(response.status(), 400);
    assert.match(response.headers()['cache-control'], /no-store/);
    assert.equal(await identity(a, tab), 0);
  });
  await test('unsigned backchannel cannot destroy another WP session', async () => {
    const response = await context.request.post(b.base + '/?rest_route=/accesslobby/v1/backchannel-logout', { form: { logout_token: 'unauthenticated.fake.logout' } });
    assert.equal(response.status(), 400);
    assert.equal(await identity(b), bUser);
  });
  await test('actual issuer logout invalidates matching sessions on both WP peers', async () => {
    await page.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.account));
    await page.waitForURL(a.account);
    await page.goto(a.base + '/wp-login.php?action=al_logout');
    await page.getByRole('button', { name: 'Sign out of all connected apps', exact: true }).click();
    // No ID token in the URL: current Keycloak asks the user to confirm browser logout.
    if (new URL(page.url()).port === '8083') {
      await page.locator('#kc-logout').click();
    }
    await page.waitForURL(url => url.port === '8441' && url.searchParams.get('action') === 'al_signed_out');
    assert.equal(await identity(a), 0);
    assert.equal(await identity(b), 0);
  });
  await test('all-app logout ends quiet IAM re-entry', async () => {
    await page.goto(b.base + '/wp-login.php?action=al_start');
    await page.locator('#username').waitFor();
    assert.equal(new URL(page.url()).port, '8083');
  });
} finally {
  writeFileSync(fixture.artifactDir + '/browser-report.json', JSON.stringify({
    engine: 'actual Keycloak + unchanged AccessLobby API + real WordPress/WooCommerce',
    sites: fixture.sites.map(s => ({ label: s.label, base: s.base, client: s.client })), cases,
  }, null, 2) + '\n');
  for (const ctx of browsers) await ctx.close();
  await browser.close();
}
