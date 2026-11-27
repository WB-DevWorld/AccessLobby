# Optional cache failure and operator overview — 27 November 2026

The actual staging grants and signed-in directory reads are recorded in the [staging observations](../operator-staging-2026-11-27/README.md). This investigation used a separate loopback production Next build, compiled Nest API, isolated PostgreSQL 17.11 and synthetic signed OIDC identities. It did not modify live AccessLobby, IAM, mail, WordPress or the owner's roles. Chromium 158 was used locally.

## Reproduced failure

Baseline source `7b0abf24fdd95e2db02f0ed01d3643646b80678b` with the added test harness passed ordinary worker-controlled hard reload and People → Overview client navigation. Injecting a rejected `CacheStorage.open` inside the actual installed worker then caused ten static requests to fail, with no successful worker-delivered script or stylesheet. The baseline visibly completed the overview in this local case; it did **not** reproduce staging's stuck loading boundary. A failing cache operation is a demonstrated asset-delivery defect, not an established cause of that separate live observation.

The worker previously awaited cache open, read and write before returning JavaScript or CSS. A rejected optional operation therefore discarded otherwise usable network delivery; a never-settling write also held it up. The new VM regression file had 5 passes and 12 failures on the old worker before the four lifecycle cases were added.

## Implemented behavior

- Rejected static cache opening or reading falls through to the network. A genuine network failure still fails normally.
- A successful eligible network response reaches the browser without waiting for optional caching. Its clone is stored in a separately registered worker lifetime task; rejected or pending writes cannot hold up delivery.
- A rejected offline-cache lookup produces the same neutral connection-required response.
- Failed optional shell precaching no longer prevents installing the new worker. Failed old-cache cleanup no longer prevents claiming clients after authorized activation.
- Private documents, API and RSC responses remain outside Cache Storage. Explicit update activation, safe-window checks, cache ownership and current/previous build retention are preserved.

An indefinitely pending cache **read/open** remains outside this change's coverage. The fix handles their rejection and a pending write; it does not claim every possible storage hang is bounded.

## Local result

The candidate working tree above `7b0abf24` passed all 85 web tests, including 21 new behavioral worker tests, TypeScript checking and the production build. The joined actual-worker/API/database browser run passed all 18 groups:

| Case | Result |
|---|---|
| Actual worker scope/controller, no-store hard reload, visible overview and all three capabilities | Pass |
| Same-document People → Overview navigation and hidden loading state | Pass |
| Rejected cache open, rejected match, rejected write and never-settling write | All four pass; actual worker-delivered JavaScript and CSS succeed, overview visible |
| Current database role revocation with the same bearer | Denied after reload |
| Genuinely signed expired bearer inside an unexpired sealed web cookie | Sign-in state; no reused private overview |
| Cache inventory | 18 approved static/shell entries, zero private entries |
| Retained authentication, directory, review, CSRF and authorization groups | Pass |

The retained PWA browser smoke also passed neutral offline handling, reconnection, real worker A→B activation, critical/dirty/unresponsive peer guards, retry, no peer reload and preserved presentation/cookie state. Worker faults are injected only into the owned disposable browser profile. The test disables the HTTP cache while leaving service-worker interception enabled; it requires `fromServiceWorker`, script/CSS responses and visible completion rather than accepting hidden HTML.

These results were obtained on an explicitly dirty candidate tree and are not attributed to unchanged baseline source. Exact committed-tree CI must succeed separately. CI's existing joined operator step now includes these regressions; it retains only categorical evidence, not bearer values, provider/session identifiers or the real owner's identifier. No live deployment, installed-device result or completed staging overview acceptance is inferred.

## Staging follow-up

Deploy only a reviewed, source-bound application release, preserving the session secret and all IAM/mail/WordPress settings. Do not regrant the owner's roles. Use a fresh owner session, retain worker control, and observe actual visible overview completion plus the three capabilities, directory navigation and audit. Capture only safe error categories and static resource status counts if it still stalls. Keep the actual token-expiry boundary distinct from an unexplained sign-out. The independent private IAM certificate/access and controlled administrative workflow gates remain open.
