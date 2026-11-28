# Source of truth

Current owner instructions govern intent. Sanitized decisions here reflect focused acceptance of the 2026-09-23 AccessLobby Source Pack (DEC-001 through DEC-011, conflict/traceability registers), its attached August 7 and August 30 evidence, the transfer-kit D-008/D-009, and native AccessLobby 1/2 verification on 2026-09-24. The raw pack and documents are private working evidence and are deliberately absent from Git.

The September 29 [current-state audit](docs/ACCESSLOBBY-CURRENT-STATE-AUDIT.md) and [MVP reconciliation](docs/ACCESSLOBBY-MVP-RECONCILIATION.md) incorporate later controlled-pilot/generic-consumer corrections, the account and first-party onboarding implementation, exact-revision operator evidence and native-document checks. They preserve historical expectations and unresolved ownership rather than silently redefining product intent.

Runtime truth comes from committed SHA, CI, migration state and observed deployment. Historical suggestions do not prove implementation. A disagreement is recorded as SOURCE EXPECTATION / LIVE FACT / CONFLICT / RESOLUTION before altering product truth.

## Current PWA decision — 2026-09-30

The owner explicitly decided that AccessLobby **is a Progressive Web App**. Installability, safe service-worker updates, an offline/degraded shell and installed-device acceptance are required product work. An offline shell never authenticates or authorizes a person, and no browser cache becomes identity, membership or application-access truth. The current implementation standard is [docs/standards/PWA.md](docs/standards/PWA.md); issue #48 tracks exact-artifact staging and device qualification. Older “PWA where appropriate” language is historical, not current intent.

The [September 30 desktop staging acceptance](docs/qa/pwa-2026-09-30/build-b-acceptance.md) records the owner's physical installed sign-in/logout, truthful offline/reconnect and real A→B session/theme preservation with exact running web digests. Mobile and additional installed edge cases remain NOT RUN under [#52](https://github.com/WB-DevWorld/AccessLobby/issues/52); the desktop result does not establish production or all-platform acceptance.

## Operator staging deployment — updated 2026-11-28

Committed evidence0d81d1f accepted the original operator deployment, isolated restore and migrations001–006/009–015. Later8aa3db2/3c7834b established the real human’s three operator grants. Evidence d8ebd66a95d18903f3ff8caae405a4db6233b79c now establishes rendering release713140ad93ba1ade406ec6af4cfffb052a817a9c at its exact API/web digests, matching durable/effective pins and activated worker. Evidence65bedeb65b945f456229a7d79aaab6c5b09b6bab accepts visible owner overview/all3capabilities, hard reload, People→Overview, all4directory/history tables, nested organization and closed realm disclosure at11:21:16–11:21:52UTC on28November. No assets failed, migration ran or role was regranted. This supersedes the hidden/signed-out visible-read gate, without establishing the exact original Edge cause. [Current evidence](docs/qa/operator-staging-2026-11-27/README.md), [release pins](docs/releases/operator-rendering-copy-staging-2026-11-27.json).

Private Keycloak browser access, controlled administrative mutation/session/app-lifecycle qualification and production remain separate gates. New round-four source work adds self-service recorded sessions, safe app launch metadata and audit tooling; it is not accepted on staging merely because the prior console passed. Preserve accepted WordPress users/mappings/roles/orders; totals are dated observations rather than targets.
