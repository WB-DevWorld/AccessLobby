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
    const response = await page.goto(a.account);
    assert.match(response.headers()['cache-control'], /private.*no-store/);
  });
  await test('fresh dual proof links existing ' + (a.woo ? 'WooCommerce customer' : 'WordPress user'), async () => {
    await page.getByRole('button', { name: 'Connect AccessLobby', exact: true }).click();
    await iamLogin(page, 'shopper');
    assert.equal(await identity(a), a.legacyUser);
    const data = JSON.parse(wp(a, '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);' +
      '$u=get_userdata(' + a.legacyUser + ');$o=' + (a.woo ? 'wc_get_order(' + a.orderId + ')' : 'null') + ';' +
      'echo wp_json_encode(["linked"=>$s->link_for_user($u->ID)["link_state"],"roles"=>$u->roles,' +
      '"customer"=>$o?$o->get_customer_id():null,"total"=>$o?$o->get_total():null,"address"=>get_user_meta($u->ID,"billing_address_1",true),' +
      '"b2b"=>get_user_meta($u->ID,"fixture_b2b_approved",true)]);'));
    assert.equal(data.linked, 'active'); assert.deepEqual(data.roles, [a.woo ? 'customer' : 'editor']);
    if (a.woo) { assert.equal(data.customer, a.legacyUser); assert.equal(data.total, '73.00'); }
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
    assert.equal(wp(a, 'echo implode(",",get_userdata(' + a.legacyUser + ')->roles);'), a.woo ? 'customer' : 'editor');
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
  const adminContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(adminContext);
  const admin = await adminContext.newPage();
  await test('enforced migration gate refuses an unprepared administrator', async () => {
    await localLogin(a, 'fixture_admin', admin);
    await admin.goto(a.base + '/wp-admin/options-general.php?page=accesslobby-sso');
    await admin.locator('select[name="accesslobby_sso[mode]"]').selectOption('enforced');
    await admin.getByRole('button', { name: 'Save Changes', exact: true }).click();
    assert.equal(wp(a, 'echo get_option("accesslobby_sso")["mode"];'), 'hybrid');
  });
  await test('existing administrator links explicitly without claim-based elevation', async () => {
    await admin.goto(a.base + '/wp-admin/profile.php');
    await admin.getByRole('button', { name: 'Connect AccessLobby', exact: true }).click();
    await iamLogin(admin, 'staff');
    assert.equal(await identity(a, admin), 1);
    assert.equal(wp(a, 'echo implode(",",get_userdata(1)->roles);'), 'administrator');
  });
  await test('HTTPS emergency ticket creates only the intended short admin session', async () => {
    const ticket = wp(a, '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);echo AccessLobby\\WordPress\\Emergency::issue($s,1,"127.0.0.1","fixture-browser-rehearsal");');
    const recoveryContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(recoveryContext);
    const recovery = await recoveryContext.newPage();
    await recovery.goto(a.base + '/wp-login.php?action=al_emergency');
    await recovery.locator('input[name="ticket"]').fill(ticket);
    await recovery.getByRole('button', { name: 'Recover administrator access', exact: true }).click();
    assert.equal(await identity(a, recovery), 1);
    const replayContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(replayContext);
    const replay = await replayContext.newPage();
    await replay.goto(a.base + '/wp-login.php?action=al_emergency');
    await replay.locator('input[name="ticket"]').fill(ticket);
    await replay.getByRole('button', { name: 'Recover administrator access', exact: true }).click();
    assert.equal(await identity(a, replay), 0);
  });
  await test('linked admin enables enforced mode only after readiness acknowledgements', async () => {
    await admin.goto(a.base + '/wp-admin/options-general.php?page=accesslobby-sso');
    await admin.getByRole('button', { name: 'Test connection metadata', exact: true }).click();
    await admin.locator('input[name="accesslobby_sso[migration_reference]"]').fill('fixture-backup-and-rollback');
    await admin.locator('input[name="accesslobby_sso[recovery_reference]"]').fill('fixture-browser-rehearsal');
    for (const key of ['ack_unlinked', 'ack_privileged', 'ack_invalidate']) {
      await admin.locator('input[name="accesslobby_sso[' + key + ']"]').check();
    }
    await admin.locator('select[name="accesslobby_sso[mode]"]').selectOption('enforced');
    await admin.getByRole('button', { name: 'Save Changes', exact: true }).click();
    assert.equal(wp(a, 'echo get_option("accesslobby_sso")["mode"];'), 'enforced');
  });
  for (const [name, target] of [['wp-login', a.base + '/wp-login.php'], ['wp-admin', a.base + '/wp-admin/'],
    ['My Account', a.wooAccount], ['generic frontend', a.frontend]]) {
    if (!target) continue;
    await test('enforced ' + name + ' automatically initiates AccessLobby', async () => {
      const isolated = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(isolated);
      const tab = await isolated.newPage();
      await tab.goto(target);
      await tab.locator('#username').waitFor();
      assert.equal(new URL(tab.url()).port, '8083');
      assert.equal(await tab.locator('#user_pass').count(), 0);
    });
  }
  await test('enforced protected journey preserves its original destination and local permission', async () => {
    const isolated = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(isolated);
    const tab = await isolated.newPage();
    await tab.goto(a.protected);
    await iamLogin(tab, 'shopper');
    await tab.waitForURL(a.protected);
    assert.equal(await tab.locator('#fixture-identity').getAttribute('data-user'), String(a.legacyUser));
    const denied = await tab.goto(a.restricted);
    assert.equal(denied.status(), 403);
  });
  if (a.woo) await test('enforced mode keeps WooCommerce guest checkout and guest purchasing intact', async () => {
    const guestContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(guestContext);
    const guest = await guestContext.newPage();
    const count = wp(a, 'echo count_users()["total_users"];');
    await guest.goto(a.base + '/?add-to-cart=' + a.productId);
    await guest.goto(a.checkout);
    await guest.locator('form.checkout').waitFor();
    assert.equal(new URL(guest.url()).port, '8441');
    for (const [field, value] of Object.entries({ billing_first_name: 'Guest', billing_last_name: 'Fixture',
      billing_address_1: '1 Fixture Street', billing_city: 'Los Angeles', billing_postcode: '90210',
      billing_phone: '2025550101', billing_email: 'guest-checkout@example.test' })) {
      await guest.locator('#' + field).fill(value);
    }
    await guest.locator('#billing_country').selectOption('US', { force: true });
    await guest.locator('#billing_state').selectOption('CA', { force: true });
    await guest.locator('#place_order').click();
    await guest.locator('.woocommerce-thankyou-order-received').waitFor({ timeout: 30000 });
    assert.equal(await identity(a, guest), 0);
    assert.equal(wp(a, 'echo count_users()["total_users"];'), count);
    const order = JSON.parse(wp(a, '$o=wc_get_orders(["billing_email"=>"guest-checkout@example.test","limit"=>1]);echo wp_json_encode(["customer"=>$o[0]->get_customer_id(),"total"=>$o[0]->get_total()]);'));
    assert.equal(order.customer, 0); assert.equal(order.total, '19.95');
  });
  await test('identity API outage fails new enforced login closed and leaves existing sessions usable', async () => {
    wp(a, 'update_option("alwp_fixture_outage",1);');
    try {
      const outageContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(outageContext);
      const outage = await outageContext.newPage();
      await outage.goto(a.base + '/wp-login.php');
      await outage.locator('#username').fill('shopper');
      await outage.locator('#password').fill(fixture.password);
      await outage.locator('#kc-login').click();
      await outage.waitForURL(url => url.searchParams.get('action') === 'al_callback');
      await outage.getByText('upstream_unavailable_or_denied', { exact: true }).waitFor();
      assert.equal(await identity(a, outage), 0);
      assert.equal(await identity(a, admin), 1);
    } finally { wp(a, 'delete_option("alwp_fixture_outage");'); }
  });
} finally {
  writeFileSync(fixture.artifactDir + '/browser-report.json', JSON.stringify({
    engine: 'actual Keycloak + unchanged AccessLobby API + real WordPress/WooCommerce',
    sites: fixture.sites.map(s => ({ label: s.label, base: s.base, client: s.client })), cases,
  }, null, 2) + '\n');
  for (const ctx of browsers) await ctx.close();
  await browser.close();
}
