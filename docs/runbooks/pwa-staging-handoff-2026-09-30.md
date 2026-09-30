# PWA staging rollout — exact published candidate

Relates to [#48](https://github.com/WB-DevWorld/AccessLobby/issues/48). PWA source [4830d1b030237a77684e976c65311bac8ffe29c3](https://github.com/WB-DevWorld/AccessLobby/commit/4830d1b030237a77684e976c65311bac8ffe29c3) is merged through [PR #49](https://github.com/WB-DevWorld/AccessLobby/pull/49). The [release manifest](../../infra/releases/staging-2026-09-30-pwa.json) records the five published digests. Publication and deployed public PWA delivery are PASS. Running image digest verification and full installed acceptance remain open; the earlier pre-deployment checkpoint is preserved below.

**Later evidence, 18:01 UTC:** the owner deployed Build A; public preflight **23/23 PASS** and PWA HTTP gate **11/11 PASS**. The table below preserves the earlier pre-deployment checkpoint. Current browser observations and remaining gates are in [the September 30 staging record](../qa/pwa-2026-09-30/README.md). For the owner, use [the plain-language steps](pwa-owner-check.md).

## Earlier evidence and baseline

| Gate | Status | Exact evidence |
| --- | --- | --- |
| Main CI | PASS | [36734724414](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36734724414), source `4830d1b…`; production Chromium worker/offline/update smoke step passed. |
| Main theme | PASS | [36734724548](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36734724548), same source. |
| Application images | PASS | [36735128387](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36735128387); four digest references read from job 109954711308. |
| IAM image | PASS | [36735696785](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36735696785); digest read from job 109956672410. |
| Existing public staging boundary | PASS | Credential-free preflight started at 2026-09-30 15:50:06 UTC, 23/23 checks; API live/ready report `aadfad381b3f43d8c93cce1ba84805aead4efb52`. Includes five consumer-home samples, branded auth pages and IAM gateway denials. |
| Current public PWA delivery | FAIL | PWA HTTP gate started at 15:55:43 UTC: 5/11 PASS. Manifest, worker, offline HTML and all three icons return 404; five private cache-header checks PASS. The prior release remains live. |
| Protected rollout and running digest inventory | BLOCKED | No authenticated Dokploy session, SSH key or deployment credential was available in the execution environment. |
| Installed Chromium, Android and iOS acceptance | NOT RUN | No PWA candidate is deployed. The local Chromium CI smoke is not a desktop OS installation or device acceptance. |

HTTP request timings were measured from this workspace and include its network path. They are not device first-load/repeat-load measurements. Performance on constrained devices remains NOT RUN.

The public gate follows the current [Next.js PWA guidance](https://nextjs.org/docs/app/guides/progressive-web-apps), [MDN service-worker registration rules](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register) and [MDN installation guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), revisited September 30. Current repository web remains Next.js 16.3.6. These sources define platform delivery requirements; they do not qualify our installed runtime.

## Roll out Build A through protected Dokploy

Use the existing main Compose project `accesslobby-accesslobbystaging-beass9`, Git branch `main`, Compose path `./compose.dokploy.yaml`. Preserve the current running image references and `GIT_SHA` as the rollback set. Confirm recent IAM/identity backups and healthy databases. Preserve domains, realm import, database volumes, credentials, session secret and registration/verification/reset settings.

Set these values together in that project's private Environment editor:

```dotenv
GIT_SHA=4830d1b030237a77684e976c65311bac8ffe29c3
IAM_IMAGE=ghcr.io/wb-devworld/accesslobby-iam@sha256:1b149cf7ef63281f3bafa551f7f9d90f33df2c0e6ec2999da9aa9b357d797da0
IAM_GATEWAY_IMAGE=ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:fb772219fd4d44a811b8c0ec92b0b20123bded8dacc51b1b05bd193006b23238
API_IMAGE=ghcr.io/wb-devworld/accesslobby-api@sha256:33415002796897a331ff88bd20ba72b4b2a867623044c0a1df23dcd145c37ed7
WEB_IMAGE=ghcr.io/wb-devworld/accesslobby-web@sha256:d038305f6ef24ff62cba3efa31b6d445a68183ee2c537ee1093a971c1d7da381
```

The Compose file injects one `GIT_SHA` into both API and web. Updating the web pin alone while leaving the old value would misidentify the worker; changing the value without its matching API image would misidentify API health. Deploy the matching main set above. No PWA migration, new realm, new client or change to application admission is required.

Keep the separate reference consumer's current digest, fixture settings and project unchanged during this PWA rollout. Its published `4830d1b…` digest is recorded for completeness and is not a prerequisite for PWA testing. Redeploying the demonstration consumer would discard its in-memory local profiles/sessions. The existing full two-project runtime inspector assumes all five pins match; do not interpret its consumer mismatch as a PWA failure when the consumer is intentionally retained.

Deploy the main project. Confirm `migrate` and `iam-config` exited 0, IAM and identity databases remain healthy, and API/web/IAM/gateway are running. In the protected host shell, this bounded inventory avoids printing container environment variables:

```bash
docker ps -a --filter label=com.docker.compose.project=accesslobby-accesslobbystaging-beass9 \
  --format '{{.ID}} {{.Label "com.docker.compose.service"}} {{.Image}} {{.Status}}'
```

Compare the web image reference to the exact digest above; also record its local image ID and repository digest in protected evidence using selected Docker inspect fields. Never publish a full `docker inspect` or `.env` dump. Public `/sw.js` build identity alone does not prove the running image digest.

## Run the two public HTTP gates

Run from the checkout of the follow-up qualification PR or its merged revision. Its source SHA is a tooling revision; retain the PWA artifact source SHA above until a different published artifact is deliberately selected.

```bash
cd /etc/dokploy/compose/accesslobby-accesslobbystaging-beass9/code
python3 infra/scripts/staging_preflight.py \
  --web-origin https://accesslobby.realjanelove.com \
  --api-origin https://api.accesslobby.realjanelove.com \
  --issuer https://iam.accesslobby.realjanelove.com/realms/accesslobby-first-party \
  --consumer-origin https://consumer.accesslobby.realjanelove.com \
  --expected-sha 4830d1b030237a77684e976c65311bac8ffe29c3 \
  --check-auth-pages --check-consumer-health --consumer-home-samples 5 \
  --output /tmp/accesslobby-pwa-public.json
python3 infra/scripts/pwa_staging_preflight.py \
  --web-origin https://accesslobby.realjanelove.com \
  --expected-web-sha 4830d1b030237a77684e976c65311bac8ffe29c3 \
  --output /tmp/accesslobby-pwa-http.json
```

Expected gates: 23/23 existing public checks and 11/11 PWA HTTP checks. The latter verifies manifest identity/scope, actual PNG dimensions and bytes, offline-shell delivery, worker MIME/no-store/scope/build identity and private no-store headers. It never sends a cookie or bearer token, follows redirects, submits an identity mutation, or certifies browser Cache Storage. It records bounded metadata without response bodies, cookies or callback details.

Alternatively run **Public staging preflight** in GitHub Actions with `expected_sha` and `expected_web_sha` set to the full PWA source SHA, `check_pwa=true`, `check_auth_pages=true`, `include_consumer=true`, `check_consumer_health=true`, and `consumer_home_samples=5`. Download both JSON reports. A green public gate is not installed acceptance.

## Installed acceptance and subsequent Build B

Follow [the installed acceptance runbook](pwa-staging-acceptance.md) and use [the evidence template](pwa-staging-evidence-template.md). Record the actual browser version, OS/device, web image digest, worker build ID and UTC timestamp. Complete installed online sign-in, registration entry, malformed/failed callback, account and context switching, both logout scopes, reopening after logout, offline cold launch, protected-action failure, reconnect and cache inspection. Inspect at widths 360, 390, 412, 768, 1366 and 1440 where applicable.

The pre-PWA `aadfad3…` release cannot be called an installed PWA Build A. Install and qualify the PWA candidate above first. Build B must be a second, separately qualified and published revision with its own recorded digest, deployed to this same stable origin. The CI smoke restarts one compiled production app with synthetic `a…`/`b…` runtime IDs; it tests waiting/controller logic, not two distinct released artifacts, OS installation, IAM redirects or device session continuity. Do not relabel it as the required staging A→B test.

Keep Build A installed while deploying B. Verify discovery after open/resume/reconnect, no forced reload during an account/security flow, user-controlled activation at home, the B worker taking control and preservation of the actual session/context/theme. Check another critical-flow tab remains usable and is not forcibly reloaded. Android/iOS remain NOT RUN until real device evidence is supplied.

## Rollback and recovery

Restore the retained main image pins and matching `GIT_SHA` if rollout checks fail. A web PWA rollout requires no database restore. An already-installed worker can outlive a container rollback; the old pre-PWA server's `/sw.js` 404 is not proof that devices recovered. Prefer a qualified corrective worker at the same URL/scope and verify its controlled activation. If bounded manual repair is needed, unregister only the AccessLobby worker and remove only `accesslobby-static-*` replaceable caches. Preserve cookies, theme, unrelated caches and all other browser storage. Reconnect and reload from the network, then register the qualified worker and repeat acceptance.

Keep #48 open until its exact deployed installation, authentication, offline and A→B Definition of Done is satisfied. Record PASS, FAIL, BLOCKED, NOT RUN or DEFERRED for each gate; a merge is not a runtime result.
