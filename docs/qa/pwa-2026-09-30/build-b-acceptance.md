# First desktop PWA staging baseline — real Build A→B

Stable web origin: `https://accesslobby.realjanelove.com`. Owner test environment: physical Windows computer, computer Chrome selected by the owner; exact physical browser version **NOT RUN**. The screenshots demonstrate genuine app windows, rather than display-mode emulation. No private account screenshot, username, person ID, token, cookie or callback query is published.

## Exact release and artifact identity

| Evidence | Build A | Build B |
| --- | --- | --- |
| Source SHA | `4830d1b030237a77684e976c65311bac8ffe29c3` | `91e1a66167aa4a74dea44062e41849f8e8efb02c` |
| Published and running web digest | `sha256:d038305f6ef24ff62cba3efa31b6d445a68183ee2c537ee1093a971c1d7da381` | `sha256:447efdebdf1f4a50548bddf9e060fd52508f0ca207a7fb338af993ae5b9ad13d` |
| Owner-reported running local image ID | `sha256:fb1f0f931390e8edb5084000d93cc6786252f27be6e7d1531ba57c6927107228` | `sha256:00cfb2a45475452daa90389e9d1ebde8f72d222baf5766572248f7593198331e` |
| Running digest evidence UTC | About 21:18 | About 21:30 |
| Independently served `/sw.js` BUILD_ID | Exact source A, last checked 21:08:27 | Exact source B, checked 21:25:06 |
| Worker source SHA-256 | `0fd4b32b553514df2a8b209d2d88a791a2e5729c5406f4a8150c6b6e3322c13d` | `3db06e4ddb76804ded2e801c42f3f47271ca7edc211115a143e88ec5aa2dcb37` |
| API live/ready identity | Exact source A | Exact source B |

Both running web digests were obtained by selecting the running main Compose web container, reading only its local image ID and that image's repository digests. They match the immutable publication logs. A different source SHA is a different opaque identity; no SHA ordering is used. [Build B's manifest](../../../infra/releases/staging-2026-09-30-pwa-build-b.json) records all published pins. The separately deployed reference consumer was intentionally retained; its B publication entry is not a claim that it was redeployed.

## Owner's physical installed results

| Check | Status | Observation and evidence |
| --- | --- | --- |
| Installation/name/icon/standalone | PASS | Install dialog followed by an AccessLobby app window, about 19:44. [Record](https://github.com/WB-DevWorld/AccessLobby/issues/48#issuecomment-5918773084). |
| Installed IAM sign-in/callback/account | PASS | IAM credential page followed by live signed-in account in the installed window, about 19:58–19:59. Same record. |
| Offline reopening | PASS | In response to close/disconnect/reopen steps, neutral Connection required shell and disconnected network indicator, 20:59. [Record](https://github.com/WB-DevWorld/AccessLobby/issues/48#issuecomment-5919760603). |
| Same-window reconnect Retry | PASS | Owner explicitly confirmed Retry connection after restoring transport; home returned, then normal online sign-in/account. Same record. |
| Current-app logout and shared re-entry | PASS | Owner confirmed all steps; home → Sign in to continue → signed-in account, 21:11–21:12. [Record](https://github.com/WB-DevWorld/AccessLobby/issues/48#issuecomment-5919889112). |
| Shared logout and reopening | PASS | Branded IAM sign-out confirmation, home and credential form on re-entry, 21:12–21:13. Same record. Peer propagation is separate. |
| A→B update discovery | PASS | Second published artifact on the same origin; Update ready while the account remained open, 21:22. [Record](https://github.com/WB-DevWorld/AccessLobby/issues/48#issuecomment-5920033348). |
| Account-route safe boundary | PASS | Only Later and instructions to finish/return home on account; Update now offered at home. Same record. No in-flight mutation is inferred. |
| Explicit activation at home | PASS | Dark home with Update now → refreshed Dark home with prompt cleared, 21:28–21:29. [Record](https://github.com/WB-DevWorld/AccessLobby/issues/48#issuecomment-5920103970). |
| Session and non-default preference survive update | PASS | Signed-in account/server-loaded status still visible in Dark; owner explicitly confirmed no new sign-in after Update now. Same record. |
| Actual running A and B web artifacts | PASS | [A host output](https://github.com/WB-DevWorld/AccessLobby/issues/48#issuecomment-5919918592) and B host output in the update record match the exact table above. |

The physical B controller transition is inferred from the observed waiting → user activation → refresh workflow and the tested coordinator, paired with exact served worker/artifact identity. The physical browser's active worker SHA was not independently inspected. No other release or automatic activation is claimed. Browser registration/control is also qualified separately by the credential-free Chromium workflow.

The earlier reconnect asked for credentials about an hour after the prior sign-in. Callback code caps the local session at `min(tokens.expires_in, 3600)` seconds. That is compatible with normal expiry, not proof of an update/reset fault. The later A→B check separately confirmed an existing session remained usable. Offline caches never become identity authority.

## Build B automated/public gates

Source B's [main CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36767778666), [theme](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36767778457), [application publication](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36768064396) and [IAM publication](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36767955740) **PASS**. The earlier staging-browser run on that source tests deployed A and is not relabeled as B acceptance.

| Public gate | Status | Exact result |
| --- | --- | --- |
| Existing web/API/IAM/consumer/auth contract | PASS | [Permanent JSON](public-build-b.json), start 21:23:38 UTC, 23/23, exact B API live/ready. |
| PWA response contracts | PASS | [Initial report](pwa-http-build-b.json), start 21:23:37 UTC, 9/11; manifest and offline HTML hit eight-second bounds. [One targeted retry](pwa-http-build-b-retry.json), start 21:26:02 UTC, 2/2 with a 25-second bound and the same manifest/offline content checks, 5,650ms/5,675ms. |
| Served B worker identity/scope/headers | PASS | Exact SHA above; JavaScript, web root scope, no-store/no-cache/must-revalidate; worker bytes hash above. |
| Credential-free deployed B Chromium install/control/offline/cache/reflow | PASS | [Run 36780922951](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36780922951), tester `44d570c55603a5327e322ed551c4d370d766409b`, deployed B, Chromium `153.0.8010.12`, start 21:42:18 UTC. [Permanent report](automated-build-b.json): 11/11 checks and 24/24 six-width tab/installed public/offline cases. Artifact `11127616746`. |

The initial PWA report remains `passed: false`; it is not rewritten as a single clean 11/11 run. All 11 contracts have passing responses across the recorded run and bounded retry. Request times include this workspace's network path and are not physical-device performance measurements.

The B browser run proves real Chromium installation/standalone launch, web-origin controller/scope, exact served worker identity, replaceable-only Cache Storage, protected/auth offline navigation, rejected offline logout, reconnect and persistent-profile offline cold launch. The cold launch fails DNS before browser startup and confirms request failure even while `navigator.onLine` is true. Restoring transport and reopening the same installed profile preserves the test preference. This is credential-free virtual Linux evidence; physical owner sign-in/logout/A→B remain the independent rows above. The report's `notProven` entries are preserved, not erased by other evidence.

| Virtual runner measurement | DOM content loaded | Browser-reported transfer | Conditions |
| --- | --- | --- | --- |
| First public load | 1,249ms | 153,825 bytes | 150ms emulated latency, 64KiB/s download |
| Repeat public load | 151ms | 16,214 bytes | Same emulation, warmed static cache |
| Installed offline profile cold launch | 64ms | 0 bytes | DNS failure before browser startup, persistent neutral cache |

Tester source `44d570…` [CI 36780922997](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36780922997) and [theme 36780922952](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36780922952) PASS. Final evidence/merge source and its normal required checks remain distinct from these recorded test and deployed-artifact revisions.

## Remaining qualification

[Issue #52](https://github.com/WB-DevWorld/AccessLobby/issues/52) keeps Android Chrome, iOS Safari Home Screen, physical browser/version and active-worker inspection, installed registration/failed-callback/switching, authenticated cache inventory/history, in-flight mutations/second critical tab, manual repair/corrective rollout and physical low-bandwidth metrics **NOT RUN**. Source/CI and browser-tab evidence do not fill those device cells. The owner matrix remains in [the plain steps](../../runbooks/pwa-owner-check.md) and [acceptance runbook](../../runbooks/pwa-staging-acceptance.md).

Production promotion is **DEFERRED** to the project's independent release gates. Protected deployment was performed by the owner, not by the agent. No PWA database/realm/client migration or credential/session-secret change was requested. This evidence PR changes neither runtime application behavior nor the deployed B artifact; it does not require a third rollout.
