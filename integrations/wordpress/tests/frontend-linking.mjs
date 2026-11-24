/** Public WordPress/browser APIs against disposable sites; never packaged. */
import assert from 'node:assert/strict';

async function isolated(suite, viewport) {
  const context = await suite.browser.newContext({ ignoreHTTPSErrors: true, ...(viewport ? { viewport } : {}) });
  suite.browsers.push(context);
  return { context, tab: await context.newPage() };
}
function linkState(suite) {
  return JSON.parse(suite.wp(suite.a, '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);$u=get_userdata(' + suite.a.legacyUser + ');' +
    'echo wp_json_encode(["link"=>$s->link_for_user($u->ID),"roles"=>$u->roles,"count"=>count_users()["total_users"],' +
    '"address"=>get_user_meta($u->ID,"billing_address_1",true),"business"=>get_user_meta($u->ID,"fixture_b2b_approved",true)' +
    (suite.a.woo ? ',"orderCustomer"=>wc_get_order(' + suite.a.orderId + ')->get_customer_id(),"orderTotal"=>wc_get_order(' + suite.a.orderId + ')->get_total()' : '') + ']);'));
}
async function submitProof(suite, tab, username) {
  await tab.locator('#password').waitFor();
  if (await tab.locator('#username').isVisible()) await tab.locator('#username').fill(username);
  else assert.equal((await tab.locator('#kc-attempted-username').innerText()).trim(), username);
  await tab.locator('#password').fill(suite.fixture.password);
  await tab.locator('#kc-login').click();
}

export async function qualifyHybrid(s) {
  const { test, a, b, page, context, wp, iamLogin, identity, localLogin, stage } = s;
  for (const site of [a, b]) {
    await test('shortcode and dynamic block preserve private entry URLs on independent site ' + site.label, async () => {
      const { tab } = await isolated(s);
      for (const [target, intents] of [[site.shortcodes, ['login', 'join']], [site.loginBlock, ['login']]]) {
        const response = await tab.goto(target);
        assert.match(response.headers()['cache-control'], /private.*no-store/);
        const links = await tab.locator('a[data-accesslobby-start]').evaluateAll(elements => elements.map(e => e.href));
        assert.equal(links.length, intents.length);
        assert.deepEqual(links.map(href => new URL(href).searchParams.get('intent')).sort(), [...intents].sort());
        for (const href of links) {
          const url = new URL(href);
          assert.equal(url.origin, new URL(site.base).origin);
          assert.equal(url.pathname, new URL(site.base + '/wp-login.php').pathname);
          assert.equal(url.searchParams.get('action'), 'al_start');
          assert.equal(url.searchParams.get('redirect_to'), target);
        }
      }
    });
  }
  await test('shortcode Join reaches real registration without creating an unvalidated local user', async () => {
    const { tab } = await isolated(s);
    const count = wp(a, 'echo count_users()["total_users"];');
    await tab.goto(a.shortcodes);
    await tab.locator('a[data-accesslobby-start][href*="intent=join"]').click();
    await tab.locator('#kc-register-form').waitFor();
    assert.equal(wp(a, 'echo count_users()["total_users"];'), count);
  });
  await test('mobile mounted login adapter inserts one action and completes the original journey', async () => {
    const { tab } = await isolated(s, { width: 390, height: 844 });
    await tab.goto(a.modal);
    assert.equal(await tab.locator('a[data-accesslobby-start]').count(), 0);
    await tab.getByRole('button', { name: 'Open sign in', exact: true }).click();
    const link = tab.getByRole('link', { name: 'Continue with AccessLobby', exact: true });
    await link.waitFor();
    await tab.getByRole('button', { name: 'Open sign in', exact: true }).click();
    assert.equal(await link.count(), 1);
    await link.click(); await iamLogin(tab, 'shopper');
    await tab.waitForURL(a.modal);
    assert.equal(await identity(a, tab), a.legacyUser);
  });
  await test('disconnect rejects a missing WordPress nonce and preserves the active mapping', async () => {
    await page.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.account));
    await page.waitForURL(a.account);
    const response = await context.request.post(a.base + '/wp-login.php?action=al_start', { form: { intent: 'unlink' } });
    assert.equal(response.status(), 400);
    assert.equal(linkState(s).link.link_state, 'active');
    assert.equal(await identity(a), a.legacyUser);
  });
  await test('a different freshly authenticated person cannot disconnect the existing local account', async () => {
    const { tab } = await isolated(s);
    await localLogin(a, 'legacy_shopper', tab);
    await tab.getByRole('button', { name: 'Disconnect AccessLobby', exact: true }).click();
    stage('different_identity_proof'); await submitProof(s, tab, 'staff');
    await tab.getByText('account_link_conflict', { exact: true }).waitFor();
    assert.equal(linkState(s).link.link_state, 'active');
    assert.equal(await identity(a, tab), a.legacyUser);
  });
  await test('disconnect loses authority when the original local browser proof disappears', async () => {
    const { tab, context: lost } = await isolated(s);
    await localLogin(a, 'legacy_shopper', tab);
    await tab.getByRole('button', { name: 'Disconnect AccessLobby', exact: true }).click();
    await tab.locator('#username').waitFor();
    await lost.clearCookies({ name: /^wordpress_/ });
    stage('lost_local_proof'); await submitProof(s, tab, 'shopper');
    await tab.getByText('invalid_local_proof', { exact: true }).waitFor();
    assert.equal(linkState(s).link.link_state, 'active');
  });
  let localControl;
  await test('bounded OIDC denial leaves the original account link and local session intact', async () => {
    localControl = await isolated(s);
    await localLogin(a, 'legacy_shopper', localControl.tab);
    await localControl.tab.getByRole('button', { name: 'Disconnect AccessLobby', exact: true }).click();
    await localControl.tab.locator('#username').waitFor();
    const callback = new URL(a.base + '/wp-login.php');
    callback.searchParams.set('action', 'al_callback');
    callback.searchParams.set('state', new URL(localControl.tab.url()).searchParams.get('state'));
    callback.searchParams.set('error', 'access_denied');
    const response = await localControl.tab.goto(callback.href);
    assert.equal(response.status(), 400);
    assert.equal(linkState(s).link.link_state, 'active');
    assert.equal(await identity(a, localControl.tab), a.legacyUser);
  });
  let retained;
  await test('fresh disconnect invalidates linked sessions while preserving commerce and the peer site', async () => {
    const other = await isolated(s);
    stage('other_linked_session');
    await other.tab.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.account));
    await iamLogin(other.tab, 'shopper');
    assert.equal(await identity(a, other.tab), a.legacyUser);
    retained = linkState(s);
    stage('disconnect_form');
    await page.goto(a.account);
    await page.getByRole('button', { name: 'Disconnect AccessLobby', exact: true }).click();
    // Keycloak's fresh reauthentication retains the current username and asks for its password.
    stage('fresh_disconnect'); await submitProof(s, page, 'shopper');
    await page.waitForURL(a.account);
    assert.equal(await identity(a), 0);
    assert.equal(await identity(a, other.tab), 0);
    assert.equal(await identity(a, localControl.tab), a.legacyUser);
    assert.equal(await identity(b), s.bUser);
    const after = linkState(s);
    assert.equal(after.link.link_state, 'unlinked');
    assert.equal(after.link.id, retained.link.id);
    for (const key of ['roles', 'count', 'address', 'business', ...(a.woo ? ['orderCustomer', 'orderTotal'] : [])]) assert.deepEqual(after[key], retained[key]);
  });
  await test('unlinked SSO cannot silently recreate or reactivate a local account', async () => {
    await page.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.account));
    await page.getByText('account_link_required', { exact: true }).waitFor();
    assert.equal(await identity(a), 0);
    const after = linkState(s);
    assert.equal(after.link.link_state, 'unlinked'); assert.equal(after.count, retained.count);
  });
  await test('explicit fresh reconnect reuses the original local user and mapping without duplicates', async () => {
    await localControl.tab.goto(a.account);
    await localControl.tab.getByRole('button', { name: 'Connect AccessLobby', exact: true }).click();
    stage('fresh_reconnect'); await iamLogin(localControl.tab, 'shopper');
    assert.equal(await identity(a, localControl.tab), a.legacyUser);
    const after = linkState(s);
    assert.equal(after.link.link_state, 'active'); assert.equal(after.link.id, retained.link.id);
    assert.equal(after.count, retained.count); assert.deepEqual(after.roles, retained.roles);
    await page.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.account));
    await page.waitForURL(a.account); assert.equal(await identity(a), a.legacyUser);
  });
}

export async function qualifyEditor(s) {
  const { test, a, admin, wp, stage } = s;
  await test('real Gutenberg Journey control saves and reloads a Join block that reaches IAM', async () => {
    const postId = Number(new URL(a.loginBlock).searchParams.get('page_id'));
    assert(postId > 0);
    stage('editor_load');
    await admin.goto(a.base + '/wp-admin/post.php?post=' + postId + '&action=edit');
    await admin.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.some(b => b.name === 'accesslobby/login'));
    await admin.evaluate(() => {
      const block = wp.data.select('core/block-editor').getBlocks().find(b => b.name === 'accesslobby/login');
      wp.data.dispatch('core/block-editor').selectBlock(block.clientId);
    });
    let journey;
    for (let attempt = 0; attempt < 100 && !journey; attempt++) {
      for (const frame of admin.frames()) {
        const candidate = frame.getByLabel('Journey', { exact: true });
        if (await candidate.count()) { journey = candidate; break; }
      }
      if (!journey) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(journey, 'Registered block did not render its Journey control');
    stage('editor_change'); await journey.selectOption('join');
    await admin.waitForFunction(() => wp.data.select('core/block-editor').getBlocks().find(b => b.name === 'accesslobby/login')?.attributes.intent === 'join');
    stage('editor_save'); await admin.evaluate(async () => { await wp.data.dispatch('core/editor').savePost(); });
    await admin.waitForFunction(() => !wp.data.select('core/editor').isSavingPost() && !wp.data.select('core/editor').isEditedPostDirty());
    assert.match(wp(a, 'echo get_post(' + postId + ')->post_content;'), /"intent":"join"/);
    stage('editor_reload'); await admin.reload();
    await admin.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks()?.some(b => b.name === 'accesslobby/login' && b.attributes.intent === 'join'));
    const { tab } = await isolated(s);
    const count = wp(a, 'echo count_users()["total_users"];');
    const response = await tab.goto(a.loginBlock);
    assert.match(response.headers()['cache-control'], /private.*no-store/);
    await tab.locator('a[data-accesslobby-start][href*="intent=join"]').click();
    stage('block_join'); await tab.locator('#kc-register-form').waitFor();
    assert.equal(wp(a, 'echo count_users()["total_users"];'), count);
  });
}

export async function qualifyEnforced(s) {
  const { test, a, identity, iamLogin } = s;
  await test('an unrelated form named login remains usable in enforced mode', async () => {
    const { tab } = await isolated(s);
    await tab.goto(a.modal);
    assert.equal(await tab.locator('a[data-accesslobby-start]').count(), 0);
    await tab.getByLabel('Search fixture', { exact: true }).fill('public-search');
    await Promise.all([tab.waitForURL(url => url.origin === new URL(a.base).origin && url.searchParams.get('fixture_query') === 'public-search'),
      tab.getByRole('button', { name: 'Search fixture', exact: true }).click()]);
    assert.equal(await tab.locator('#fixture-identity').getAttribute('data-user'), '0');
    assert.equal(await tab.locator('#username').count(), 0);
  });
  await test('mobile mounted login starts enforced SSO without an extra AccessLobby click', async () => {
    const { tab } = await isolated(s, { width: 390, height: 844 });
    await tab.goto(a.modal);
    await tab.getByRole('button', { name: 'Open sign in', exact: true }).click();
    await tab.locator('#username').waitFor();
    await iamLogin(tab, 'shopper'); await tab.waitForURL(a.modal);
    assert.equal(await identity(a, tab), a.legacyUser);
  });
  await test('enforced unlink is hidden and rejected even with a valid current WordPress nonce', async () => {
    const { tab, context } = await isolated(s);
    await tab.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.account));
    await iamLogin(tab, 'shopper');
    assert.equal(await identity(a, tab), a.legacyUser);
    assert.equal(await tab.getByRole('button', { name: 'Disconnect AccessLobby', exact: true }).count(), 0);
    const nonce = await tab.locator('#fixture-unlink-nonce').inputValue();
    const response = await context.request.post(a.base + '/wp-login.php?action=al_start', { form: { intent: 'unlink', _wpnonce: nonce } });
    assert.equal(response.status(), 400);
    assert.match(await response.text(), /host_recovery_required/);
    assert.equal(linkState(s).link.link_state, 'active'); assert.equal(await identity(a, tab), a.legacyUser);
  });
}

export async function qualifyDedicatedLogin(s, site, expectedUser = site.legacyUser) {
  const { test, browser, browsers, iamLogin, identity } = s;
  const noScript = async () => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, javaScriptEnabled: false });
    browsers.push(context); return { context, tab: await context.newPage() };
  };
  for (const [name, url] of [['shortcode', site.shortcodes], ['block', site.loginBlock]]) {
    await test(site.label + ' dedicated ' + name + ' page starts SSO server-side without JavaScript', async () => {
      const { tab, context } = await noScript();
      const redirect = await context.request.get(url, { maxRedirects: 0 });
      assert.equal(redirect.status(), 303); assert.match(redirect.headers()['cache-control'], /private.*no-store/);
      await tab.goto(url);
      await tab.locator('#username').waitFor();
      assert.equal(new URL(tab.url()).origin, new URL(s.fixture.issuer).origin);
      await iamLogin(tab, 'shopper'); await tab.waitForURL(site.base + '/');
      assert.equal(await identity(site, tab), expectedUser);
    });
  }
  await test(site.label + ' dedicated login preserves a protected destination without JavaScript', async () => {
    const { tab } = await noScript();
    await tab.goto(site.shortcodes + '&redirect_to=' + encodeURIComponent(site.protected));
    await iamLogin(tab, 'shopper'); await tab.waitForURL(site.protected);
    assert.equal(await identity(site, tab), expectedUser);
  });
  await test(site.label + ' dedicated login rejects a foreign return target', async () => {
    const { tab } = await noScript();
    await tab.goto(site.loginBlock + '&redirect_to=' + encodeURIComponent('https://unrelated.example.test/account'));
    await iamLogin(tab, 'shopper'); await tab.waitForURL(site.base + '/');
    assert.equal(await identity(site, tab), expectedUser);
  });
  await test(site.label + ' public page containing a login action stays public in enforced mode', async () => {
    const { tab } = await noScript();
    const response = await tab.goto(site.publicEntry);
    assert.equal(response.status(), 200); assert.equal(tab.url(), site.publicEntry);
    assert.equal(await tab.locator('a[data-accesslobby-start]').count(), 1);
    assert.equal(await tab.locator('#fixture-identity').getAttribute('data-user'), '0');
  });
}

export async function qualifyUpgrade(s) {
  const { test, a, fixture, wp, wpCommand, iamLogin, identity, stage, diagnose } = s;
  const version = () => wp(a, 'echo get_file_data(WP_PLUGIN_DIR . "/accesslobby-sso/accesslobby-sso.php",["Version"=>"Version"])["Version"];');
  const observed = {};
  const runningVersion = async (tab, expected, target) => {
    // A host's CLI updater and web PHP process may have separate opcode caches.
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await tab.goto(target);
      observed.runtimeStatus = response?.status();
      // A cached newer bootstrap can briefly refer to a removed class during a
      // CLI-driven downgrade. Retry the complete request, never wait on a 500 page.
      observed.runningVersion = await tab.locator('#fixture-runtime').count() ?
        await tab.locator('#fixture-runtime').getAttribute('data-plugin-version') : null;
      diagnose({ ...observed });
      if (observed.runningVersion === expected) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.equal(observed.runningVersion, expected);
  };
  await test('real alpha.6 to alpha.8 ZIP upgrade preserves an established SSO session and local data', async () => {
    try {
      stage('install_previous_qualified_zip');
      wpCommand(a, ['plugin', 'install', fixture.upgradePackage, '--force']);
      wpCommand(a, ['plugin', 'is-active', 'accesslobby-sso']);
      observed.headerVersion = version(); diagnose({ ...observed });
      assert.equal(observed.headerVersion, '0.1.0-alpha.6');
      const { tab } = await isolated(s);
      stage('previous_web_runtime'); await runningVersion(tab, '0.1.0-alpha.6', a.modal);
      stage('previous_session_login');
      await tab.goto(a.protected); await iamLogin(tab, 'shopper');
      assert.equal(await identity(a, tab), a.legacyUser);
      assert.equal(await tab.locator('#fixture-runtime').getAttribute('data-plugin-version'), '0.1.0-alpha.6');
      const before = linkState(s);
      stage('upgrade_current_zip');
      wpCommand(a, ['plugin', 'install', fixture.package, '--force']);
      wpCommand(a, ['plugin', 'is-active', 'accesslobby-sso']);
      observed.headerVersion = version(); diagnose({ ...observed });
      assert.equal(observed.headerVersion, '0.1.0-alpha.8');
      stage('upgraded_web_runtime'); await runningVersion(tab, '0.1.0-alpha.8', a.account);
      assert.equal(await identity(a, tab), a.legacyUser);
      assert.equal(await tab.locator('#fixture-runtime').getAttribute('data-plugin-version'), '0.1.0-alpha.8');
      const after = linkState(s);
      assert.equal(after.link.id, before.link.id); assert.equal(after.link.link_state, 'active');
      for (const key of ['roles', 'count', 'address', 'business', ...(a.woo ? ['orderCustomer', 'orderTotal'] : [])]) assert.deepEqual(after[key], before[key]);
    } finally {
      // Restore the disposable site's candidate even if an upgrade assertion fails.
      if (version() !== '0.1.0-alpha.8') wpCommand(a, ['plugin', 'install', fixture.package, '--force', '--activate']);
    }
  });
}
