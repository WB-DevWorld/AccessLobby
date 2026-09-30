# PWA installed acceptance evidence

Copy this template into protected operator evidence. Publish only redacted results on #48; exclude credentials, cookies, tokens, OIDC query strings, personal IDs and account screenshots containing private data.

| Release identity | Build A | Build B |
| --- | --- | --- |
| UTC deployment and test time | NOT RUN | NOT RUN |
| Full source SHA | `4830d1b030237a77684e976c65311bac8ffe29c3` candidate | NOT RUN |
| Published web digest | `sha256:d038305f6ef24ff62cba3efa31b6d445a68183ee2c537ee1093a971c1d7da381` candidate | NOT RUN |
| Protected running web digest/local image ID | NOT RUN | NOT RUN |
| `/sw.js` BUILD_ID and source hash | NOT RUN | NOT RUN |
| API `/health/live` source SHA | NOT RUN | NOT RUN |
| Stable web origin | `https://accesslobby.realjanelove.com` | Same origin |
| OS/device/browser version | NOT RUN | NOT RUN |

Every test starts NOT RUN. Replace it only with supported evidence and an observed result.

| Test | Expected evidence | Status |
| --- | --- | --- |
| Public HTTP gates | 23/23 baseline and 11/11 PWA checks, exact revision | NOT RUN |
| Desktop Chromium installation | Browser offers installation; correct AccessLobby name/icon | NOT RUN |
| Standalone launch | Opens in installed window; display mode observed | NOT RUN |
| Worker ownership/control | Web root scope; no API/IAM/peer control | NOT RUN |
| Installed online sign-in | IAM redirect, callback, live account/context | NOT RUN |
| Registration entry | Enabled IAM registration entry reached from installed window | NOT RUN |
| Failed/malformed authentication | Truthful failure; no local session created | NOT RUN |
| Account/context switching | Fresh IAM challenge where required; live memberships checked | NOT RUN |
| Current-app logout | Local session ended; reopen requires correct re-entry | NOT RUN |
| Shared logout | Current browser SSO termination confirmed; participating peer propagation checked | NOT RUN |
| Signed-out history/reopen | Private content not restored via back-navigation or cold launch | NOT RUN |
| Offline cold start | Close installed window online; disconnect; relaunch into branded neutral shell | NOT RUN |
| Offline protected/action attempt | Connection required; no stale account/access or successful mutation | NOT RUN |
| Cache Storage audit after auth | Only neutral shell/icons/static assets; no callback/API/private documents | NOT RUN |
| Reconnect | Retry returns authoritative state without storage reset | NOT RUN |
| Installed A→B discovery | Second real artifact on same origin; waiting/update-ready observed | NOT RUN |
| Critical-flow update deferral | No activation/reload during current account/security workflow | NOT RUN |
| Explicit safe activation | B takes control after deliberate update; session/context/theme retained | NOT RUN |
| Multi-tab behavior | Other critical-flow tab not forcibly reloaded; still usable | NOT RUN |
| Bounded repair/rollback | Corrective same-origin worker works; no cookie/durable-store deletion | NOT RUN |
| Responsive/accessibility | Widths 360/390/412/768/1366/1440; keyboard/focus/44px targets/reflow | NOT RUN |
| Constrained-network performance | First/repeat/offline shell timings on named device/network | NOT RUN |
| Android Chrome | Real installed auth/logout/offline/update steps and browser version | NOT RUN |
| iOS Safari Home Screen | Real installed auth/logout/offline/update steps and OS version | NOT RUN |

Use only PASS, FAIL, BLOCKED, NOT RUN and DEFERRED. Include an observation/evidence reference for every status changed from NOT RUN. Do not convert implementation/HTTP/CI evidence into installed platform acceptance.
