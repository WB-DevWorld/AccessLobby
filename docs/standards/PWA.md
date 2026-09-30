# AccessLobby PWA standard

**Owner decision, 2026-09-30:** AccessLobby is an installable Progressive Web App. Its web-origin worker improves delivery and recovery while the server, API and IAM remain authoritative for every identity and access decision. This standard is current; installed staging acceptance is tracked separately in issue #48.

The [September 30 desktop A→B record](../qa/pwa-2026-09-30/build-b-acceptance.md) records the first physical Windows installed lifecycle, exact running web digests, retained session/preference and truthful offline/reconnect results. [Issue #52](https://github.com/WB-DevWorld/AccessLobby/issues/52) retains mobile and additional installed edge cases as NOT RUN. Desktop evidence must never be presented as Android/iOS qualification, production acceptance or direct inspection of the physical controller's build ID.

## Focused source transfer

The focused reconciliation covered 25 distinct current/historical inputs before implementation: POS `AGENTS.md`, `CURRENT-WORK.md`, standards `PWA.md`, `OFFLINE-SYNC.md`, `TESTING.md`, `RELEASE.md`, ADR-005; POS PRs #63, #91, #100, #121 and issues #28, #89, #114; seven named Immediate PWA POS / POS PWA Work History sources in the AccessLobby source pack; transfer-kit engineering standards and decision log; AccessLobby integration contract, web layout, auth routes, cookie and context code, current CI/Compose/Dockerfiles; current Next.js and MDN PWA/service-worker documentation. These are distinct source checks, not 25 tests or proof of installed behavior.

| Transfer class | POS lesson | AccessLobby application |
| --- | --- | --- |
| Direct principle | Waiting updates, foreground/reconnect checks, safe points, non-destructive repair | Explicit Update ready UI; no automatic install-time `skipWaiting`, cookie or storage reset. |
| Direct principle | `navigator.onLine` is only a hint; Git SHAs are opaque | Network success decides availability. Build IDs use SHA equality/inequality only. |
| Direct principle | Qualify exact artifact and installed A→B lifecycle | Record web digest, deployed SHA, worker SHA, stable origin and browser/device. |
| Adapt | POS cached local presentation in a real shell | AccessLobby caches only a neutral, branded offline document and replaceable static assets. No identity snapshot. |
| Adapt | Preserve POS journal/drafts during updates | Preserve AccessLobby's HttpOnly session/context cookies and non-sensitive theme preference; no local durable identity data exists. |
| Adapt | Multi-tab migration protection | Broadcast update-ready state; only the activating tab reloads at a safe boundary. Other tabs keep their document and reload deliberately. |
| Do not transfer | Dexie, product/price/cart/receipt/shift journal, payment/stock queues | None belongs to an identity client. No offline identity mutation queue or IndexedDB dependency. |

The POS PR #91 exposed an installed cold-start that reached only a fallback instead of its full POS workspace. AccessLobby's truthful offline product is deliberately the fallback shell; it contains no account data. PR #100 exposed false-positive `navigator.onLine` when transport failed. PR #121 limited offline presentation to an allowlisted, non-authoritative subset and retired local authority on sign-out; AccessLobby does not persist identity presentation at all. PR #63 retains installed A→B and operational recovery as a separate runtime gate.

## Install and origin

Next.js 16.3.6 serves `/manifest.webmanifest` with stable `id`, root scope/start URL, standalone display and 192/512 PNG icons derived from the existing AccessLobby mark. The PNGs and SVG are provisional renderings of the approved mark, not a new identity. The worker lives at `/sw.js` and controls only the AccessLobby web origin; it cannot control `api.*`, `iam.*` or peer origins. The web runtime receives the same exact `GIT_SHA` as the API so worker bytes change with every deployed build. A missing SHA is `local-build` for development, not a qualified staging release. The Docker image copies `public/` as well as Next output.

## Cache and offline contract

Cache Storage contains `/offline.html`, the two icon PNGs and eligible successful same-origin `/_next/static/**` responses. Static build assets are replaceable. The worker retains the current and one previous build cache while tabs transition; it deletes only obsolete `accesslobby-static-*` caches. It does not clear unrelated caches.

All navigations use the network with `cache: no-store`. On transport failure, a neutral offline page explains that a connection is required. Authenticated HTML, account/context/organization/app screens, OIDC callback and logout, `/v1/**`, IAM endpoints, tokens, grants, recovery, consent, POST/PATCH/PUT/DELETE and cross-origin requests are never saved in worker Cache Storage. Protected web paths also send `Cache-Control: private, no-store`. The offline page includes no old identity, user role, account, grant or authorization decision. It can retry the public home route when the connection returns.

Connection is required for login, registration, recovery, person resolution, context and organization changes, app onboarding/proof, grants, shared logout and every authority check. Offline status is inferred from actual transport failure, not solely `navigator.onLine`. There is no Background Sync queue for identity actions. A local-only sign-out must be distinguished from remote shared-session termination; the worker cannot claim the latter while offline.

## Updates and recovery

Registration and update checks occur on open, focus/foreground, reconnect and a throttled interval. A new worker waits. The update UI offers **Update now** or **Later**; `/auth`, `/recovery`, `/account`, `/identity`, `/contexts`, `/organizations`, `/apps` and edited forms are critical boundaries, so activation requires returning to the public home route. The worker accepts an activation message from its same-origin client. Only that tab reloads on controller change if still safe. BroadcastChannel announces availability across tabs; it carries no identity data and does not authorize anything. Other tabs never receive a forced reload.

If registration or an update check fails, the current application remains usable online and a future check retries. Repair only the worker and replaceable `accesslobby-static-*` caches if diagnostics require it. Do not clear all caches, cookies, localStorage or IndexedDB as routine recovery. A browser/session or IAM failure still requires normal server-side recovery.

## Browser storage inventory

| Store | Owner and purpose | Sensitivity | Sign-out and update behavior |
| --- | --- | --- | --- |
| HttpOnly `__Host-al-session` / local `al-session` | First-party web, sealed access-token session, at most one hour | Security-critical | Both sign-out choices clear it; worker never reads/caches it. Normal update preserves it. |
| HttpOnly `__Host-al-flow` / local `al-flow` | Short OIDC state, nonce and verifier flow | Security-critical | Callback/logout clears it; worker never reads/caches it. No activation during auth flow. |
| HttpOnly context cookie | First-party web, sealed person-bound context selection | Security-sensitive, rechecked server-side | Logout clears it; normal update preserves it. Never authorization truth offline. |
| `localStorage.accesslobby-theme` | Web presentation preference | Replaceable, non-sensitive | Preserved across sign-out/update; can be rebuilt. |
| `accesslobby-static-*` Cache Storage | Worker assets and neutral offline page | Replaceable | No private data; old generations cleaned selectively. |
| IndexedDB / sessionStorage | No AccessLobby-owned usage in current web source | None | Do not introduce solely for PWA branding. |

## Required evidence

The **PWA staging browser qualification** workflow runs against the stable staging web origin and an explicit deployed SHA, separately from the tester's source revision. It uses a disposable persistent Chromium profile and the standard browser protocol to verify actual install/standalone behavior where supported; it does not emulate display mode and call that an installation. It records public worker/cache/offline/reconnect checks, six-width reflow and bounded network-emulation metrics. Credentials and identity snapshots are absent. Authenticated installed use, real two-artifact A→B and physical/mobile devices require separate evidence. See [the owner instructions](../runbooks/pwa-owner-check.md) and [the September 30 record](../qa/pwa-2026-09-30/README.md).

CI builds the production web app and checks manifest, worker headers/scope, cache exclusion and a Chromium production build smoke covering offline navigation and waiting-worker activation at one origin. CI is not evidence that a deployed artifact installed or authenticated. [The staging runbook](../runbooks/pwa-staging-acceptance.md) records exact digest/SHA, installed Chromium, online sign-in, both logout scopes, offline cold start, reconnect, signed-out back-navigation, and real A→B deployment. Android Chrome and iOS Safari require device evidence or remain `NOT RUN`.

The present CI smoke runs one compiled production app with two synthetic runtime build IDs at one loopback origin. Its offline navigation and waiting-worker/controller test is implementation evidence; it does not qualify two different released artifacts or a closed/reopened OS-installed app. Stable-origin installed A→B acceptance requires two separately qualified artifact digests. `infra/scripts/pwa_staging_preflight.py` is a credential-free HTTP gate for manifest/icons/offline delivery, exact worker runtime SHA and protected caching headers; a PASS does not prove browser cache contents, worker control, installation or IAM/session behavior. See [the published candidate handoff](../runbooks/pwa-staging-handoff-2026-09-30.md).
