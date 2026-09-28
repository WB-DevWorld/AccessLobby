#!/usr/bin/env node
// Public, credential-free browser qualification for the bundled Keycloak theme.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.env.IAM_BROWSER_ORIGIN ?? 'http://127.0.0.1:18080';
const output = process.env.IAM_BROWSER_OUTPUT ?? 'artifacts/iam-theme-browser';
const issuer = `${base}/realms/accesslobby-first-party`;
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 924 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
];
const challenge = 'A'.repeat(43); // PKCE-shaped fixture; no credential or live session.
const authorization = new URL(`${issuer}/protocol/openid-connect/auth`);
for (const [name, value] of Object.entries({
  client_id: 'reference-consumer',
  redirect_uri: 'http://localhost:4000/callback',
  response_type: 'code',
  scope: 'openid',
  code_challenge_method: 'S256',
  code_challenge: challenge,
})) authorization.searchParams.set(name, value);

function requireTrue(condition, message) {
  if (!condition) throw new Error(message);
}

async function inspect(page, kind, colorScheme, viewport) {
  const heading = kind === 'login' ? 'Sign in to AccessLobby' : 'Create your AccessLobby account';
  const body = await page.locator('body').innerText();
  requireTrue(body.includes(heading), `${kind}: missing AccessLobby heading`);
  requireTrue(!body.toUpperCase().includes('ACCESSLOBBY-FIRST-PARTY'), `${kind}: technical realm heading shown`);
  const controls = await page.evaluate(() => {
    const form = document.querySelector('#kc-form-login, #kc-register-form');
    const primary = form?.querySelector('input[type="submit"], button[type="submit"]');
    const rect = primary?.getBoundingClientRect();
    const css = getComputedStyle(document.documentElement);
    return {
      width: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      primary: rect && { left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      enabled: primary && !primary.disabled,
      fields: form?.querySelectorAll('input:not([type="hidden"]):not([type="submit"])').length ?? 0,
      schemeMatches: matchMedia(`(prefers-color-scheme: ${colorScheme})`).matches,
      ink: css.getPropertyValue('--al-ink').trim(),
      surface: css.getPropertyValue('--al-surface').trim(),
    };
  });
  requireTrue(controls.documentWidth <= viewport.width + 1 && controls.bodyWidth <= viewport.width + 1,
    `${kind}: horizontal overflow at ${viewport.width}px (${controls.documentWidth}/${controls.bodyWidth})`);
  requireTrue(controls.fields >= (kind === 'login' ? 2 : 3), `${kind}: form fields unavailable`);
  requireTrue(controls.enabled && controls.primary?.height >= 44 && controls.primary.width >= 44,
    `${kind}: primary control is missing or too small`);
  requireTrue(controls.primary.left >= -1 && controls.primary.right <= viewport.width + 1,
    `${kind}: primary control is clipped`);
  requireTrue(controls.schemeMatches && controls.ink && controls.surface,
    `${kind}: ${colorScheme} theme did not load`);
  return { overflow: false, primaryHeight: Math.round(controls.primary.height),
    ink: controls.ink, surface: controls.surface };
}

async function main() {
  await mkdir(output, { recursive: true });
  const report = { source: 'local branded IAM image', browser: 'Chromium', checks: [], passed: false };
  const browser = await chromium.launch({ headless: true });
  try {
    for (const colorScheme of ['light', 'dark']) {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, colorScheme, reducedMotion: 'reduce', deviceScaleFactor: 1 });
        try {
          for (const kind of ['login', 'registration']) {
            const page = await context.newPage();
            const url = new URL(authorization);
            if (kind === 'registration') url.searchParams.set('prompt', 'create');
            const entry = { kind, colorScheme, viewport, passed: false };
            report.checks.push(entry);
            try {
              const response = await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30_000 });
              requireTrue(response?.status() === 200, `${kind}: unexpected HTTP status ${response?.status()}`);
              await page.evaluate(() => document.fonts.ready);
              const inspected = await inspect(page, kind === 'registration' ? 'registration' : 'login', colorScheme, viewport);
              Object.assign(entry, inspected);
              await page.screenshot({ path: join(output, `${kind}-${viewport.width}x${viewport.height}-${colorScheme}.png`), fullPage: true });
              entry.passed = true;
            } catch (error) {
              entry.reason = error instanceof Error ? error.message : 'browser check failed';
            } finally {
              await page.close();
            }
          }
        } finally {
          await context.close();
        }
      }
    }

    // An unregistered callback is a public error route, safe to exercise without an account.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    try {
      const page = await context.newPage();
      const invalid = new URL(authorization);
      invalid.searchParams.set('redirect_uri', 'http://localhost:4000/unregistered');
      const entry = { kind: 'invalid-redirect', passed: false };
      report.checks.push(entry);
      try {
        const response = await page.goto(invalid.href, { waitUntil: 'networkidle', timeout: 30_000 });
        requireTrue(response?.status() === 400, `error: unexpected status ${response?.status()}`);
        const body = await page.locator('body').innerText();
        requireTrue(!body.toUpperCase().includes('ACCESSLOBBY-FIRST-PARTY'), 'error: realm name shown');
        requireTrue(body.includes('AccessLobby') || body.includes('sign-in'), 'error: no user-facing message');
        await page.screenshot({ path: join(output, 'invalid-redirect-390x844-light.png'), fullPage: true });
        entry.passed = true;
      } catch (error) {
        entry.reason = error instanceof Error ? error.message : 'error page check failed';
      } finally {
        await page.close();
      }

      // Without a session Keycloak may redirect or show an info page. Record the outcome;
      // never imply a completed RP-initiated logout or a backchannel notification.
      const logout = await context.newPage();
      const logoutEntry = { kind: 'unauthenticated-logout-entry', passed: false };
      report.checks.push(logoutEntry);
      try {
        const url = new URL(`${issuer}/protocol/openid-connect/logout`);
        url.searchParams.set('client_id', 'reference-consumer');
        const response = await logout.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        logoutEntry.status = response?.status() ?? null;
        requireTrue([200, 302, 303, 400].includes(logoutEntry.status), 'logout: unexpected status');
        if (logoutEntry.status === 200) {
          const body = await logout.locator('body').innerText();
          requireTrue(!body.toUpperCase().includes('ACCESSLOBBY-FIRST-PARTY'), 'logout: technical realm shown');
          requireTrue(body.includes('AccessLobby'), 'logout: missing AccessLobby branding');
          await logout.screenshot({ path: join(output, 'unauthenticated-logout-390x844-light.png'), fullPage: true });
          logoutEntry.surface = 'branded-page';
        } else {
          logoutEntry.surface = 'no-confirmation-without-session';
        }
        logoutEntry.passed = true;
      } catch (error) {
        logoutEntry.reason = error instanceof Error ? error.message : 'logout entry check failed';
      } finally {
        await logout.close();
      }
    } finally {
      await context.close();
    }

    // Prove that the two responsive color schemes use different product tokens.
    for (const kind of ['login', 'registration']) {
      const light = report.checks.find((entry) => entry.kind === kind && entry.colorScheme === 'light');
      const dark = report.checks.find((entry) => entry.kind === kind && entry.colorScheme === 'dark');
      requireTrue(light?.ink !== dark?.ink && light?.surface !== dark?.surface,
        `${kind}: light and dark tokens are identical`);
    }
    report.passed = report.checks.every((entry) => entry.passed);
  } finally {
    await browser.close();
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  }
  if (!report.passed) throw new Error('Authentication browser qualification failed; see report.json and screenshots');
  console.log(`Authentication browser qualification passed: ${report.checks.length} cases`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
