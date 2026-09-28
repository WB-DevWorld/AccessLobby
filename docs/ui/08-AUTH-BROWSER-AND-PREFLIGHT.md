# Authentication browser evidence and public staging preflight

Tracking: issue #31. These tools add repeatable evidence before the next human staging test. They do not change the live realm or deploy an image.

## Branded IAM browser qualification

The `Keycloak theme` PR/main workflow builds the repository's IAM image, imports a local test realm with registration enabled, and runs `infra/scripts/verify-theme-browser.mjs` in headless Chromium. It visits the real Keycloak login and registration templates at 360×800, 390×844, 412×924, 768×1024, 1366×768 and 1440×900 in light and dark modes. Each case checks AccessLobby language, absence of the technical realm heading, layout width, a visible usable submit control, and loaded color tokens. It captures 24 screenshots plus public error and unauthenticated logout entry evidence where the latter displays a page.

The short-lived `accesslobby-auth-browser` Actions artifact contains screenshots and a JSON report. No account is created, no password is entered, and no real session is established. A passing workflow qualifies the local branded image; it does **not** prove that Dokploy is running that image or that registration, sign-in or shared sign-out completes in staging. The immutable IAM image publisher remains gated by this workflow's success on main.

To run locally after starting the same test realm on `http://127.0.0.1:18080` with the reference consumer callback `http://localhost:4000/callback`:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps --only-shell chromium
IAM_BROWSER_ORIGIN=http://127.0.0.1:18080 node infra/scripts/verify-theme-browser.mjs
```

## Public staging preflight

The manual `Public staging preflight` workflow calls `infra/scripts/staging_preflight.py` with the known HTTPS web, API, realm issuer and optional reference-consumer origins. Supply the full `expected_sha` from the deployed API when available. It checks homepage branding, both API health endpoints and exact revision, unauthenticated `/v1/me`, exact OIDC issuer, public signing keys, rejection of private IAM paths, and optional consumer public/negative paths.

The report records status codes, a public key count, and the deployed source revision. It never records response bodies, cookies, authorization headers or account data. A redirect is a failure rather than a route to follow. The workflow uploads a short-lived JSON report even when a check fails. It is safe to run without a pilot account and is read-only.

Run the script directly when needed:

```bash
python3 infra/scripts/staging_preflight.py \
  --web-origin https://accesslobby.realjanelove.com \
  --api-origin https://api.accesslobby.realjanelove.com \
  --issuer https://iam.accesslobby.realjanelove.com/realms/accesslobby-first-party \
  --consumer-origin https://consumer.accesslobby.realjanelove.com \
  --expected-sha FULL_40_CHARACTER_DEPLOYED_API_SHA \
  --output /tmp/accesslobby-staging-preflight.json
```

After the published IAM digest is pinned and deployed, staging still needs a real browser pass through existing-user login, registration only when its live feature gate permits it, invalid credentials, both sign-out choices, and current-app/other-app session behavior. Keep issue #29 open until those are observed.
