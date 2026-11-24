# ADR 009 — WordPress connector pilot boundary

Status: MVP-PROVISIONAL development checkpoint; no deployment approval. Owner requested implementation on 2026-11-23, then explicitly selected a Cursor handoff because Cursor already reaches the estate SSH hosts.

The standalone independently versioned plugin lives in `integrations/wordpress` pending access to create a canonical separate repository. WB-DevWorld searches found no connector; current GitHub tools cannot create repositories and browser fallback is signed out. The plugin has no TypeScript service dependency and builds as a normal ZIP. Extract it later without duplicating canonical sources.

It consumes existing first-party OIDC + `/v1/me` + `/v1/application-entry`; current AccessLobby API/IAM/PWA code is unchanged. WordPress IDs/roles/capabilities, commerce/member records and guest policies stay local. No automatic email link, claim-based elevation or password synchronization is accepted. Two owner-required modes and logout choices are implemented as candidate code; actual runtime qualification is outstanding.

Source acceptance is in `integrations/wordpress/docs/source-acceptance.md` (28 topics). The contract, source, unit suite, isolated maintained JWT dependency, packaging, initial CI and administrator/migration/recovery/developer guides are present. Exact local evidence and outstanding work are in `docs/qa/wordpress-2026-11-23/checkpoint.json` and the [Cursor handoff](../runbooks/wordpress-cursor-handoff.md).

External publishers remain closed under the existing external decision gate. Multisite is explicitly rejected. No first-party storefront migration, client registration, server change, merge or production release is inferred from the development ZIP. Relates to #59; that umbrella must remain open.
