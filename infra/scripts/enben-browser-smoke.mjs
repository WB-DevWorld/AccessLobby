/** Browser UI qualification with signed fixture IAM/API. Real IAM is a separate CI pass. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { notesFixture } from '../../examples/reference-consumer/test/notes-fixture.mjs';

const fixture = await notesFixture();
let browser;
try {
  browser = await chromium.launch();
  const alice = await browser.newContext(), bob = await browser.newContext();
  const a = await alice.newPage(), b = await bob.newPage();
  const signIn = async (page, user) => {
    fixture.setBrowserUser(user);
    await page.goto(fixture.origin);
    await page.getByRole('link', { name: 'Sign in with AccessLobby' }).click();
    await page.getByRole('button', { name: 'Create my account for this app' }).click();
    await page.getByRole('heading', { name: 'Your notes', exact: true, level: 1 }).waitFor();
  };
  await signIn(a, 'alice'); await signIn(b, 'bob');
  await a.getByLabel('Title', { exact: true }).fill('Alice private note');
  await a.getByLabel('Note', { exact: true }).fill('A simple protected-access test.');
  await a.getByRole('button', { name: 'Save note', exact: true }).click();
  const link = a.getByRole('link', { name: 'Alice private note' });
  const notePath = await link.getAttribute('href');
  await link.click();
  await a.getByLabel('Note', { exact: true }).fill('Changes saved.');
  await a.getByRole('button', { name: 'Save changes' }).click();
  assert.equal((await b.goto(`${fixture.origin}${notePath}`)).status(), 404);
  await b.getByRole('heading', { name: 'Note not found', exact: true }).waitFor();
  await b.goto(`${fixture.origin}/notes`);
  assert.equal(await b.getByRole('link', { name: 'Alice private note' }).count(), 0);
  await a.goto(`${fixture.origin}/notes`);
  for (const width of [360, 390, 412, 768, 1366, 1440]) {
    await a.setViewportSize({ width, height: 900 });
    assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Reflow at ${width}`);
    const button = await a.getByRole('button', { name: 'Save note', exact: true }).boundingBox();
    assert.ok(button.height >= 44);
  }
  await a.getByLabel('Title', { exact: true }).focus();
  assert.equal(await a.getByLabel('Title', { exact: true }).evaluate(element => element === document.activeElement), true);
  fixture.setEntry('unavailable');
  assert.equal((await a.goto(`${fixture.origin}${notePath}`)).status(), 503);
  await a.getByRole('heading', { name: 'App entry check unavailable' }).waitFor();
  fixture.setEntry('allowed');
  await a.goto(`${fixture.origin}${notePath}`);
  assert.equal(await a.getByLabel('Note', { exact: true }).inputValue(), 'Changes saved.');
  await a.getByRole('button', { name: 'Delete note' }).click();
  assert.equal(await a.getByRole('link', { name: 'Alice private note' }).count(), 0);
  await a.getByRole('button', { name: 'Sign out of Enben', exact: true }).click();
  await a.getByRole('heading', { name: 'A little room for your notes.' }).waitFor();
  assert.equal((await a.goto(`${fixture.origin}/notes`)).status(), 401);
  console.info('ENBEN_BROWSER_PASS save edit delete two-account-denial no-store outage reconnect local-logout six-widths keyboard-focus touch-target');
} finally { await browser?.close(); await fixture.close(); }
