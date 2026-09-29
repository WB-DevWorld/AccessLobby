# Account routing staging handoff — 2026-09-29

## Later evidence: current baseline

Owner inventory at 12:41 UTC reported this manifest's nine services with zero findings; the 12:42 UTC public pass was 23/23 at source `936aae1`. Owner signed-in account/organization/peer-local checks were reported passing. The audit's 21:56 UTC public pass again observed this API source. These results qualify only the exercised cases; full failure/logout/browser acceptance remains open. The next candidate is the [first-party onboarding handoff](app-onboarding-staging-handoff-2026-09-29.md), tracked by #44. See [the current audit](../ACCESSLOBBY-CURRENT-STATE-AUDIT.md).

## Original 12:12 UTC handoff checkpoint

This candidate contains the first-party personal/organization account resolution and routing from [PR #40](https://github.com/WB-DevWorld/AccessLobby/pull/40), plus the earlier organization and peer-membership changes from PRs #37–38. It is **published, not observed running or accepted in staging**. At 12:12 UTC the credential-free public `/health/live` still reported `4debd6eaf154f82c82c20579c4fe08a89fb25c9e`. The older [context candidate](account-contexts-staging-2026-09-29.md) was also published; no evidence establishes that it was deployed. Record actual running digests before choosing a rollback target.

Source `936aae12571346920923ed392731611eaa0ecf8a` passed [main CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36563931515) (including PostgreSQL migration/integration tests), [Keycloak theme qualification](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36563931526), [application publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36564110361) and [IAM publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36564122600). Their published digest outputs are pinned in the [release manifest](../../infra/releases/staging-2026-09-29-account-routing.json):

| Dokploy variable | Immutable image reference |
|---|---|
| `GIT_SHA` | `936aae12571346920923ed392731611eaa0ecf8a` |
| `IAM_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam@sha256:3b9f60b71fefb3d003df98b5ff7f368c52923adf202cab8b7d49cc0b33c3214d` |
| `IAM_GATEWAY_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:568caee9586ac1add6bf514e03053a7f49f6c0a02683a22a1b319c29071f3846` |
| `API_IMAGE` | `ghcr.io/wb-devworld/accesslobby-api@sha256:4f73038eac60cba1462c527201b7812f8081937e77e2717741320764670f7ffb` |
| `WEB_IMAGE` | `ghcr.io/wb-devworld/accesslobby-web@sha256:451bbad9c35669d7e803e366bf2243f8b306e1552fc206f3f228c0ac310edfa7` |
| Separate consumer `CONSUMER_IMAGE` | `ghcr.io/wb-devworld/accesslobby-reference-consumer@sha256:c3ffc90daff4eb2d02256372d9f4b766c27149205ea75fde141510fe60202844` |

## Operator deployment and acceptance

1. In Dokploy protected operator custody, capture current running image digests, database backup state and rollback target. Never paste secrets, tokens, OIDC codes, cookies or person IDs into reports or the repository. The source branch/checkout for both Compose projects must be `main` at or after the source SHA above; deploying a newer image with an older Compose checkout can omit services or migrations. Preserve existing issuer, origins, client IDs/allowlist, registration/email/reset flags, passwords, networks and volumes.
2. In the main staging Compose project `accesslobby-accesslobbystaging-beass9`, use `./compose.dokploy.yaml`, set the five main values together, and review the generated Compose preview before deployment. `IAM_IMAGE` is required by both `iam` and `iam-config`; `API_IMAGE` is used by both `api` and `migrate`. Confirm `iam-config` and `migrate` finish successfully. Migration 003 is additive; after real membership data exists, rollback the application binary without dropping those tables.
3. In the separate `accesslobby-referenceconsumerstaging-yuxqwo` project, use `./compose.consumer.dokploy.yaml` and the consumer digest above. Preserve the `reference-consumer` client and its independent local resource policy. Its organization selection must not turn a local 403 into 200 by itself.
4. Compare private runtime facts to the [manifest](../../infra/releases/staging-2026-09-29-account-routing.json) without exporting container environment variables:

   ```sh
   python3 infra/scripts/inspect_staging_runtime.py \
     --main-project accesslobby-accesslobbystaging-beass9 \
     --consumer-project accesslobby-referenceconsumerstaging-yuxqwo \
     --manifest infra/releases/staging-2026-09-29-account-routing.json \
     --output /var/tmp/accesslobby-account-routing-runtime.json
   ```

5. Run the credential-free public preflight, then the signed-in [bulk acceptance matrix](bulk-staging-acceptance.md) with distinct personal, owner, administrator, member and outsider test people. Record only categorical results and UTC times. This revision particularly needs: personal-only `/account` landing; invitee/member `/contexts` landing; explicit switch-person challenge; organization selection preserving person ID; role/roster isolation; suspended-person denial; owner transfer and last-owner guard; removal revoking selected context; peer membership display with an unchanged local resource 403; local versus shared sign-out. If an account is created during the run, verify repeat sign-in maps to its existing person ID. Registration email verification and reset need separately configured and observed delivery.

   ```sh
   python3 infra/scripts/staging_preflight.py \
     --web-origin https://accesslobby.realjanelove.com \
     --api-origin https://api.accesslobby.realjanelove.com \
     --issuer https://iam.accesslobby.realjanelove.com/realms/accesslobby-first-party \
     --consumer-origin https://consumer.accesslobby.realjanelove.com \
     --expected-sha 936aae12571346920923ed392731611eaa0ecf8a \
     --check-auth-pages --check-consumer-health --consumer-home-samples 5 \
     --output /var/tmp/accesslobby-account-routing-public.json
   ```

The sign-in callback now needs both `/v1/me` and `/v1/contexts` before it issues a first-party web session. A missing migration or mismatched API/web rollout therefore leaves sign-in unavailable and should be treated as a deployment failure, not worked around by bypassing context resolution. A public health SHA and image pull do not prove any signed-in flow. The [account architecture audit](../account-architecture-audit.md) still marks app-entry grants, legal controllers, hierarchy, non-human credentials and broader recovery/termination as unresolved design work.

## Public baseline observed before deployment

At 12:12 UTC, the credential-free preflight against the old expected SHA passed 20 of 23 checks: web/API/issuer and restricted IAM gateway checks, five consumer-home samples, unauthenticated private access, and branded login/registration/error pages. Consumer `/health/live` and `/health/ready` returned 404, and one malformed consumer callback request had no usable response. One bounded retry of that callback returned the expected 400 in 6.7 seconds. This only describes the old running revision; investigate those consumer findings with private proxy/container evidence and repeat the check on the new images. No signed-in candidate test has run.
