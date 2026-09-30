# First-party onboarding: joined CI qualification

## Exact evidence

- Code source: `92c02bce381f80ecff2c25d70ad82f7fa54ecd99`, [PR #55](https://github.com/WB-DevWorld/AccessLobby/pull/55), partial progress on [#44](https://github.com/WB-DevWorld/AccessLobby/issues/44).
- [CI 36789480203](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36789480203): verify and IAM smoke PASS. IAM job `110138724379`, five categorical PASS phases at September 30 23:09:47–23:09:49 UTC.
- [Theme 36789480275](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36789480275): PASS.
- Test: `apps/api/test/app-onboarding-live-smoke.mjs`; only a dedicated disposable CI PostgreSQL database and loopback IAM are accepted. The test creates two temporary users, retains tokens only in process memory and keeps the operator token out of the API child's environment. No staging account, client, grant or DNS record is changed.

## Results

| Boundary | Status | Evidence |
| --- | --- | --- |
| Code + PKCE, signed ID-token nonce and JWKS, API access-token verification | PASS | Two real IAM sign-ins; API resolves distinct durable people and preserves their IDs across web and app clients |
| Request stays inactive; DNS proof is required and rechecked; review is required | PASS | HTTP request, injected DNS answers, missing/stale proof and missing review refusal; no IAM client before activation |
| Exact IAM configuration, safe retry and mismatch refusal | PASS | Real private provisioning/readback checks exact callback, logout/backchannel, PKCE and API audience; changed callback is rejected |
| Open app admission | PASS | Both people admitted without an app-grant row or person-ID configuration list |
| Restricted app admission | PASS | Deny before grant, admit after grant, deny on forced expiry/revoke; hidden visibility follows current grant |
| Owner and peer-management boundary | PASS | Organization administrator cannot manage the person's app; peer token cannot mutate grants |
| Membership, app entry and peer resources remain separate | PASS | Real organization invitation/acceptance does not grant restricted entry; direct peer policy checks remain independent |
| Suspended human | PASS | Valid open-app token receives `403 identity_suspended` |
| Registry-first suspension | PASS | Already-issued token denied while actual IAM client still enabled, including a legacy-list attempt; injected IAM outage leaves denial intact |
| IAM disable and retry | PASS | Actual disabled readback, safe repeat and continued old-token denial |
| Entry transport unavailable | PASS | Stop actual API process; consumer entry helper fails closed with 503 |
| Existing PWA, API, consumer and container qualification | PASS | Normal verify job passes production worker/offline/update/multi-window smoke and existing test/build/Compose/container checks |

## Limits and next gate

IAM sign-in, PostgreSQL registry changes and HTTP API responses are real within a disposable CI environment. IAM's actual redirect is captured before the browser follows the callback; the callback is a test boundary rather than a deployed peer. DNS answers and review reference are fixtures. Expiry is forced in the test database. Peer entry/resource modules are called directly; this does not qualify a deployed peer session, OIDC callback implementation or actual backchannel propagation.

The public staging API and worker still identified accepted PWA Build B `91e1a66167aa4a74dea44062e41849f8e8efb02c` during this follow-up. Its observed running web digest and desktop evidence remain in [the Build B record](pwa-2026-09-30/build-b-acceptance.md). Neither the PWA guard candidate nor this CI addition is claimed deployed. Full private current inventory and recovery remain BLOCKED without operator access; live app onboarding/admission, DNS review, second-peer acceptance and backchannel propagation are NOT RUN. Continue [the staging acceptance steps](../runbooks/app-onboarding-staging-acceptance.md) after the approved hostname, controlled accounts, independent review and protected runner are available. #44 stays open.
