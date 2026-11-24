# Cursor implementation handoff — AccessLobby WordPress

Owner direction, 2026-11-23: **Prepare the Cursor handoff now.** Cursor should finish implementation and site qualification using its existing SSH access. This is a work-in-progress transfer, not acceptance of a finished plugin.

## Resume from the preserved work

Repository: `WB-DevWorld/AccessLobby`; branch `feat/wordpress-connector`; linked umbrella issue [#59](https://github.com/WB-DevWorld/AccessLobby/issues/59). Resolve the current branch SHA and draft PR before edits. Initial accepted main and public staging API were `3d9220a140d61df5effe633bc72cf5142c4a8371`. Main had no open PR when inspected; CI/theme/PWA/image publishing passed. Web/API/discovery were reachable and ready at that revision. No private running image digests/IAM configuration were read back in this run.

Read repository AGENTS.md, PROJECT-CONSTITUTION.md, SOURCE-OF-TRUTH.md, CURRENT-WORK.md and OWNERSHIP.md. Then read current integration/onboarding/account/external/logout/PWA contracts and the new ADR009 plus `integrations/wordpress/docs/contract-v0.1.md`, source-acceptance and developer guide. Reconcile newer main instead of replacing it with this checkpoint.

The private owner handoff bundle contains exact SSH routes and all seven supplied project source archives/histories. Do not commit that private bundle, raw histories, credentials, generated realms or customer records. The 28 focused source-acceptance passes are recorded; do not restart a full forensic reconstruction unless materially new evidence changes the design. The original owner implementation objective still governs all unfinished work.

## What exists

- Self-contained candidate plugin `integrations/wordpress`, version `0.1.0-alpha.1`, with thin bootstrap and separate protocol/token/identity mapping/session/admin/frontend/recovery classes.
- Public Code/PKCE S256, state/nonce/browser binding, pinned discovery/JWKS/RS256, signed ID/access checks, versioned `/v1/me` and mandatory first-party application admission.
- Indexed unique issuer/person/subject/local-user mapping; explicit bounded local-session + fresh OIDC linking; safe opt-in subscriber/customer JIT; no email merging; inactive links retained on unlink.
- Hybrid/enforced candidate modes, core/Woo hooks, generic frontend/modal adapter, shortcode/block/template helpers; readiness-gated enforcement and host-configured exact-IP one-use emergency tickets.
- Local/shared logout chooser; signed replay-protected sid-scoped backchannel code; encrypted transient/session state; audit classes; deliberate data-preserving uninstall.
- Locked maintained `firebase/php-jwt` v7.2.2, isolated namespace/provenance/license; Composer tooling; deterministic packaging; initial PHP 8.3/8.4/8.5 protocol/static/package CI.
- Administrator/setup/migration/recovery/security/logout/troubleshooting/developer/compatibility/external/site guides. No production promotion.

These are implementation-presence statements. They do not mean the browser, WordPress, WooCommerce, WoodMart, estate or external profile has passed.

## Verified at transfer

Locally on PHP 8.4.27: PHPUnit **39/39 tests, 44 assertions**; PHP syntax passed; configured WordPress coding/security checks passed; PHPStan level 5 passed; Composer audit reported no known advisories; Python scripts compile; deterministic candidate ZIP builds and archive validation passes. Exact evidence is in the checkpoint JSON. Remote CI is separate and must be inspected for the transferred head.

**Not run:** plugin ZIP activation/install/upgrade/uninstall inside a working WordPress runtime; whole OIDC/browser flow; dual-proof controller linking; real Woo preservation; real emergency recovery; cache/CDN/security compatibility; quiet two-site SSO; cross-app backchannel propagation; any estate deployment; external identity/onboarding. No completion percentage is appropriate.

## First concrete task: finish and run the real fixtures

The native `scripts/qualify.py` harness and PHP integration/setup fixtures are **incomplete**. It intentionally refuses before starting services because `tests/browser.mjs` does not yet exist. Complete/review that driver and the harness. Do not claim the guard's expected exit as a successful runtime test.

Its intended topology uses actual Keycloak 26.7.0, unchanged AccessLobby API, PostgreSQL and MariaDB, WordPress root Site A with WooCommerce, and a separate database/client/subdirectory Site B. Registry DNS/review state is synthetic in that fixture; it does not qualify live onboarding. No production user or credential is involved.

The earlier workspace prepared native PHP 8.4.27, MariaDB 11.8.6, PostgreSQL 17.12, Java 21.0.13, Keycloak 26.7.0, WP 7.1.5 and a WooCommerce download. Those scratch runtimes are not part of the portable package and may disappear. Cursor should use reproducible containers/local tools. Keep fixtures isolated and disposable. Run the API using the repository's existing build/migration tooling.

The managed workspace isolated each execution's loopback/process namespace, so separate terminal cells could not reach a previously started DB. A single orchestrator was being prepared. Cursor may not share this limitation. Avoid reproducing environment workarounds unnecessarily.

## Review before piloting

Treat all candidate code as unreviewed until actual integration/security tests pass. Pay particular attention to:

1. Atomic JIT/link transactions and WP user-cache/hook side effects; global mapping/email races; exact one-to-one constraints and original-value collision checks.
2. Post-provisioning role/capability checks after other plugins' hooks; no privileged JIT even when claims or site defaults are malicious.
3. Durable audit behavior if audit insertion fails; privileged linking/recovery must not silently lose audit evidence.
4. Readiness inventory currently enumerates administrator/editor/shop-manager role names; classify custom privileged capabilities rather than treating that as a full staff census.
5. Final authentication gate across core/custom/Woo/theme surfaces; no logged-in reauthentication/local-password loopholes; deliberate machine-policy behavior.
6. Exact callback/flow/browser/session binding, fresh linking auth_time, replay, concurrent account switching, logout/login races and irrelevant sid/device isolation.
7. Server-side admission lifetime and suspended-client/person changes during existing sessions; one-hour maximum is not immediate revocation. Decide/test a continuing check or durable delivery strategy for sensitive deployments.
8. Emergency tickets: actual HTTPS/proxy/IP topology, expiry/replay, nonce/CSRF rationale, existing administrator-only scope, event evidence and rollback.
9. Shortcode/block/editor/AJAX/modal behavior, return destinations, My Account and modern Woo layout compatibility, cart/guest checkout preservation.
10. Data-retention/uninstall semantics and cache exclusions; no raw token/code/cookie/secret/ticket logging at plugin/proxy/APM layers.

Fix through bounded commits/tests. Do not merge merely because the protocol suite is green.

## Finish the required vertical slice

1. ZIP install → activate → settings → deactivate/reactivate → upgrade/idempotent schema → uninstall/reinstall with WP users/orders retained.
2. Hybrid local login, AccessLobby entry and join, verified safe JIT, original destination and negative state/nonce/issuer/audience/signature/token tests.
3. Existing local customer/admin explicit dual proof, no duplicate account, collision fail-closed, unchanged ID/role/profile/commerce/member/B2B data; email/name/phone equality must not grant access.
4. Enforced readiness gate; automatic core/wp-admin/frontend/Woo/theme login entry, return preservation/loop prevention; callbacks/logout not intercepted; outage and emergency/rollback tests; machine auth inventory.
5. Logout choice: local only, quiet re-entry, other site unaffected; all-connected-app browser SSO ends and signed backchannel clears matching sessions; wrong issuer/audience/signature/event/time/replay/unrelated sid cannot delete sessions; unrelated device remains.
6. Two independent WP installations/clients/database roots prove quiet SSO with separate local IDs/roles. Include a subdirectory install and WooCommerce. Where possible also test an existing non-WP peer.
7. Browser/responsive/keyboard checks and real cache/CDN/security-plugin behavior, including account/private no-store and modal/mobile account UX.
8. Expand CI to real WP/PHP/Woo matrix, signed protocol negatives, migrations/races/linking/logout, ZIP install/activation/uninstall and browser E2E. Keep current AccessLobby API/PWA regressions passing for any server changes.

## Controlled estate rollout

Use owner-provided private SSH routes in the private handoff. Cursor already has access per the owner. Begin read-only: site document roots, separate installations/clients, actual WP/PHP/Woo/theme/active plugins, environment type, cache/security/proxy/auth settings, guest checkout and local privileged/custom roles. Never dump wp-config or credentials into output.

Prioritize `staging.cetechbpa.com`, `training.cetechbpa.com` and `training.flairoc.com`. The other FLAIROC host may serve production; verify before touching it. Historical `flairoc.com/gh/` and `/intl/` must be re-established as separate current installations. Do not assume historical CETECH `/gh /ng /en` or POS routes are still WordPress.

Take/rehearse backup and rollback before migration, use hybrid and controlled test users, retain emergency host access, and register distinct exact first-party OIDC clients through AccessLobby's existing reviewed workflow. No production authentication migration without controlled promotion. This handoff does not provide a new production authorization.

## External WordPress remains a separate implementation/security gate

Preserve the existing external decision document. Do not activate arbitrary external sites with universal first-party `/v1/me` or token claims. Finish minimal token-wide pairwise/app-scoped identities and session identifiers, existing internal-person continuity, separate self-scoped audience/API, minimal approved claims/scopes, consent/withdrawal, publisher/site/domain proof, exact callback/logout checks, suspension/revocation, retention and site transfer.

Two unrelated external WordPress clients must not receive a globally correlatable identity while AccessLobby internally resolves both to one existing person. Specifically test that changing Keycloak `sub` does not create duplicate Person rows. Do not expose first-party organization projection or IAM administration. Pilot in an external-like isolated site before claiming universal onboarding. No external server changes were made in this checkpoint.

## Repository boundary and evidence

Use the existing branch/draft PR first. Verify whether a separate canonical connector repository has since been created; do not duplicate it. If a split is appropriate and Cursor can create it, move the self-contained package with deliberate history/version ownership and update monorepo pointers. Do not hide PHP inside the TS service.

Use branch → implementation → tests → PR/CI → qualified merge → immutable package/images → controlled staging → acceptance → promotion. Update CURRENT-WORK, issue #59, compatibility/site records, changelog, evidence and rollback instructions with exact revisions. Keep #59 open while real rollout/external gates remain.

Final report must separate implementation/CI/local runtime/live estate/external/production truth. List main/plugin SHA and ZIP hash, PR/issues, runtime revisions, both modes, all account/logout flows, each site's actual versions/plugins/results, external privacy/onboarding status and only real outstanding blockers. Do not infer success from source presence, a redirect, a Person ID, plugin activation or a green unit suite.
