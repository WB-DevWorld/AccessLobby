# ADR 009 — WordPress connector pilot boundary

Status: MVP-PROVISIONAL development checkpoint; no deployment approval. Owner requested implementation on 2026-11-23, then explicitly selected a Cursor handoff because Cursor already reaches the estate SSH hosts.

The standalone independently versioned plugin lives in `integrations/wordpress` pending access to create a canonical separate repository. WB-DevWorld searches found no connector; current GitHub tools cannot create repositories and browser fallback is signed out. The plugin has no TypeScript service dependency and builds as a normal ZIP. Extract it later without duplicating canonical sources.

It consumes existing first-party OIDC + `/v1/me` + `/v1/application-entry`; at the initial alpha.1 checkpoint AccessLobby API/IAM/PWA code was unchanged. ADR010 records the later additive API/session extension. WordPress IDs/roles/capabilities, commerce/member records and guest policies stay local. No automatic email link, claim-based elevation or password synchronization is accepted. Two owner-required modes and logout choices are implemented as candidate code; actual runtime qualification is outstanding.

Source acceptance is in `integrations/wordpress/docs/source-acceptance.md` (28 topics). The contract, source, unit suite, isolated maintained JWT dependency, packaging, initial CI and administrator/migration/recovery/developer guides are present. Exact local evidence and outstanding work are in `docs/qa/wordpress-2026-11-23/checkpoint.json` and the [Cursor handoff](../runbooks/wordpress-cursor-handoff.md).

External publishers remain closed under the existing external decision gate. Multisite is explicitly rejected. No first-party storefront migration, client registration, server change, merge or production release is inferred from the development ZIP. Relates to #59; that umbrella must remain open.

## Independent implementation continuation — 2026-11-23

The owner subsequently authorized continued implementation here alongside Cursor on a separate branch. PR61 / `feat/wordpress-codex-comparison` extends the preserved PR60 handoff. Real IAM/API/two-installation fixtures and remote Chromium now establish bounded login/link/Join/SSO/logout/enforcement/recovery/rollback/guest behavior; exact revisions and categorical reports are in [comparison evidence](../qa/wordpress-codex-2026-11-23/README.md). Native HTTP results remain separate from browser proof. Later guards cover cookie issuance and anonymous core/Woo registration so supported local frontends cannot bypass enforced SSO. Machine/API policy and guest commerce remain distinct.

The pilot boundary and external/multisite gates remain. Actual estate adoption and licensed theme/cache/security qualification are still required. Neither candidate is selected or merged by these results; use the [common comparison criteria](../wordpress-candidate-comparison.md).
