/** Actual Keycloak/API/WordPress browser acceptance; disposable loopback fixtures only. */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { qualifyHybrid, qualifyEditor, qualifyEnforced, qualifyUpgrade } from './frontend-linking.mjs';

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
let phase = 'start';
let diagnostic = {};

function wp(site, code) {
  return execFileSync(fixture.php, [fixture.wpCli, '--path=' + site.path, 'eval', code],
    { encoding: 'utf8', timeout: 30000, env: process.env }).trim();
}
function wpCommand(site, args) {
  return execFileSync(fixture.php, [fixture.wpCli, '--path=' + site.path, ...args],
    { encoding: 'utf8', timeout: 30000, env: process.env }).trim();
}
function config(site, changes) {
  const encoded = Buffer.from(JSON.stringify(changes)).toString('base64');
  wp(site, '$c=get_option("accesslobby_sso");$v=json_decode(base64_decode("' + encoded + '"),true);' +
    'update_option("accesslobby_sso",array_merge($c,$v));');
}
async function test(name, operation) {
  phase = 'start';
  diagnostic = {};
  const start = performance.now();
  try { await operation(); cases.push({ name, status: 'PASS', milliseconds: Math.round(performance.now() - start), ...(Object.keys(diagnostic).length ? { diagnostic } : {}) });
    console.log('BROWSER_PASS ' + name); }
  catch (error) {
    // Assertion/Playwright errors can contain cookie values, callback or verification URLs.
    const timeoutMethod = error.name === 'TimeoutError' ? (error.message.match(/^[A-Za-z]+\.[A-Za-z]+/) || [])[0] : undefined;
    cases.push({ name, status: 'FAIL', phase, errorClass: error.name, timeoutMethod, diagnostic });
    throw new Error('Browser acceptance failed: ' + name + ' at ' + phase);
  }
}
async function identity(site, tab = page) {
  await tab.goto(site.account);
  return Number(await tab.locator('#fixture-identity').getAttribute('data-user'));
}
async function localLogin(site, username, tab = page) {
  const network = [];
  const dialogs = [];
  const handleDialog = async dialog => {
    dialogs.push(dialog.type());
    // Only the explicit navigation from a synthetic login is accepted; all other dialogs retain dismissal.
    if (dialog.type() === 'beforeunload') await dialog.accept();
    else await dialog.dismiss();
  };
  const trace = response => {
    const url = new URL(response.url());
    if (url.pathname.endsWith('/wp-login.php')) network.push({ method: response.request().method(), status: response.status(),
      action: /^[a-z_]{1,40}$/.test(url.searchParams.get('action') || '') ? url.searchParams.get('action') : '' });
  };
  tab.on('response', trace);
  tab.on('dialog', handleDialog);
  try {
    wp(site, 'delete_option("alwp_fixture_local_failed");delete_option("alwp_fixture_local_success");');
    await tab.goto(site.base + '/wp-login.php?redirect_to=' + encodeURIComponent(site.account));
    // Core schedules autofocus after 200ms and can clear the password of a prefilled username.
    // Wait for that actual UI event before automation fills the form.
    await tab.waitForFunction(() => ['user_login', 'user_pass'].includes(document.activeElement?.id));
    await tab.locator('#user_login').fill('');
    await tab.locator('#user_login').pressSequentially(username);
    await tab.locator('#user_pass').fill('');
    await tab.locator('#user_pass').pressSequentially(fixture.password);
    await tab.locator('#user_pass').press('Tab');
    await Promise.all([tab.waitForURL(url => url.href === site.account || url.searchParams.get('action') === 'confirm_admin_email'), tab.locator('#wp-submit').click()]);
    if (new URL(tab.url()).searchParams.get('action') === 'confirm_admin_email') {
      // Confirm only the disposable fixture administrator's own configured email through the real nonce form.
      await Promise.all([tab.waitForURL(site.account), tab.locator('#correct-admin-email').click()]);
    }
  } catch (error) {
    // Synthetic fixture messages only; never retain input values, cookies, query strings or form actions.
    try {
      let message = (await tab.locator('#login_error, #login .notice').allTextContents()).join(' ');
      message = message.replaceAll(fixture.password, '[redacted]').replace(/https?:\/\/\S+/g, '[url]').slice(0, 400);
      const url = new URL(tab.url());
      const action = url.searchParams.get('action');
      diagnostic = { pathname: url.pathname, coreAction: ['confirm_admin_email', 'login', 'rp', 'resetpass', 'lostpassword'].includes(action) ? action : '', localForms: await tab.locator('#loginform').count(),
        iamForms: await tab.locator('#kc-form-login').count(), message,
        inputState: await tab.locator('#loginform').evaluate(form => ({
          userFilled: Boolean(form.querySelector('#user_login')?.value),
          passwordFilled: Boolean(form.querySelector('#user_pass')?.value),
          invalidFields: [...form.querySelectorAll(':invalid')].map(element => element.id),
          actionHttps: new URL(form.action).protocol === 'https:',
          actionSameOrigin: new URL(form.action).origin === location.origin,
          method: form.method, target: form.target,
          connectorScript: Boolean(document.querySelector('script[src*="/accesslobby-sso/"]')),
          connectorMode: window.accessLobbyWordPress?.mode || '',
          submit: (() => { const button = form.querySelector('#wp-submit'); const rect = button?.getBoundingClientRect();
            return { disabled: button?.disabled, type: button?.type, form: button?.form?.id,
              visible: Boolean(rect?.width && rect?.height), hit: rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.id : '' }; })(),
        })).catch(() => ({})),
        network,
        backend: JSON.parse(wp(site, 'echo wp_json_encode(["success"=>get_option("alwp_fixture_local_success"),"failure"=>get_option("alwp_fixture_local_failed")]);')),
        activePlugins: JSON.parse(wp(site, 'echo wp_json_encode(get_option("active_plugins"));')) };
    } catch {}
    throw error;
  } finally {
    if (dialogs.length) diagnostic = { ...diagnostic, dialogs };
    tab.off('response', trace); tab.off('dialog', handleDialog);
  }
}
async function directLocalCookie(site, tab, context) {
  await tab.goto(site.account);
  const nonce = await tab.locator('#fixture-direct-nonce').inputValue();
  await context.request.post(site.base + '/', { form: {
    fixture_direct_local_login: '1', _wpnonce: nonce, log: 'legacy_shopper', pwd: fixture.password,
  } });
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
async function allLogout(site, tab) {
  await tab.goto(site.base + '/wp-login.php?action=al_logout');
  await tab.getByRole('button', { name: 'Sign out of all connected apps', exact: true }).click();
  if (new URL(tab.url()).port === '8083') await tab.locator('#kc-logout').click();
  await tab.waitForURL(url => url.port === new URL(site.base).port && url.searchParams.get('action') === 'al_signed_out');
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
  await test('hybrid custom password frontend can issue an ordinary local cookie', async () => {
    const controlContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(controlContext);
    const control = await controlContext.newPage();
    await directLocalCookie(a, control, controlContext);
    assert.equal(await identity(a, control), a.legacyUser);
  });
  await test('fresh dual proof links existing ' + (a.woo ? 'WooCommerce customer' : 'WordPress user'), async () => {
    const oldCookie = (await context.cookies()).find(c => c.name.startsWith('wordpress_logged_in_'));
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
    const newCookie = (await context.cookies()).find(c => c.name.startsWith('wordpress_logged_in_'));
    assert.notEqual(oldCookie.value, newCookie.value);
    assert.equal(wp(a, 'global $wpdb;echo $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}accesslobby_sessions WHERE user_id=' + a.legacyUser + '");'), '1');
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
  await qualifyHybrid({ test, browser, browsers, fixture, a, b, page, context, bUser, wp, iamLogin, identity, localLogin,
    stage: value => { phase = value; } });
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
  await test('peer Join verifies email before creating exactly one safe local account', async () => {
    const joinedContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(joinedContext);
    const joined = await joinedContext.newPage();
    const count = Number(wp(a, 'echo count_users()["total_users"];'));
    await joined.goto(a.base + '/wp-login.php?action=al_start&intent=join&redirect_to=' + encodeURIComponent(a.protected));
    await joined.locator('#kc-register-form').waitFor();
    for (const [name, value] of Object.entries({ username: 'joinedvisitor', firstName: 'New', lastName: 'Visitor', email: 'joinedvisitor@example.test' })) {
      await joined.locator('[name="' + name + '"]').fill(value);
    }
    if (await joined.locator('[name="password"]').count()) {
      await joined.locator('[name="password"]').fill(fixture.password);
      await joined.locator('[name="password-confirm"]').fill(fixture.password);
    }
    await joined.locator('#kc-register-form input[type="submit"]').click();
    await joined.waitForURL(url => url.port === '8083' && url.pathname.includes('login-actions'));
    assert.equal(Number(wp(a, 'echo count_users()["total_users"];')), count);
    const mailPath = fixture.mailbox + '/' + createHash('sha256').update('joinedvisitor@example.test').digest('hex') + '.json';
    let link;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { link = JSON.parse(readFileSync(mailPath, 'utf8')).links.find(url => url.includes('/login-actions/action-token?')); } catch {}
      if (link) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(link, 'Synthetic verification mail was not captured');
    await joined.goto(link);
    if (await joined.locator('#kc-passwd-update-form').count()) {
      await joined.locator('#password-new').fill(fixture.password);
      await joined.locator('#password-confirm').fill(fixture.password);
      await joined.locator('#kc-passwd-update-form input[type="submit"]').click();
    }
    await joined.waitForURL(a.protected);
    const joinedId = Number(await joined.locator('#fixture-identity').getAttribute('data-user'));
    assert(joinedId > 0);
    assert.equal(Number(wp(a, 'echo count_users()["total_users"];')), count + 1);
    assert.equal(wp(a, 'echo implode(",",get_userdata(' + joinedId + ')->roles);'), a.woo ? 'customer' : 'subscriber');
    await siteLogout(a, joined);
    await joined.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.protected));
    await joined.waitForURL(a.protected);
    assert.equal(Number(await joined.locator('#fixture-identity').getAttribute('data-user')), joinedId);
    assert.equal(Number(wp(a, 'echo count_users()["total_users"];')), count + 1);
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
  await qualifyEditor({ test, browser, browsers, fixture, a, admin, wp, stage: value => { phase = value; } });
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
  await qualifyEnforced({ test, browser, browsers, fixture, a, page, context, wp, iamLogin, identity });
  await test('enforced cookie guard denies a valid local-password frontend that bypasses authenticate', async () => {
    const deniedContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(deniedContext);
    const denied = await deniedContext.newPage();
    await directLocalCookie(a, denied, deniedContext);
    assert.equal(await identity(a, denied), 0);
    assert.equal((await deniedContext.cookies()).filter(c => c.name.startsWith('wordpress_logged_in_')).length, 0);
  });
  await test('host recovery can issue a short administrator cookie while enforcement is active', async () => {
    const ticket = wp(a, '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);echo AccessLobby\\WordPress\\Emergency::issue($s,1,"127.0.0.1","fixture-enforced-recovery");');
    const recoveryContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(recoveryContext);
    const recovery = await recoveryContext.newPage();
    await recovery.goto(a.base + '/wp-login.php?action=al_emergency');
    await recovery.locator('input[name="ticket"]').fill(ticket);
    await recovery.getByRole('button', { name: 'Recover administrator access', exact: true }).click();
    assert.equal(await identity(a, recovery), 1);
  });
  await test('Application Password REST authentication follows its explicit machine policy', async () => {
    const created = JSON.parse(wp(a, '$r=WP_Application_Passwords::create_new_application_password(' + a.legacyUser + ',["name"=>"Disposable API acceptance"]);echo wp_json_encode(["password"=>$r[0],"uuid"=>$r[1]["uuid"]]);'));
    const machineContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(machineContext);
    const authorization = 'Basic ' + Buffer.from('legacy_shopper:' + created.password).toString('base64');
    try {
      const accepted = await machineContext.request.get(a.base + '/?rest_route=/wp/v2/users/me', { headers: { Authorization: authorization } });
      assert.equal(accepted.status(), 200); assert.equal((await accepted.json()).id, a.legacyUser);
      config(a, { machine_auth: false });
      const denied = await machineContext.request.get(a.base + '/?rest_route=/wp/v2/users/me', { headers: { Authorization: authorization } });
      assert([401, 403].includes(denied.status()));
    } finally {
      config(a, { machine_auth: true });
      wp(a, 'WP_Application_Passwords::delete_application_password(' + a.legacyUser + ',' + JSON.stringify(created.uuid) + ');');
    }
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
    phase = 'add_to_cart';
    await guest.goto(a.base + '/?add-to-cart=' + a.productId);
    phase = 'checkout_form';
    await guest.goto(a.checkout);
    await guest.locator('form.checkout').waitFor();
    assert.equal(new URL(guest.url()).port, '8441');
    assert.equal(await guest.locator('#createaccount').count(), 0);
    assert.equal(wp(a, 'echo get_option("woocommerce_enable_signup_and_login_from_checkout");'), 'yes');
    assert.equal(wp(a, 'echo get_option("woocommerce_enable_guest_checkout");'), 'yes');
    phase = 'billing_fields';
    for (const [field, value] of Object.entries({ billing_first_name: 'Guest', billing_last_name: 'Fixture',
      billing_address_1: '1 Fixture Street', billing_city: 'Los Angeles', billing_postcode: '90210',
      billing_phone: '2025550101', billing_email: 'guest-checkout@example.test' })) {
      await guest.locator('#' + field).fill(value);
    }
    await guest.locator('#billing_country').selectOption('US', { force: true });
    await guest.locator('#billing_state').selectOption('CA', { force: true });
    phase = 'reject_forged_local_registration';
    const fields = await guest.locator('form.checkout').evaluate(form => Object.fromEntries(new FormData(form)));
    const forged = await guestContext.request.post(a.base + '/?wc-ajax=checkout', {
      form: { ...fields, createaccount: '1', payment_method: 'cod' },
    });
    const rejected = await forged.json();
    assert.equal(rejected.result, 'failure');
    assert.match(rejected.messages, /Create your account through AccessLobby/);
    assert.equal(wp(a, 'echo count_users()["total_users"];'), count);
    phase = 'place_order';
    await guest.locator('#place_order').click();
    phase = 'thank_you';
    // The current block theme uses Woo order-confirmation blocks, not the classic thank-you CSS class.
    await guest.waitForURL(url => url.searchParams.has('order-received') || url.pathname.includes('/order-received/'), { timeout: 30000 });
    assert.equal(await guest.locator('#fixture-identity').getAttribute('data-order-received'), 'yes');
    phase = 'commerce_assertions';
    assert.equal(await identity(a, guest), 0);
    assert.equal(wp(a, 'echo count_users()["total_users"];'), count);
    const order = JSON.parse(wp(a, '$o=wc_get_orders(["billing_email"=>"guest-checkout@example.test","limit"=>1]);echo wp_json_encode(["customer"=>$o[0]->get_customer_id(),"total"=>$o[0]->get_total()]);'));
    assert.equal(order.customer, 0); assert.equal(order.total, '19.95');
  });
  if (a.woo) await test('enforced anonymous Woo registration fails without creating a local account', async () => {
    const deniedContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(deniedContext);
    const before = wp(a, 'global $wpdb;echo $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}accesslobby_audit WHERE event=\'local_registration_rejected\'");');
    const nonce = wp(a, 'wp_set_current_user(0);echo wp_create_nonce("woocommerce-register");');
    await deniedContext.request.post(a.wooAccount, { form: { register: '1', 'woocommerce-register-nonce': nonce,
      email: 'denied-local-register@example.test', password: fixture.password } });
    assert.equal(wp(a, 'echo email_exists("denied-local-register@example.test")?1:0;'), '0');
    const after = wp(a, 'global $wpdb;echo $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}accesslobby_audit WHERE event=\'local_registration_rejected\'");');
    assert.equal(Number(after), Number(before) + 1);
  });
  if (a.woo) await test('account-required checkout starts IAM while guest policy remains a local setting', async () => {
    wp(a, 'update_option("woocommerce_enable_guest_checkout","no");');
    try {
      const requiredContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(requiredContext);
      const required = await requiredContext.newPage();
      await required.goto(a.checkout);
      await required.locator('#username').waitFor();
      assert.equal(new URL(required.url()).port, '8083');
    } finally { wp(a, 'update_option("woocommerce_enable_guest_checkout","yes");'); }
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
  await test('missing prerequisite fault cannot reopen enforced local password login', async () => {
    wp(a, 'update_option("alwp_fixture_unavailable",1);');
    try {
      const faultContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(faultContext);
      const fault = await faultContext.newPage();
      const response = await fault.goto(a.base + '/wp-login.php');
      assert.equal(response.status(), 503);
      assert.equal(await fault.locator('#user_pass').count(), 0);
      const posted = await faultContext.request.post(a.base + '/wp-login.php', { form: { log: 'fixture_admin', pwd: fixture.password } });
      assert.equal(posted.status(), 503);
      assert.equal(await identity(a, fault), 0);
    } finally { wp(a, 'delete_option("alwp_fixture_unavailable");'); }
  });
  await test('authorized rollback restores local login and enforced reactivation ends rollback sessions', async () => {
    phase = 'rollback_deactivate';
    wpCommand(a, ['plugin', 'deactivate', 'accesslobby-sso']);
    const rollbackContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(rollbackContext);
    const rollback = await rollbackContext.newPage();
    phase = 'rollback_local_login';
    await localLogin(a, 'fixture_admin', rollback);
    assert.equal(await identity(a, rollback), 1);
    phase = 'rollback_reactivate';
    wpCommand(a, ['plugin', 'activate', 'accesslobby-sso']);
    phase = 'rollback_verify';
    assert.equal(await identity(a, rollback), 0);
    assert.equal(wp(a, 'echo get_option("accesslobby_sso")["mode"];'), 'enforced');
  });
  // The readiness UI is exercised on A. A host-only fixture setting isolates B's path-prefixed routing behavior.
  config(b, { mode: 'enforced' });
  for (const [name, target] of [['core', b.base + '/wp-login.php'], ['admin', b.base + '/wp-admin/'], ['frontend', b.frontend]]) {
    await test('subdirectory enforced ' + name + ' starts IAM automatically', async () => {
      const isolated = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(isolated);
      const tab = await isolated.newPage();
      await tab.goto(target);
      await tab.locator('#username').waitFor();
      assert.equal(new URL(tab.url()).port, '8083');
    });
  }
  await test('subdirectory enforced callback preserves protected destination and original local account', async () => {
    const isolated = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(isolated);
    const tab = await isolated.newPage();
    await tab.goto(b.protected);
    await iamLogin(tab, 'shopper');
    await tab.waitForURL(b.protected);
    assert.equal(Number(await tab.locator('#fixture-identity').getAttribute('data-user')), bUser);
    assert.equal(wp(b, 'echo implode(",",get_userdata(' + bUser + ')->roles);'), 'subscriber');
    await siteLogout(b, tab);
    assert.equal(await identity(b, tab), 0);
    await tab.goto(b.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(b.protected));
    await tab.waitForURL(b.protected);
    assert.equal(Number(await tab.locator('#fixture-identity').getAttribute('data-user')), bUser);
  });
  await test('enforced shared logout ends matching peer sessions and preserves another IAM browser device', async () => {
    const otherContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(otherContext);
    const other = await otherContext.newPage();
    await other.goto(a.protected); await iamLogin(other, 'shopper');
    assert.equal(await identity(a, other), a.legacyUser);
    const sharedContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(sharedContext);
    const shared = await sharedContext.newPage();
    await shared.goto(b.protected); await iamLogin(shared, 'shopper');
    await shared.goto(a.protected); await shared.waitForURL(a.protected);
    assert.equal(await identity(a, shared), a.legacyUser);
    await allLogout(b, shared);
    assert.equal(await identity(a, shared), 0); assert.equal(await identity(b, shared), 0);
    assert.equal(await identity(a, other), a.legacyUser);
  });
  await test('unavailable backchannel peer retains a bounded session and shared IAM still ends', async () => {
    const outageContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(outageContext);
    const outage = await outageContext.newPage();
    await outage.goto(b.protected); await iamLogin(outage, 'shopper');
    await outage.goto(a.protected); await outage.waitForURL(a.protected);
    wp(b, 'update_option("alwp_fixture_delivery_attempts",0);update_option("alwp_fixture_backchannel_outage",1);');
    try {
      await allLogout(a, outage);
      assert(Number(wp(b, 'echo get_option("alwp_fixture_delivery_attempts");')) >= 1);
      assert.equal(await identity(a, outage), 0);
      assert.equal(await identity(b, outage), bUser);
      const bound = JSON.parse(wp(b, '$sessions=WP_Session_Tokens::get_instance(' + bUser + ')->get_all();echo wp_json_encode(["now"=>time(),"max"=>max(array_column($sessions,"expiration"))]);'));
      assert(bound.max > bound.now && bound.max <= bound.now + 3600);
    } finally { wp(b, 'delete_option("alwp_fixture_backchannel_outage");'); }
    await siteLogout(b, outage);
    await outage.goto(b.base + '/wp-login.php?action=al_start');
    await outage.locator('#username').waitFor();
  });
  await qualifyUpgrade({ test, browser, browsers, fixture, a, wp, wpCommand, iamLogin, identity,
    stage: value => { phase = value; }, diagnose: value => { diagnostic = value; } });
} finally {
  writeFileSync(fixture.artifactDir + '/browser-report.json', JSON.stringify({
    engine: 'actual Keycloak + unchanged AccessLobby API + real WordPress/WooCommerce',
    sites: fixture.sites.map(s => ({ label: s.label, base: s.base, client: s.client })), cases,
  }, null, 2) + '\n');
  for (const ctx of browsers) await ctx.close();
  await browser.close();
}
