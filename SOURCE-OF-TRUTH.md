# Source of truth

Current owner instructions govern intent. Sanitized decisions here reflect focused acceptance of the 2026-09-23 AccessLobby Source Pack (DEC-001 through DEC-011, conflict/traceability registers), its attached August 7 and August 30 evidence, the transfer-kit D-008/D-009, and native AccessLobby 1/2 verification on 2026-09-24. The raw pack and documents are private working evidence and are deliberately absent from Git.

The September 29 [current-state audit](docs/ACCESSLOBBY-CURRENT-STATE-AUDIT.md) and [MVP reconciliation](docs/ACCESSLOBBY-MVP-RECONCILIATION.md) incorporate later controlled-pilot/generic-consumer corrections, the account and first-party onboarding implementation, exact-revision operator evidence and native-document checks. They preserve historical expectations and unresolved ownership rather than silently redefining product intent.

Runtime truth comes from committed SHA, CI, migration state and observed deployment. Historical suggestions do not prove implementation. A disagreement is recorded as SOURCE EXPECTATION / LIVE FACT / CONFLICT / RESOLUTION before altering product truth.

## Current PWA decision — 2026-09-30

The owner explicitly decided that AccessLobby **is a Progressive Web App**. Installability, safe service-worker updates, an offline/degraded shell and installed-device acceptance are required product work. An offline shell never authenticates or authorizes a person, and no browser cache becomes identity, membership or application-access truth. The current implementation standard is [docs/standards/PWA.md](docs/standards/PWA.md); issue #48 tracks exact-artifact staging and device qualification. Older “PWA where appropriate” language is historical, not current intent.

The [September 30 desktop staging acceptance](docs/qa/pwa-2026-09-30/build-b-acceptance.md) records the owner's physical installed sign-in/logout, truthful offline/reconnect and real A→B session/theme preservation with exact running web digests. Mobile and additional installed edge cases remain NOT RUN under [#52](https://github.com/WB-DevWorld/AccessLobby/issues/52); the desktop result does not establish production or all-platform acceptance.

## Operator staging deployment — 2026-11-27

Committed operator evidence `0d81d1f` accepted the earlier29292fbe deployment, isolated restore and migrations001–006/009–015. Follow-ups8aa3db2/3c7834b confirmed the real human’s three operator grants and signed-in directory/audit reads. Evidence `ba39cd813f96d0bc1f297fb8e51180a05b83566b` now records the qualifiedc4206d9a API/web release and matching activated worker running at their exact digests, with effective/durable pins, preserved IAM/gateway/session secret and anonymous401. No new migration or regrant ran. Subsequent evidence5f6008d records a confirmed signed-in owner with the worker active, zero failed assets, and capability/directory data hidden at0×0 behind the loading boundary. Visible acceptance remains blocked; the exact browser reveal cause is not established. Private Keycloak access and production remain open. [Current evidence](docs/qa/operator-staging-2026-11-27/README.md), [release pins](docs/releases/operator-worker-staging-2026-11-27.json). Accepted WordPress mappings remain preserved; user totals are dated observations and must not be forced to old counts.
