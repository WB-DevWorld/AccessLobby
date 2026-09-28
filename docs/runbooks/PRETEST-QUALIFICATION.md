# Pre-test qualification automation

This runbook reduces manual setup before a staging browser round. It does not replace real human sign-in, registration, account linking, logout, backup/restore or rollback acceptance.

## 1. Authentication theme browser evidence

The `Keycloak theme` workflow starts an ephemeral branded Keycloak instance, registers the generic reference consumer, enables registration only inside that disposable test realm and runs `infra/scripts/auth-surface-browser.cjs` with pinned Playwright Chromium.

The browser check covers:

- login and registration at 360×800, 390×844, 412×924, 768×1024, 1366×768 and 1440×900;
- selected light and dark presentations;
- the invalid-redirect error surface;
- the logout entry surface;
- AccessLobby user-facing language;
- absence of the technical realm heading;
- page-level horizontal overflow;
- card containment and a 44px primary-action floor.

The workflow uploads PNG screenshots and `report.json` as the `keycloak-theme-browser-<run-id>` artifact. These images contain no real user data because the realm is ephemeral and no user credentials are created.

## 2. Public staging preflight

Run the `Public staging smoke` workflow manually after deploying exact immutable image digests. Supply the expected main SHA and the expected public-registration state. Add the independent reference-consumer origin when it is deployed.

The workflow runs `infra/scripts/public-staging-smoke.py` and uploads `staging-public-smoke.json`. It checks only public and unauthenticated behaviour:

- web home and AccessLobby branding;
- API liveness, readiness and optional exact SHA;
- unauthenticated `/v1/me` denial;
- exact issuer discovery and HTTPS endpoints;
- JWKS signing keys;
- branded login and invalid-redirect handling;
- registration feature-gate promise;
- blocked IAM root, admin, master, metrics and health paths;
- optional independent-consumer home, local private-route denial and registration redirect.

The script accepts no passwords, tokens, cookies, private IDs or secret headers. Its JSON report must remain safe to attach to an issue or pull request.

## 3. Local/operator command

```bash
python3 infra/scripts/public-staging-smoke.py \
  --web-origin https://accesslobby.example.com \
  --api-origin https://api.accesslobby.example.com \
  --issuer https://iam.accesslobby.example.com/realms/accesslobby-first-party \
  --expected-sha <exact-main-sha> \
  --registration-enabled false
```

Use `--consumer-origin` only for a separately deployed compatible app. Use `--registration-enabled true` only after the realm has been deliberately reconciled for the registration test. Use `skip` when observing the gate without asserting its intended state.

## 4. Remaining human acceptance

After the automated preflight passes, still test with controlled accounts in fresh browser profiles:

- existing-user sign-in and repeat SSO;
- new-user registration when intentionally enabled;
- no-link to new local account;
- explicitly authenticated old local account linking;
- current-app sign-out;
- shared AccessLobby sign-out and documented peer-session limitation;
- invalid credentials and session expiry;
- mobile/tablet/desktop visual review;
- application database backups, isolated restore and digest rollback.
