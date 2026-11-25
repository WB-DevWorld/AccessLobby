# ADR 017 — Application suspension, participating sessions and organization investigation

Status: implementation candidate, 2026-11-25. Builds on ADR015/016 and qualified PR75 source750f51a. Issue76 tracks source qualification and separate staging acceptance. Cursor retains WordPress collision/new-registration qualification.

## Application suspension

An `application_operator` can inspect the suspension page at `/admin/applications/ID/suspension`, enter the exact client ID and a non-secret change reference, then suspend an active first-party registration. Ordinary publishers, organization administrators and token role claims confer no platform authority. Core `accesslobby-web` and `accesslobby-api` registrations are protected from this browser action.

The transaction locks the app, rechecks current person/role authority, validates expected status/administration version, changes registry state, removes that client's receipts and writes application/operator audits together. The version advances on covered app/configuration/proof/review/activation changes. Identical retries return unchanged only for the matching current suspension; stale pages cannot act after another transition. Audit failure rolls back all database changes.

Receipt issuance now locks a registered application before its person and rechecks active first-party state inside the transaction. A preflight check cannot authorize issuance after suspension. If issuance already holds the lock, it finishes first and the following suspension removes that receipt. Deterministic PostgreSQL tests cover both directions without a lock cycle.

The result ends AccessLobby admission and recorded receipt authority. It does not disable the IAM client, delete grants/accounts/orders, clear another application's cookie or promise immediate control of an unchecked peer. Existing peer status/expiry/outage behavior still applies. This slice intentionally implements suspension only: reviewed reinstatement/retirement and any IAM changes remain separate protected operations. The UI offers no misleading resume button.

## Participating application sessions

`/admin/people/ID/sessions` lists currently stored, unexpired receipt-backed application associations. Each association groups one person's receipts for one internal issuer/session/client tuple, but its public fields contain only an independent UUID handle, app/client name, observed receipt dates/count and an opaque metadata snapshot. Raw IAM session IDs, provider subjects, capability hashes, tokens, IP addresses and invented device names are absent.

Any current console reader may inspect. Ending an inspected group requires `identity_operator`, a matching snapshot and a recorded reference. Self-targets and people holding any unrevoked platform role use the protected operator-offboarding route instead. The mutation locks actor/target people in deterministic order, rechecks current roles, rejects a changed receipt group and removes only the inspected association, with audit and idempotency metadata committed atomically. New issuance waits on the existing person lock. Other clients/browser sessions remain untouched.

Opaque tombstones make retries harmless after fresh authentication. They contain console metadata, not capabilities or IAM session IDs. A bounded cleanup removes at most100 eligible records after30days during mutation; without activity, retention may be longer. This is not a user-visible history-retention promise.

The action means the central receipt association ended. The peer observes it on its next negotiated check under its existing expiry/outage contract. IAM cookies, bearer validity and admission remain separate, so an admitted person may authenticate again, including quiet SSO, and obtain fresh receipts. It is not a device ban or global IAM logout. Bearer-only, expired or otherwise unobserved sessions are not invented in the list.

## Organization investigation

`/admin/organizations/ID` adds read-only investigation of stored organization details, membership states, invitation states/expiry and organization events. Each section has native paging capped at25records. Creator/person IDs link to the existing protected person views. Unknown stored event text becomes a generic event, rather than exposing arbitrary raw content.

The current database operator role is checked for each request. Ordinary ownership/membership and IAM token roles remain insufficient. The UI distinguishes stored invitation status from a pending invitation whose expiry has passed, and it replaces the inspection view after authorization loss. Names remain self-asserted. There is no legal verification, ownership takeover, lost-owner recovery or cross-system audit claim.

## Private IAM access and delivery

The separate [private console package](../runbooks/private-iam-console.md) prepares a loopback-only TLS companion and an exact-authority browser connection helper. It preserves the canonical IAM origin and existing public gateway restrictions. Native disposable acceptance must prove genuine administrative login, assets/master callbacks and visible realm controls while public admin/master remain denied. Prepared source and a fixture login do not establish a live staging route or multi-realm AccessLobby support.

Migrations014/015 add administration version tracking and independent console receipt handles/tombstones. They follow011–013; reserved007/008 remain excluded. Schema reruns preserve current versions and handles. Use qualified artifacts, current backup/recovery evidence, compatible migration and private operator bootstrap. Keep the application/IAM database boundary and peer-local authorization intact. [Round-three runbook](../runbooks/operator-round-3.md).
