# AccessLobby WordPress: alpha.2 historical comparison acceptance

The [alpha.3 acceptance](alpha3-acceptance.md) is the newer qualification. This file retains the exact alpha.2 checkpoint.

2026-11-23 UTC. A reviewable first-party candidate is implemented and qualified in reproducible fixtures. The first-party estate MVP and universal external support remain incomplete. No winner is selected.

## Current AccessLobby state

- Main: `3d9220a140d61df5effe633bc72cf5142c4a8371`, unchanged by this work.
- Public web, API readiness and issuer discovery return HTTP200. API readiness advertises the same main SHA. Private container/image digests and full live IAM configuration were not read back; these checks do not qualify a new deployment.
- The common Cursor handoff was `92afbb261672401426aa4d8d3ad36f2e81ac13fd`. Cursor independently advanced PR60 / `feat/wordpress-connector` (observed head `8b3481000b30652d47cf75e71f9d4310be3ad55e`); its implementation has not been reviewed or changed by this candidate.
- Independent candidate: PR61 / `feat/wordpress-codex-comparison`. Tested implementation head: `a04f35944b9c3af304d9cdfda89650cbb6770c21`. A later evidence-only commit adds these retained reports without changing packaged bytes.
- Issue59 remains open for actual estate adoption and external privacy/onboarding gates.

## Connector and artifact

Repository: [WB-DevWorld/AccessLobby](https://github.com/WB-DevWorld/AccessLobby), self-contained independently versioned package `integrations/wordpress`; ADR009 records its repository boundary. No duplicate connector repository was created.

Version: **0.1.0-alpha.2**. Normal installable ZIP: `accesslobby-sso-0.1.0-alpha.2.zip`. SHA256: `3fd9652455522eb23d50f04b161f529b0a656805bebddf5b0c69a3f489fba81c`. All 48 packaged files match the tested source and later evidence-only head byte-for-byte. CI installs that actual ZIP. The review bundle includes ZIP/hash, source delta bundle, administrator/developer/recovery guides and sanitized evidence. This is a comparison artifact, not a production release.

The common handoff already included the protocol/unit baseline. This independent increment adds real fixtures/browser qualification, stronger audit/JIT/storage/schema checks, link-session rotation, profile/cache fixes, enforced rollback/reactivation behavior, and comparison criteria. It also updates Next to 16.4.6 and narrowly patches transitive dependencies so the existing production dependency audit passes; AccessLobby API/UI/PWA source behavior is otherwise unchanged.

## Authentication modes and account flows

Both modes are exercised on root and independent `/gh/` installations. Hybrid preserves local login and adds Continue with AccessLobby. Enforced mode automatically starts IAM from core/admin/frontend/My Account surfaces and returns to the safe original target. A proves the real administrator readiness UI; B uses an explicit host-only fixture policy to isolate subdirectory behavior. An unprepared administrator cannot enable enforcement through settings.

| Flow | Result and boundary |
|---|---|
| New visitor / Join | Real registration and captured synthetic email verification precede one safe local account; repeat SSO reuses it |
| JIT | Explicit opt-in; validated identity/admission/verified email; subscriber/customer only; post-hook role/capability checks; no privileged JIT |
| Existing link | Current original local session plus fresh IAM proof, bounded state/nonce/PKCE, atomic unique mapping and audit; session rotates/binds to sid |
| Existing unlinked account | Email match creates no link or duplicate; user must prove the local account in hybrid migration or use controlled host recovery |
| Staff/admin | Explicit linking preserves existing capabilities; no organization-owner or claim-to-admin mapping |
| Customer | Original user ID/role/order customer IDs/addresses/business metadata remain; no Woo tables replaced |
| Guest | Real enforced-mode guest order has customer ID 0, expected total and unchanged WordPress user count |
| Unlink | Fresh dual proof in hybrid, retained inactive mapping, linked sessions invalidated; direct data-layer and audit-failure tests pass; full unlink browser UX is not certified separately |
| Recovery / rollback | Exact-IP host-issued one-use HTTPS ticket/replay tested; local rollback login works; enforced reactivation invalidates rollback-created cookie sessions |

No password/hash synchronization, email auto-merge or privileged role mapping exists. Membership/B2B entitlement remains local. The durable mapping uses issuer/person and issuer/subject unique keys to the existing WP user ID; a verified same-person subject change retains that ID. Issuer/client changes with linked users require controlled host migration.

Enforced mode also closes direct cookie-issuance and anonymous local Core/Woo registration paths. A valid local-password custom frontend is exercised as a positive control in hybrid mode and denied in enforced mode. Forged checkout signup is rejected, an enforced recovery ticket still works, and real Application Password REST access follows its explicit setting. Guest/signup options remain unchanged.

## Logout

Site-only destroys the current WordPress session, leaves peer/IAM sessions active and permits quiet re-entry. All-connected-apps ends the shared browser IAM session after the issuer's confirmation and triggers actual signed backchannel invalidation on both participating peers. It does not mean all devices. Wrong issuer/audience/signature/nonce/event/age/replay and unrelated-sid controls are tested across unit/database/browser layers; a different WP sid remains valid.

Only matching session tokens are invalidated. Tokens are encrypted in local association rows; OAuth access/refresh tokens are not persisted. Temporarily unavailable-peer delivery/reconciliation is a remaining production gate: the issuer's notification is not a durable cross-application logout queue, and an unavailable peer may retain a session until its bounded expiry. Do not describe that case as immediate guaranteed logout.

## Site qualification

The following are isolated CI installations with actual Keycloak 26.7.0, the unchanged AccessLobby API, PostgreSQL 17.11 and MariaDB 11.8.9, separate WordPress databases/client registrations and HTTPS origin ports. Pinned fixture versions are reproducibility evidence; production promotion still requires current security patch/support review. They are not public estate or external-publisher pilots.

| Fixture | Path | WordPress | PHP | Woo | Theme | Plugins | Modes | Result |
|---|---|---|---|---|---|---|---|---|
| WP71-CLASSIC A | root | 7.1.5 | 8.4.28 | 11.3.1 | Twenty Twenty-Five 1.5 | WooCommerce (HPOS=False); AccessLobby | hybrid + enforced | 43 DB / 19 security; PASS |
| WP71-CLASSIC B | /gh/ | 7.1.5 | 8.4.28 | none | Twenty Twenty-Five 1.5 | AccessLobby | hybrid + enforced | 41 DB / 19 security; PASS |
| WP71-HPOS A | root | 7.1.5 | 8.3.37 | 11.3.1 | Twenty Twenty-Five 1.5 | WooCommerce (HPOS=True); AccessLobby | hybrid + enforced | 43 DB / 19 security; PASS |
| WP71-HPOS B | /gh/ | 7.1.5 | 8.3.37 | none | Twenty Twenty-Five 1.5 | AccessLobby | hybrid + enforced | 41 DB / 19 security; PASS |
| WP69 A | root | 6.9.12 | 8.3.37 | none | Twenty Twenty-Five 1.4 | AccessLobby | hybrid + enforced | 41 DB / 19 security; PASS |
| WP69 B | /gh/ | 6.9.12 | 8.3.37 | none | Twenty Twenty-Five 1.4 | AccessLobby | hybrid + enforced | 41 DB / 19 security; PASS |

Each matrix proves quiet second-site SSO without a second credential challenge, independent local IDs/roles and real issuer backchannel. These are same-host distinct HTTPS origin ports; public cross-domain estate behavior remains a separate gate. Classic Woo login/checkout and a block-theme receipt are exercised with both classic CPT and HPOS authoritative order storage; the fixture verifies the actual datastore before creating orders. The public HPOS compatibility declaration and WooCommerce CRUD avoid direct order-table access. Checkout Blocks/modern enhanced account UX are not inferred.

| Owner estate | Current observed software | Authentication/link/JIT/logout/SSO | Status |
|---|---|---|---|
| staging.cetechbpa.com | Not inventoried here | NOT RUN | BLOCKED: workspace SSH network unreachable |
| training.cetechbpa.com | Not inventoried here | NOT RUN | BLOCKED; owner reports Cursor can access |
| training.flairoc.com | Not inventoried here | NOT RUN | BLOCKED; owner reports Cursor can access |
| flairoc.com/gh/ | Historical separate physical-install lead; current topology unverified | NOT RUN | No production mutation |
| flairoc.com/intl/ | Historical separate physical-install lead; current topology unverified | NOT RUN | No production mutation |
| CETECH /gh /ng /en, pos.cetechbpa.com | Historical leads; do not assume current WP topology | NOT RUN | Locate/inventory before onboarding |

Private SSH routes remain in the original owner handoff. No credentials were requested in chat or committed. Actual WoodMart/B2BKing/WPML/Wordfence/WP Rocket/Redis/Cloudflare/mobile qualification needs the licensed stack and reachable controlled hosts. Simulated business metadata preservation is not B2BKing certification. Subscriptions/download relationships need their installed extension/data. Multisite is explicitly unsupported; arbitrary membership plugins are untested.

## External support

Reviewed first-party client support is implemented. Arbitrary external publisher activation remains closed under the existing external-app decision. Pairwise/app-scoped token-wide privacy, internal-person continuity without duplication, minimal claims/audiences, consent, domain/publisher proof, safe client provisioning/lifecycle/transfer/revocation and an independent external-like pilot are not implemented. An ID-token pairwise mapper alone would not establish the required privacy contract. No universal WordPress/self-registration claim is made.

## Evidence and exact revisions

[WordPress CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45268971715) at tested candidate `a04f35944b9c3af304d9cdfda89650cbb6770c21`: PHP8.3/8.4/8.5 locked dependency/protocol/static/coding/package jobs and the real runtime/browser matrix: Woo classic CPT on PHP8.4, Woo HPOS on PHP8.3, and plain WP6.9 on PHP8.3. Each retained `build.json` records the actual PR merge checkout, candidate head, clean-source flag, archive hashes and matching package SHA256.

- wp71-classic: 39 real browser cases; checkout 387b9029dcca68c1fff1ba11aa29079b13b98f13
- wp71-hpos: 39 real browser cases; checkout 387b9029dcca68c1fff1ba11aa29079b13b98f13
- wp69: 35 real browser cases; checkout 387b9029dcca68c1fff1ba11aa29079b13b98f13

[General regression CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45268971694): API migration/typecheck/tests/build, dependency audit, UI/account actions, PWA offline/update lifecycle, Enben story, IAM smoke, container/proxy/Compose and forbidden-material checks. [IAM theme](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45268971735) also passes. Protocol baseline is 39 tests/44 assertions per PHP job. Native earlier HTTP17/database/security reports are retained separately with their own runtime package hash; they are not substituted for browser UI proof.

Categorical JSON under `ci-a04f3594` is retained in Git so evidence survives CI artifact expiry. No private credentials, verification mail links, raw realm/runtime logs or historical exports are included. Local Chromium is restricted by the workspace's Unix-socket policy; actual browser proof ran in CI.

## Remaining work

1. Compare Cursor's exact candidate using the same cases. No implementation is selected or merged; no efficiency ranking is invented without comparable timing/access/defect evidence.
2. Install a selected/reviewed package in reachable backed-up CETECH/FLAIROC training/staging clones; register actual distinct reviewed clients, inventory versions/themes/plugins/users, prove real public-site SSO, preserved commerce, security/cache/proxy behavior and recovery/restore. The first-party MVP is not complete until that real controlled vertical slice passes.
3. Complete production security/load/availability review, unavailable-peer logout behavior and the remaining actual extension/frontend/machine-auth variants before controlled promotion. PHP8.5 has protocol coverage, not a WP/Woo browser certification.
4. Implement and qualify the separate external privacy/onboarding contract and isolated external pilot before enabling third-party operators. Multisite needs its own shared-user/session contract.

This candidate has not been deployed to the owner’s estate, AccessLobby staging or main. Cursor may be independently qualifying its own candidate; that work is not inferred from this run. The standalone connector is reviewable, installable and reproducibly qualified within the stated matrix; the remaining gates are explicit.
