/** Own-app grant qualification extension for the parent's synthetic signed OIDC,
 * real isolated PostgreSQL/API and production Next browser. No live acceptance. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function runApplicationGrantsSmoke({ browser, pool, issuer, apiOrigin, origin, mint, contextFor, check, noPrivateValues }) {
  assert(browser && typeof mint === 'function');
  for (const endpoint of [issuer, apiOrigin, origin]) assert(['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname));
  const secrets = new Set();
  function privateAbsent(value) {
    noPrivateValues(value);
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    for (const secret of secrets) assert(!text.includes(secret), 'Private grant-fixture authentication reached a response');
  }
  const actors = Object.fromEntries(['owner', 'foreign', 'target', 'control'].map(name => [name, {
    id: randomUUID(), subject: 'private-grant-subject-' + randomUUID(), sid: 'private-grant-sid-' + randomUUID(),
  }]));
  for (const actor of Object.values(actors)) {
    secrets.add(actor.subject); secrets.add(actor.sid);
    await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [actor.id]);
    await pool.query('INSERT INTO iam_subject_links(issuer,subject,person_id) VALUES($1,$2,$3)', [issuer, actor.subject, actor.id]);
  }
  async function signed(actor, client = 'accesslobby-web') { const token = await mint(actor, client); secrets.add(token); return token; }
  const ownerToken = await signed(actors.owner), foreignToken = await signed(actors.foreign);
  async function json(path, token, status = 200, init = {}) {
    const response = await fetch(apiOrigin + path, { ...init, headers: { ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }, signal: AbortSignal.timeout(6000) });
    assert.equal(response.status, status, 'Unexpected own-app-grants status for ' + path);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const body = await response.json(); privateAbsent(body); return body;
  }
  const post = value => ({ method: 'POST', body: JSON.stringify(value) });
  async function fixtureApp(name, suffix) {
    const app = await json('/v1/applications', ownerToken, 201, post({ name, clientId: 'grants-' + suffix + '-' + randomUUID(), platform: 'web',
      redirectUri: 'https://' + suffix + '.grants.example.test/callback', logoutUri: 'https://' + suffix + '.grants.example.test/', visibility: 'hidden', admission: 'grant_required' }));
    // Synthetic prior-reviewed active registry/DNS fixture, not live provisioning.
    await pool.query(`UPDATE applications SET status='active',trust_class='first_party',activated_at=clock_timestamp(),
      origin_verified_at=clock_timestamp(),origin_verified_host=$2,review_reference='grants-synthetic-active' WHERE id=$1`, [app.id, app.originVerificationHost]);
    return { ...app, name };
  }
  const app = await fixtureApp('Owned grant management fixture', 'entry'), pagingApp = await fixtureApp('Grant pagination fixture', 'paging');
  const targetToken = await signed(actors.target, app.clientId), controlToken = await signed(actors.control, app.clientId);
  const ownerContext = await contextFor(ownerToken), foreignContext = await contextFor(foreignToken);
  const page = await ownerContext.newPage(), foreignPage = await foreignContext.newPage();
  page.setDefaultTimeout(15000); foreignPage.setDefaultTimeout(15000);
  let runtimeErrors = 0;
  for (const view of [page, foreignPage]) view.on('pageerror', () => { runtimeErrors++; });
  const route = `/apps/manage/${app.id}/grants`, apiRoute = `/v1/applications/${app.id}/grants`;
  const summary = { nativeUtcGrant: false, realClockExpiryDenied: false, nativeRenewal: false, nativeRevocation: false,
    paginatedOwnerList: false, foreignOwnerDenied: false, csrfDenied: false, runtimeErrors: 0,
    liveIam: 'NOT RUN', staging: 'NOT RUN', production: 'NOT RUN' };
  async function grantPage(path = route) {
    const entry = await page.goto(origin + path, { waitUntil: 'domcontentloaded' });
    assert.match(entry.headers()['cache-control'] ?? '', /no-store/);
    await page.getByRole('heading', { name: 'App entry grants', exact: true }).waitFor({ state: 'visible' });
    privateAbsent(await page.content());
  }
  async function confirm(button, destination) {
    const finished = page.waitForURL(destination);
    await button.click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Confirm this change' });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: 'Confirm change', exact: true }).click(); await finished;
  }
  function grantRow(person) { return page.getByRole('region', { name: 'Application entry grants', exact: true }).locator('tbody tr').filter({ hasText: person }); }

  await check('own-app grants real API preserves owner privacy, strict UTC validation and bounded stored-grant pages', async () => {
    await json(apiRoute, foreignToken, 404);
    await json(apiRoute, targetToken, 403); // An app token does not gain first-party management access.
    await json(apiRoute, foreignToken, 404, post({ personId: actors.target.id }));
    await json(`${apiRoute}/${actors.target.id}`, foreignToken, 404, { method: 'DELETE' });
    const futureYear = new Date().getUTCFullYear() + 2;
    for (const expiry of ['tomorrow', '2000-01-01T00:00:00Z', `${futureYear}-02-30T12:00:00Z`]) {
      const rejected = await json(apiRoute, ownerToken, 400, post({ personId: actors.target.id, expiresAt: expiry }));
      assert.equal(rejected.error, 'invalid_expiry');
    }
    assert.equal((await json(apiRoute, ownerToken)).grants.length, 0);
    await json(apiRoute, ownerToken, 201, post({ personId: actors.control.id }));
    assert.equal((await json('/v1/application-entry', controlToken)).admitted, true);
    const targets = [];
    // Extra persisted fixtures exercise read bounds; these are not claimed as
    // browser-created or live user grants.
    for (let i = 0; i < 26; i++) {
      const id = randomUUID(); targets.push(id);
      await pool.query("INSERT INTO persons(id,status) VALUES($1,'active')", [id]);
      await pool.query(`INSERT INTO application_grants(application_id,person_id,status,granted_by)
        VALUES($1,$2,'active',$3)`, [pagingApp.id, id, actors.owner.id]);
    }
    const first = await json(`/v1/applications/${pagingApp.id}/grants`, ownerToken);
    assert.equal(first.contract, 'accesslobby.application-grants.v0.1'); assert.equal(first.grants.length, 25); assert(first.nextCursor);
    const second = await json(`/v1/applications/${pagingApp.id}/grants?after=${first.nextCursor}`, ownerToken);
    assert.equal(second.grants.length, 1); assert.equal(second.nextCursor, null);
    assert.deepEqual([...first.grants, ...second.grants].map(row => row.personId), targets.sort());
    await json(apiRoute + '?after=invalid', ownerToken, 400);
    await grantPage(`/apps/manage/${pagingApp.id}/grants`);
    const region = page.getByRole('region', { name: 'Application entry grants', exact: true });
    assert.equal(await region.locator('tbody tr').count(), 25);
    const next = page.waitForURL(url => url.searchParams.has('after'));
    await page.getByRole('link', { name: 'Next page', exact: true }).click(); await next;
    await region.locator('tbody tr').nth(1).waitFor({ state: 'detached' }); assert.equal(await region.locator('tbody tr').count(), 1);
    summary.paginatedOwnerList = true; summary.foreignOwnerDenied = true;
  });

  await check('native own-app UTC grant rejects impossible calendar input and actually expires without a stored-state rewrite', async () => {
    await grantPage();
    await page.getByLabel('Person ID', { exact: true }).fill(actors.target.id);
    const invalidDate = `${new Date().getUTCFullYear() + 2}-02-30T12:00:00Z`;
    await page.getByLabel('Expiry (UTC, optional)', { exact: true }).fill(invalidDate);
    await confirm(page.getByRole('button', { name: 'Grant or renew entry', exact: true }), '**/grants?notice=invalid_expiry');
    assert(!(await json(apiRoute, ownerToken)).grants.some(row => row.personId === actors.target.id));
    await page.getByLabel('Person ID', { exact: true }).fill(actors.target.id);
    const expiry = new Date(Date.now() + 8000).toISOString();
    await page.getByLabel('Expiry (UTC, optional)', { exact: true }).fill(expiry);
    await confirm(page.getByRole('button', { name: 'Grant or renew entry', exact: true }), '**/grants?notice=granted');
    const granted = (await json(apiRoute, ownerToken)).grants.find(row => row.personId === actors.target.id);
    assert.equal(granted.expiresAt, expiry); assert.equal(granted.status, 'active'); assert.equal(granted.expired, false);
    assert.equal((await json('/v1/application-entry', targetToken)).admitted, true); summary.nativeUtcGrant = true;
    await grantRow(actors.target.id).getByText(expiry.replace('.000Z', 'Z') + ' UTC', { exact: true }).waitFor({ state: 'visible' });
    // This is a real eight-second UTC boundary, not an UPDATE to simulate expiry.
    while (Date.now() <= Date.parse(expiry) + 30) await new Promise(resolve => setTimeout(resolve, 100));
    const denied = await json('/v1/application-entry', targetToken, 403); assert.equal(denied.error, 'application_entry_denied');
    const expired = (await json(apiRoute, ownerToken)).grants.find(row => row.personId === actors.target.id);
    assert.equal(expired.status, 'active'); assert.equal(expired.expired, true); assert.equal(expired.expiresAt, expiry);
    await grantPage(); await grantRow(actors.target.id).getByText('Expired', { exact: true }).waitFor({ state: 'visible' });
    assert.match(await grantRow(actors.target.id).locator('td').nth(1).innerText(), /^active\s+Expired$/);
    assert.equal((await json('/v1/application-entry', controlToken)).admitted, true); summary.realClockExpiryDenied = true;
  });

  await check('native grant renewal and revocation affect only the selected person while foreign owner and CSRF actions fail', async () => {
    const renew = page.waitForURL(url => url.searchParams.get('personId') === actors.target.id);
    await grantRow(actors.target.id).getByRole('link', { name: 'Renew', exact: true }).click(); await renew;
    assert.equal(await page.getByLabel('Person ID', { exact: true }).inputValue(), actors.target.id);
    assert((await page.getByLabel('Expiry (UTC, optional)', { exact: true }).inputValue()).endsWith('Z'));
    await page.getByLabel('Expiry (UTC, optional)', { exact: true }).fill('');
    await confirm(page.getByRole('button', { name: 'Grant or renew entry', exact: true }), '**/grants?notice=granted');
    const renewed = (await json(apiRoute, ownerToken)).grants.find(row => row.personId === actors.target.id);
    assert.equal(renewed.expiresAt, null); assert.equal(renewed.expired, false); assert.equal(renewed.status, 'active');
    assert.equal((await json('/v1/application-entry', targetToken)).admitted, true); summary.nativeRenewal = true;
    const csrf = await ownerContext.request.post(origin + '/apps/action', { headers: { origin: 'https://unrelated.example.test' }, maxRedirects: 0,
      form: { intent: 'revoke', applicationId: app.id, personId: actors.target.id, grantView: 'detail' } });
    assert.equal(csrf.status(), 403); assert.match(csrf.headers()['cache-control'] ?? '', /no-store/);
    assert.equal((await json('/v1/application-entry', targetToken)).admitted, true); summary.csrfDenied = true;
    const foreignEntry = await foreignPage.goto(origin + route, { waitUntil: 'domcontentloaded' });
    assert.match(foreignEntry.headers()['cache-control'] ?? '', /no-store/);
    await foreignPage.getByRole('heading', { name: /find your way back/i }).waitFor({ state: 'visible' });
    assert.equal(await foreignPage.getByRole('region', { name: 'Application entry grants', exact: true }).count(), 0);
    assert(!(await foreignPage.content()).includes(actors.target.id)); privateAbsent(await foreignPage.content());
    await confirm(grantRow(actors.target.id).getByRole('button', { name: `Revoke entry for ${actors.target.id}`, exact: true }), '**/grants?notice=revoked');
    const revoked = (await json(apiRoute, ownerToken)).grants.find(row => row.personId === actors.target.id);
    assert.equal(revoked.status, 'revoked'); assert.equal(revoked.expired, false); assert(revoked.revokedAt);
    await grantRow(actors.target.id).getByText('revoked', { exact: true }).waitFor({ state: 'visible' });
    await json('/v1/application-entry', targetToken, 403);
    assert.equal((await json('/v1/application-entry', controlToken)).admitted, true);
    assert.equal((await json(apiRoute, ownerToken)).grants.find(row => row.personId === actors.control.id).status, 'active');
    summary.nativeRevocation = true; privateAbsent(await page.content());
    assert.equal(runtimeErrors, 0, 'Unexpected own-app grant browser error');
  });
  summary.runtimeErrors = runtimeErrors;
  return summary;
}
