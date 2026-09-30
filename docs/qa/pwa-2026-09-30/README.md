# Staging PWA evidence — September 30, 2026

Relates to [#48](https://github.com/WB-DevWorld/AccessLobby/issues/48). Stable web origin: `https://accesslobby.realjanelove.com`.

## Release identity

The owner deployed source **4830d1b030237a77684e976c65311bac8ffe29c3** (Build A). Their public preflight started at **18:01:29 UTC**, passed **23/23**, and API live/ready returned the exact SHA. Their PWA HTTP gate passed **11/11**. The supplied Docker inventory reports running web/API/IAM/gateway, healthy databases and `migrate`/`iam-config` exited 0. Its image-name column does not prove an immutable digest.

Expected published web image: `ghcr.io/wb-devworld/accesslobby-web@sha256:d038305f6ef24ff62cba3efa31b6d445a68183ee2c537ee1093a971c1d7da381`. Actual running digest verification: **NOT RUN**.

Independent HTTP check at **18:13:57 UTC**: 8/11 passed; manifest, worker and recovery hit the eight-second bound. One targeted retry of all three passed. Worker headers: JavaScript, `no-store, no-cache, must-revalidate`, root scope and exact Build A SHA. Worker bytes hash: `0fd4b32b553514df2a8b209d2d88a791a2e5729c5406f4a8150c6b6e3322c13d`. Retry timings: manifest 8,537ms, worker 12,384ms, recovery 7,350ms. These include the workspace network path, not device performance. The first-run timeouts remain an observation.

## Direct browser interaction

Cloud Chrome browser tab, after 18:06 UTC; browser version is not exposed. Credentials were entered through the secure browser-auth capability and never read or recorded by the agent. No installed mode, worker/cache inspection or offline test is inferred from this tab pass.

| Check | Status | Observation |
| --- | --- | --- |
| AccessLobby → IAM → callback → account | PASS | Fresh account page showed Signed in, active identity and server-loaded account status. |
| App-only sign-out and Back | PASS | Home, then Sign in to continue; no private account content resurrected. |
| App-only sign-out preserves shared session | PASS | Sign in returned to the same account without another credential prompt. No person ID is published. |
| Shared sign-out and reopening | PASS | IAM confirmation completed; account asked for sign-in, then IAM showed the credential form again. |
| Registration entry | PASS | Branded registration form opened; no account created. |
| Malformed callback | PASS | `/auth/callback` without parameters returned Sign-in could not be completed; no session created. |
| Second-person/account and organization switching | NOT RUN | No second approved account used; tested account had no organization selection. |
| Peer backchannel/session propagation | NOT RUN | No peer session established or inspected in this pass. |
| Installed authenticated login/logout | NOT RUN | Browser-tab authentication is separate evidence. |
| Real release Build A→B | NOT RUN | Build B published; not observed deployed while A remains installed. |
| Physical desktop, Android, iOS | NOT RUN | No device result supplied. |

The [signed-out screenshot](signed-out-account.jpg) shows the account page after shared sign-out. It contains no person ID, account details, credentials or callback parameters.

## Automated staging browser qualification

`infra/scripts/pwa-staging-browser.mjs` and **PWA staging browser qualification** test the explicitly selected deployed SHA in a disposable Chromium desktop profile. JSON and public screenshots are workflow artifacts. Checks cover worker control/scope/release, manifest/installability, public cache allowlist, offline protected/auth navigation and rejected offline logout, reconnect, installation/standalone launch, profile cold launch offline, theme preservation, six-width public/offline reflow and first/repeat load under 150ms/64KiBps network emulation.

No credentials, identity snapshots or online mutations are used. Test-profile cleanup is not user-browser recovery. It does not prove installed authenticated use, mobile/physical devices, real release update or peer logout propagation. At authoring, the remote run is **NOT RUN**; exact results are appended to issue #48 after execution.
