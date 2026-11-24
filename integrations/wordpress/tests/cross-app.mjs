/** Actual independent TypeScript/Node reference peer with the same real issuer; no mocked identity. */
import assert from 'node:assert/strict';

export async function qualifyCrossApp(s) {
  const { test, browser, browsers, fixture, a, b, wp, iamLogin, identity, siteLogout, allLogout, stage } = s;
  const peer = fixture.referencePeer;
  const context = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(context);
  const tab = await context.newPage();
  const otherContext = await browser.newContext({ ignoreHTTPSErrors: true }); browsers.push(otherContext);
  const other = await otherContext.newPage();
  let peerLocalId;
  const signedIn = () => tab.getByRole('heading', { name: 'You are signed into the reference app', exact: true }).waitFor();
  const signedOut = () => tab.getByRole('heading', { name: 'Sign in to the reference app', exact: true }).waitFor();
  await test('WordPress to independent reference app reuses SSO but retains peer-local account and authorization', async () => {
    stage('wordpress_sign_in'); await tab.goto(a.protected); await iamLogin(tab, 'shopper');
    await tab.goto(b.protected); await tab.waitForURL(b.protected);
    stage('peer_quiet_sso'); await tab.goto(peer + '/login');
    await tab.getByRole('button', { name: 'Create my account for this app', exact: true }).click();
    await signedIn();
    assert.equal(await tab.locator('#username').count(), 0);
    const identifiers = await tab.locator('.identifier-row .code').allTextContents();
    assert.equal(identifiers.length, 2); peerLocalId = identifiers[1];
    const person = wp(a, '$s=new AccessLobby\\WordPress\\Store($GLOBALS["wpdb"]);echo $s->link_for_user(' + a.legacyUser + ')["identity"];');
    assert(identifiers[0] === person && peerLocalId !== String(a.legacyUser));
    assert.equal((await tab.goto(peer + '/private')).status(), 403); // App admission does not grant resource access.
    assert.equal(await identity(a, tab), a.legacyUser);
  });
  await test('local logout in either WordPress or the reference peer preserves the other app and quiet re-entry', async () => {
    stage('peer_local_logout'); await tab.goto(peer + '/'); await signedIn();
    await tab.getByRole('button', { name: 'Sign out of this app', exact: true }).click(); await signedOut();
    assert.equal(await identity(a, tab), a.legacyUser);
    await tab.goto(peer + '/login'); await signedIn();
    assert.equal((await tab.locator('.identifier-row .code').allTextContents())[1], peerLocalId);
    stage('wordpress_local_logout'); await siteLogout(a, tab); assert.equal(await identity(a, tab), 0);
    await tab.goto(peer + '/'); await signedIn();
    await tab.goto(a.base + '/wp-login.php?action=al_start&redirect_to=' + encodeURIComponent(a.account));
    await tab.waitForURL(a.account); assert.equal(await identity(a, tab), a.legacyUser);
  });
  await test('reference-origin shared logout ends both WordPress sessions and preserves another browser', async () => {
    await other.goto(a.protected); await iamLogin(other, 'shopper');
    stage('peer_shared_logout'); await tab.goto(peer + '/'); await signedIn();
    await tab.getByRole('button', { name: 'Sign out of AccessLobby and supported apps', exact: true }).click();
    if (new URL(tab.url()).port === '8083') await tab.locator('#kc-logout').click();
    await tab.waitForURL(peer + '/'); await signedOut();
    assert.equal(await identity(a, tab), 0); assert.equal(await identity(b, tab), 0);
    assert.equal(await identity(a, other), a.legacyUser);
    await tab.goto(a.base + '/wp-login.php?action=al_start'); await tab.locator('#username').waitFor();
  });
  await test('WordPress-origin shared logout ends the reference session and retains its local account on later SSO', async () => {
    stage('reauthenticate_same_browser'); await iamLogin(tab, 'shopper');
    await tab.goto(b.protected); await tab.waitForURL(b.protected);
    await tab.goto(peer + '/login'); await signedIn();
    assert.equal((await tab.locator('.identifier-row .code').allTextContents())[1], peerLocalId);
    stage('wordpress_shared_logout'); await allLogout(a, tab);
    assert.equal(await identity(a, tab), 0); assert.equal(await identity(b, tab), 0);
    await tab.goto(peer + '/'); await signedOut();
    assert.equal((await tab.goto(peer + '/private')).status(), 401);
    assert.equal(await identity(a, other), a.legacyUser);
  });
}
