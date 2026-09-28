# Branded IAM staging cutover — 2026-09-28

This is the operator handoff for issues #25, #27 and #29. It records a qualified candidate, **not** a deployment or production approval. The protected Dokploy environment and the running container digests are visible only through the owner's private operator access. Do not paste environment exports, credentials, tokens, cookies or person IDs into GitHub.

## Observed public baseline

At 19:38 UTC on 2026-09-28, the credential-free public preflight passed 14 checks with expected API SHA `f1b357a84aefca9650176830a2faa03c35fbf544`: web 200; API live/ready 200; `/v1/me` without a token 401; exact issuer and two JWKS keys; gateway root/admin/master/metrics/health 404; consumer home/private/invalid-callback 200/401/400. Fresh web-client authorization requests returned HTTP 200 for both login and a registration form, but both pages still showed the technical realm presentation. The registration form rendering does not prove that a new user can complete signup or email verification. A 19:46 UTC expanded run failed the three branded-page checks as expected and saw one consumer-home 502. Three immediate isolated consumer-home retries returned 200, a timeout and 200. Inspect the consumer/proxy logs through the private operator path; the public checks do not identify the cause.

## Qualified source and immutable images

Main source SHA: `4debd6eaf154f82c82c20579c4fe08a89fb25c9e` (PR #32). [Main CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36472224413), [Keycloak-theme Chromium qualification](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36472224540), [IAM image publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36472452062) and [application image publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36472498200) all succeeded for that commit. The Chromium job covers credential-free local-image login, registration, invalid-request and unauthenticated logout entry; it does not prove the staging image is running.

| Protected Dokploy value | Qualified reference |
|---|---|
| `GIT_SHA` | `4debd6eaf154f82c82c20579c4fe08a89fb25c9e` |
| `IAM_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam@sha256:6039a8f7788eba5e17908c332ccd62348bf069c5d26684ceb2e2fbd3cc82ba21` |
| `API_IMAGE` | `ghcr.io/wb-devworld/accesslobby-api@sha256:f92eced6343ead6bc5ba86722f43ac9c161be1af8ac1924880301da4b593eaa9` |
| `WEB_IMAGE` | `ghcr.io/wb-devworld/accesslobby-web@sha256:499ba902645acfecab484eca6eb1ee2abfedc2d8c02496b999f9d1d5cebef592` |
| `IAM_GATEWAY_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:675e2478c76cb7b5a8af42366cf56b240bfc142dbb7de33366e696a42b6c9179` |
| Separate consumer `CONSUMER_IMAGE` | `ghcr.io/wb-devworld/accesslobby-reference-consumer@sha256:5a999a30349c3f718a3de802c761b5a2bf7b8804e1802c695e3be14581c94339` |

## Protected operator sequence

1. Record the currently running digest for each service, the current `GIT_SHA`, the realm's current `loginTheme`, `registrationAllowed`, `verifyEmail` and `resetPasswordAllowed` values, the two registered client backchannel URLs, the last successful backup object for each database and the Dokploy control plane, and the exact rollback route. Keep this record in protected operator storage. Do not use a control-plane restore on the live panel as a trial rollback.
2. In the existing AccessLobby staging Compose service, use `./compose.dokploy.yaml` from a checkout whose Compose and realm-reconciliation files match the qualified `4debd6e` revision. This documentation/preflight change does not modify those runtime files; if they advance again, compare and requalify before deployment. Set the five main-service values in the table above: `GIT_SHA`, `IAM_IMAGE`, `API_IMAGE`, `WEB_IMAGE`, `IAM_GATEWAY_IMAGE`. `GIT_SHA` describes the published **image source**, even if the current `main` checkout later contains documentation-only commits. Keep the existing issuer, domains, client IDs, allowlist, database volumes, secrets and registration/email/reset feature flags. The `iam-config` job uses the same `IAM_IMAGE` and reconciles the existing realm's theme; the create-only realm import cannot update it. Review the generated Compose preview: only gateway, API and web have public domain targets; Keycloak, both databases, migration and configuration job remain private. Deploy the main service and confirm the migration and realm-reconciliation jobs succeed.
3. Update the independently deployed consumer Compose service from the matching qualified Compose source and set only its `CONSUMER_IMAGE` to the tabled digest, preserving its origin, issuer, API URL, local grant policy and registration gate. Confirm the separately deployed consumer still has its own HTTPS origin and OIDC client. Investigate the intermittent consumer-home 502/timeout in the private proxy and application logs. Inspect each **running** container's image reference through the private operator path; saved environment values and a public API SHA alone do not establish the actual image set.
4. Run the public preflight from the qualified checkout, storing the JSON report outside the repository:

   ```sh
   python3 infra/scripts/staging_preflight.py \
     --web-origin https://accesslobby.realjanelove.com \
     --api-origin https://api.accesslobby.realjanelove.com \
     --issuer https://iam.accesslobby.realjanelove.com/realms/accesslobby-first-party \
     --consumer-origin https://consumer.accesslobby.realjanelove.com \
     --expected-sha 4debd6eaf154f82c82c20579c4fe08a89fb25c9e \
     --check-auth-pages \
     --output /tmp/accesslobby-staging-auth-preflight.json
   ```

   The same check is available through the manual **Public staging preflight** GitHub workflow with `include_consumer=true`, `check_auth_pages=true` and the full expected SHA. It checks 17 public cases, including the branded login, registration and invalid-request pages. It creates no user and does not sign in. A failed auth-page check or old API SHA is a failed cutover, not evidence of a completed rollout.
5. In a controlled staging browser, prove an existing-user login, an actual new-user registration and verification under the intended SMTP-backed realm settings, a wrong-password error, a malformed request, and the sign-out confirmation. Test both app-only and shared AccessLobby sign-out from both the web app and the consumer; test no-link → create local consumer account and existing-account linking after proof of both accounts. Check the AccessLobby ID and separate local app ID, Copy ID behavior, local resource denial, and explicit page-level overflow at 360×800, 390×844, 412×924, 768×1024, 1366×768 and 1440×900. Do not infer those outcomes from screenshots or public GETs alone.
6. Verify scheduled backups, logs, monitoring and a safe application rollback rehearsal before closing staging and production gates. Record the source SHA, actual running digests, non-sensitive check results, date and environment on the relevant issues. Keep #29, #25, #27 and #10 open for any unobserved acceptance item.

**Rollback coupling:** the deployment sets the existing realm's `loginTheme` to `accesslobby`. Rolling the IAM container back to a stock Keycloak image without that theme can break sign-in even if the old container starts. Preserve the previous theme setting and image together; use the restricted administrator path to restore the former setting before switching to an image that lacks the theme. Keep the current qualified IAM image while rolling back only API/web if that is the narrower recovery. Never expose the Keycloak admin endpoint publicly.
