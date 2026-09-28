'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const baseUrl = (process.env.IAM_BROWSER_BASE_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
const realm = process.env.IAM_REALM || 'accesslobby-first-party';
const clientId = process.env.IAM_BROWSER_CLIENT_ID || 'reference-consumer';
const redirectUri = process.env.IAM_BROWSER_REDIRECT_URI || 'http://localhost:4000/callback';
const outputDir = path.resolve(process.env.IAM_BROWSER_OUTPUT_DIR || 'artifacts/keycloak-theme');
const issuer = `${baseUrl}/realms/${realm}`;
const technicalRealmHeading = realm.toUpperCase();

const viewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '412x924', width: 412, height: 924 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
];

function authenticationUrl(intent, redirect = redirectUri) {
  const url = new URL(`${issuer}/protocol/openid-connect/auth`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('state', `browser-${intent}`);
  url.searchParams.set('nonce', `browser-${intent}`);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', 'A'.repeat(43));
  if (intent === 'register') url.searchParams.set('prompt', 'create');
  return url.toString();
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

async function inspectSurface(page, options) {
  const { expectedText, screenshotName, allowedStatuses = [200], requirePrimaryControl = true } = options;
  const response = await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response) fail(`No navigation response for ${screenshotName}`);
  if (!allowedStatuses.includes(response.status())) {
    fail(`Unexpected HTTP ${response.status()} for ${screenshotName}`, { url: options.url });
  }

  await page.waitForTimeout(250);
  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  if (!bodyText.includes(expectedText)) {
    fail(`Expected text was not visible for ${screenshotName}`, { expectedText, bodyText });
  }
  if (bodyText.toUpperCase().includes(technicalRealmHeading)) {
    fail(`Technical realm heading leaked into ${screenshotName}`, { technicalRealmHeading });
  }

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      viewportWidth: window.innerWidth,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      title: document.title,
    };
  });
  if (layout.rootScrollWidth > layout.rootClientWidth + 1 || layout.bodyScrollWidth > layout.bodyClientWidth + 1) {
    fail(`Horizontal overflow detected for ${screenshotName}`, layout);
  }

  const card = page.locator('.pf-v5-c-login__main, .card-pf, main').first();
  if (await card.count()) {
    const box = await card.boundingBox();
    if (!box || box.width < 260) fail(`Authentication card is unusably narrow for ${screenshotName}`, { box });
    if (box.x < -1 || box.x + box.width > layout.viewportWidth + 1) {
      fail(`Authentication card escapes the viewport for ${screenshotName}`, { box, layout });
    }
  }

  if (requirePrimaryControl) {
    const primary = page.locator('input[type="submit"], button[type="submit"], .pf-v5-c-button.pf-m-primary, .btn-primary').first();
    if (!(await primary.count())) fail(`No primary action was found for ${screenshotName}`);
    const controlBox = await primary.boundingBox();
    if (!controlBox || controlBox.height < 44) {
      fail(`Primary action is below the 44px touch-target floor for ${screenshotName}`, { controlBox });
    }
  }

  await page.screenshot({ path: path.join(outputDir, `${screenshotName}.png`), fullPage: true });
  return { screenshotName, status: response.status(), layout };
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      for (const colorScheme of ['light', 'dark']) {
        if (colorScheme === 'dark' && !['390x844', '1440x900'].includes(viewport.name)) continue;
        const context = await browser.newContext({ viewport, colorScheme, locale: 'en-US' });
        const page = await context.newPage();
        page.on('console', (message) => {
          if (message.type() === 'error') console.error(`[browser console] ${message.text()}`);
        });
        page.on('pageerror', (error) => console.error(`[browser pageerror] ${error.message}`));

        results.push(await inspectSurface(page, {
          url: authenticationUrl('login'),
          expectedText: 'Sign in to AccessLobby',
          screenshotName: `login-${viewport.name}-${colorScheme}`,
        }));
        results.push(await inspectSurface(page, {
          url: authenticationUrl('register'),
          expectedText: 'Create your AccessLobby account',
          screenshotName: `register-${viewport.name}-${colorScheme}`,
        }));
        await context.close();
      }
    }

    const errorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', locale: 'en-US' });
    const errorPage = await errorContext.newPage();
    results.push(await inspectSurface(errorPage, {
      url: authenticationUrl('login', 'http://localhost:4000/unregistered'),
      expectedText: 'We could not complete that request',
      screenshotName: 'error-invalid-redirect-390x844-light',
      allowedStatuses: [400],
      requirePrimaryControl: false,
    }));
    await errorContext.close();

    const logoutContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', locale: 'en-US' });
    const logoutPage = await logoutContext.newPage();
    const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);
    logoutUrl.searchParams.set('client_id', clientId);
    results.push(await inspectSurface(logoutPage, {
      url: logoutUrl.toString(),
      expectedText: 'Sign out of AccessLobby',
      screenshotName: 'logout-390x844-light',
      allowedStatuses: [200],
    }));
    await logoutContext.close();

    const report = {
      generatedAt: new Date().toISOString(),
      issuer,
      clientId,
      redirectUri,
      viewports,
      checks: results,
    };
    fs.writeFileSync(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Authentication browser qualification passed (${results.length} surfaces).`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
});
