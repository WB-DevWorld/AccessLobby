# WordPress alpha.3 qualification and remaining mission

2026-11-23 UTC. This increment fixes unrelated-form interception and qualifies account disconnect/reconnect, frontend/editor integration and real ZIP upgrade continuity in the independent PR61 candidate. The first-party estate MVP and universal external support are still incomplete. Cursor's PR60 remains a separate candidate; no winner is selected.

## Current AccessLobby and source

- Canonical repository: WB-DevWorld/AccessLobby; branch `feat/wordpress-codex-comparison`, draft [PR61](https://github.com/WB-DevWorld/AccessLobby/pull/61). Common handoff: `92afbb261672401426aa4d8d3ad36f2e81ac13fd`.
- Tested implementation: `dccc000530e03f50103c2ea45d03ef7714d6e27b`. A later evidence-only commit retains the same 48 packaged files. Inspect the final review manifest/PR for that evidence head.
- Main and public staging API were `3d9220a140d61df5effe633bc72cf5142c4a8371` at the 2026-11-23T22:13:25Z read-only checkpoint. Public web/readiness/discovery passed; private deployed image digests/full IAM inventory are not read back. This candidate has deployed no estate/staging/production changes.
- Cursor independently advanced PR60 to `4ccfb8991f6ee0521ec1b4fa3da44806829aab52` at readback; its source has not been reviewed or changed by this candidate.
- Issue59 remains open for real estate adoption, security/availability and external privacy/onboarding gates. The existing 28 source passes and original contracts remain the baseline.

## Connector and exact package

Version **0.1.0-alpha.3**, package `accesslobby-sso-0.1.0-alpha.3.zip`, SHA256 `695ea54b7cca6857b96c5e8bc3a8740d470a718a4bfe4ca22f520a7f5971e17e`. The independently versioned PHP connector remains under `integrations/wordpress`, with a thin bootstrap and separated protocol/mapping/session/admin/UI components. It uses a locked isolated maintained JWT verifier, not custom signature mathematics or private IAM/database access.

The alpha.2 source/qualification and its immutable ZIP remain historical evidence. Alpha.3 fixes one actual frontend defect: an unrelated search/newsletter form with class `login` could be intercepted on submit in enforced mode. Both insertion and submit interception now require a supported form selector and real username/password controls. The passing browser regression preserves the unrelated form while a mounted credential modal starts SSO automatically.

The new inventory script is a repository-side operator tool, not a dependency installed into the public WordPress plugin. Its [runbook](https://github.com/WB-DevWorld/AccessLobby/blob/dccc000530e03f50103c2ea45d03ef7714d6e27b/docs/runbooks/wordpress-estate-inventory.md) explains the correct Unix owner, private output, skip-plugins/themes bootstrap caveat, and exact limitations. It issues no explicit writes/network requests and exports no account/customer content or credentials. Both fixtures verify preserved user/order/configuration state; its output deliberately says authentication qualification NOT_RUN.

## Authentication and account flows

Both primary modes are implemented and exercised: WordPress + AccessLobby preserves local login; AccessLobby only automatically starts IAM from supported core/admin/frontend/Woo login surfaces. Safe original destinations survive, callback/logout exclusions avoid loops, and unknown/local-resource authorization stays with WordPress.

| Flow | Proven result and limit |
|---|---|
| New user / peer Join | Real IAM registration and captured synthetic email verification precede exactly one safe local account; repeat SSO reuses it |
| JIT | Explicit opt-in; verified identity/email and API admission, safe subscriber/customer only; role/capability/audit failures close creation |
| Existing link | Current local session plus fresh IAM proof, state/nonce/PKCE and atomic unique mapping; session rotates and binds to sid |
| Existing unlinked user | Email equality never merges; inactive links deny quiet reactivation or duplicate JIT |
| Disconnect | Real fresh dual proof; missing nonce, wrong person, lost local session and denied OIDC response preserve the link; successful disconnect invalidates only that site's linked sessions |
| Reconnect | Fresh local plus IAM proof reactivates the original mapping/user without duplicate creation; roles/address/business metadata and orders remain |
| Enforced unlink | Public action hidden; a valid authenticated local nonce still receives host_recovery_required; no public escape from enforcement |
| Staff/admin | Explicit privileged linking preserves local administrator capabilities; no organization-owner/claim-to-admin mapping |
| Customer / guest | Existing order customer ID/total/address preserved in CPT and HPOS; real guest order retains customer 0 and creates no WordPress account |
| Recovery / rollback | Exact-IP one-use short HTTPS host ticket, replay denial, local rollback login, enforced reactivation session revocation |
| Identity reassignment | Changing to a different human/issuer is not automatic reconnect; controlled recovery/migration is required |

The new editor test opens real Gutenberg as the linked local administrator, selects the registered block through the [documented WordPress data API](https://developer.wordpress.org/block-editor/reference-guides/data/data-core-editor/), changes its actual Journey control, saves through the editor, reloads it, and follows its saved Join link to IAM. Shortcode and dynamic-block login/Join links and no-store headers pass on root and `/gh/` sites. Generic mobile mounted forms pass both modes without theme-source changes. This does not certify every inserter, theme builder, WoodMart modal or accessibility interaction.

## Installation and upgrade

The actual WordPress ZIP updater installs the previously qualified alpha.2 package from frozen source `8ede31e7218178d81192a8f4b72156bb64cb6875`; its expected SHA256 is `3fd9652455522eb23d50f04b161f529b0a656805bebddf5b0c69a3f489fba81c`. The browser must observe that old runtime before establishing SSO. Replacing it with alpha.3 preserves that session and original mapping/user/role/commerce, and the browser must observe the new runtime. Version readback includes a bounded propagation wait rather than trusting a ZIP header alone. This root-site update is tested in all three runtime lanes.

Normal install/activation, deactivation/reactivation, schema migration/partial-failure checks and uninstall/reinstall retention pass on both installations. Uninstall never removes WordPress users or Woo orders. Actual host backup/restore and PHP-FPM/cache rollout remain real-estate gates.

## Logout and availability

Site-only ends the current local WP session, leaves IAM/peer apps active and allows quiet re-entry. All-connected-apps ends the shared browser IAM session and triggers signed sid-scoped backchannel invalidation on both participating WP peers. A different actual IAM browser device remains signed in. This is not all devices.

Signature/issuer/audience/event/age/sid/replay controls are tested across unit/database/browser layers. An unavailable peer notification is not a durable logout queue: the explicit outage case proves its session may remain until bounded expiry while shared IAM ends. Durable delivery/reconciliation and production availability remain open gates. OAuth tokens/codes/cookies/secrets and raw verification links are excluded from retained logs/reports.

## Qualification matrix

These are disposable real IAM/API/WordPress installations with separate databases/clients and HTTPS origin ports. They are not public estate or external-publisher pilots. Actual IAM is Keycloak26.7.0; CI uses PostgreSQL17.11 and MariaDB11.8.9. Production patch/support review is separate.

| Fixture | Path | WP | PHP | Woo | Order storage | Theme | Result |
|---|---|---|---|---|---|---|---|
| wp71-classic a | root | 7.1.5 | 8.4.28 | 11.3.1 | CPT | Twenty Twenty-Five 1.5 | 43 DB + 19 security; PASS |
| wp71-classic b | /gh/ | 7.1.5 | 8.4.28 | none | n/a | Twenty Twenty-Five 1.5 | 41 DB + 19 security; PASS |
| wp71-hpos a | root | 7.1.5 | 8.3.37 | 11.3.1 | HPOS | Twenty Twenty-Five 1.5 | 43 DB + 19 security; PASS |
| wp71-hpos b | /gh/ | 7.1.5 | 8.3.37 | none | n/a | Twenty Twenty-Five 1.5 | 41 DB + 19 security; PASS |
| wp69 a | root | 6.9.12 | 8.3.37 | none | n/a | Twenty Twenty-Five 1.4 | 41 DB + 19 security; PASS |
| wp69 b | /gh/ | 6.9.12 | 8.3.37 | none | n/a | Twenty Twenty-Five 1.4 | 41 DB + 19 security; PASS |

Each runtime proves quiet second-site SSO, independent local IDs/roles, both modes and signed shared logout. The two sites are same-host distinct origins; public cross-domain estate SSO remains unqualified. PHP8.3/8.4/8.5 protocol/static/coding/dependency/package checks pass; PHP8.5 real WordPress browser runtime is not tested. Multisite is explicitly unsupported.

| Owner site/stack | Result |
|---|---|
| staging.cetechbpa.com | BLOCKED here: SSH network unreachable before authentication; no inventory/install/flow qualification |
| training.cetechbpa.com | BLOCKED here; owner reports Cursor has host access |
| training.flairoc.com | BLOCKED here; owner reports Cursor has host access |
| flairoc.com/gh/ and /intl/ | Historical separate-install leads; current topology/version not verified; no production mutation |
| CETECH /gh /ng /en, pos.cetechbpa.com | Locate current physical installs and inventory before onboarding |
| WoodMart/B2BKing/WPML/Wordfence/WP Rocket/Redis/Cloudflare | UNTESTED in their actual licensed/topology configurations |
| Modern Woo enhanced account/Checkout Blocks/subscriptions/downloads | UNTESTED; classic checkout, a block-theme receipt and metadata preservation do not certify these extensions |
| Arbitrary membership plugins | UNTESTED; generic WP session/integration hooks retain local entitlement ownership |

## External support

Reviewed first-party client support is implemented. Arbitrary external activation remains CLOSED. Token-wide pairwise/app-scoped identifiers and session privacy, continuity of the same internal person, minimal claims/audience, consent/withdrawal, publisher/domain/route proof, safe client lifecycle/suspension/transfer/retention and an isolated external-like pilot are not implemented. Changing only an ID-token subject or API response would not establish that contract. No universal WordPress/self-registration claim is made.

## Exact evidence

[WordPress CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45276576922), [general API/UI/PWA/IAM/container/proxy regression](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45276576810) and [IAM theme](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45276577060) pass at the tested source. Each build.json records candidate, actual merge checkout, source-clean flag, package and previous-upgrade ZIP hashes. Each runtime also passes database/security suites, three independent-process races and both-site lifecycle checks.

- wp71-classic: **55 browser cases PASS**, actual merge checkout `da7b3d76adaa26db159ebe0b93bf0820a1b68315`; source clean and exact candidate/package recorded.
- wp71-hpos: **55 browser cases PASS**, actual merge checkout `da7b3d76adaa26db159ebe0b93bf0820a1b68315`; source clean and exact candidate/package recorded.
- wp69: **51 browser cases PASS**, actual merge checkout `da7b3d76adaa26db159ebe0b93bf0820a1b68315`; source clean and exact candidate/package recorded.

The categorical CI JSON is retained in Git under `alpha3-ci-dccc0005`, including pre-install inventory outputs. Raw realm/runtime logs, verification mail links, private credentials and historical source exports are excluded. Local native HTTP17/database/security/inventory checks passed separately at clean source `8fa0d8492cba9c2e4bcbfee134b82dcd0d0244df`, retained under `alpha3-native-8fa0d849`, using the same immutable plugin bytes; actual browser proof is CI, not the socket-restricted local Chromium environment.

## Remaining mission

1. Compare exact Cursor/Codex candidates against the same behavior and access conditions; no speed or quality winner is invented from test counts.
2. Inventory reachable backed-up training/staging estates; register actual distinct reviewed clients, install the selected immutable candidate, prove preserved real customer commerce, both modes, public cross-domain SSO/logout and emergency/rollback/restore.
3. Qualify the licensed theme/business/membership/cache/security/CDN/machine-auth variants and production availability/security/load. Complete unavailable-peer logout delivery/reconciliation.
4. Implement the separate external privacy/consent/onboarding contract and isolated independent pilot before enabling external operators; multisite requires its own shared-user/session contract.

The original mission is not complete. This increment closes specific account/frontend/upgrade evidence gaps and prepares controlled estate inventory without rewriting WordPress ownership or destabilizing the AccessLobby identity spine.
