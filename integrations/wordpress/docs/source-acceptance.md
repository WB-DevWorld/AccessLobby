# Focused source acceptance — 2026-11-23

28 separate topic searches/reads were performed before implementation. Original supplied text archives were extracted privately; raw conversations, credentials and exports are excluded from Git. Line references below refer to the supplied source pack or current repository at `3d9220a140d61df5effe633bc72cf5142c4a8371`. Indirect historical assistant proposals are not owner decisions.

| Pass | Focus / inspected evidence | Consequential result / classification |
|---|---|---|
| 01 | Live main, open PR/issues, five main Actions; public web/API/discovery | CURRENT-REPO-FACT: main and staging API `3d9220a…`; web/API/discovery 200; ready; no open PR; CI/theme/PWA/publish successful. Private digests uninspected. |
| 02 | Source Pack 12/13/14/15/21 and underlying SRC-0053 | SOURCE-CONFIRMED: WP connector was proposed/unverified; preserve local IDs, roles, commerce and guests. |
| 03 | `evidence/personal-context-leads.txt` lines 41–43; current personal-context original July leads | SOURCE-CONFIRMED historical discussion, proposal status: Keycloak/OIDC WP client; previous Generic Client suggestion is not shipped code. |
| 04 | `docs/integration-contract-v0.1.md` discovery/validation | CURRENT-REPO-FACT: public Code/PKCE, signed ID/access tokens, versioned `/v1/me`; `sub` is not person ID. |
| 05 | `docs/consumer-onboarding.md`, client renderer | CURRENT-REPO-FACT: exact callbacks, existing realm, reviewed registration; no per-app realm. |
| 06 | `apps/api/src/applications.ts` / app provisioner | CURRENT-REPO-FACT: registry first-party status overrides fallback; open/restricted app admission is distinct. |
| 07 | `docs/external-app-contract-decision.md` | CURRENT-REPO-FACT: arbitrary external activation remains closed. |
| 08 | Same decision, `identity.ts`, migration 001, current Keycloak pairwise docs | CURRENT-REPO-FACT: changing token subject alone creates duplicate internal people; pseudonymizing API alone leaks claims. |
| 09 | Contract Join / ADR005 / reference consumer | CURRENT-REPO-FACT: peer starts `prompt=create`; validate/verify/resolve before local creation. |
| 10 | Contract linking / ADR005 / reference link sample | SOURCE-CONFIRMED: bounded dual proof, unique atomic mapping, no email merge. Reference memory is not durable WP implementation. |
| 11 | Pack 12 / ownership | SOURCE-CONFIRMED: `wp_users.ID` and local authorization remain WordPress-owned. |
| 12 | Underlying WP/POS/library material; Woo official customer APIs | SOURCE-CONFIRMED boundary; NEW-RECOMMENDATION: link existing ID and never rewrite commerce data. No live commerce preservation proof yet. |
| 13 | SRC-0053, AccessLobby-1 part5 paragraphs 31506/31511 | Historical staff mandatory SSO/emergency proposals; current owner requirement governs site-level modes. NEW-RECOMMENDATION: host-only one-use emergency ticket. |
| 14 | SRC-0053 and Woo Accounts and Privacy docs | SOURCE-CONFIRMED: guest checkout stays local; installation must not change it. |
| 15 | Consumer contract and MVP steps/history | MVP-PROVISIONAL: explicit safe subscriber/customer JIT, disabled by default. |
| 16 | Ownership/account architecture audit | SOURCE-CONFIRMED: no org-owner → WP admin or uncontrolled claim role mapping. |
| 17 | Web/reference consumer logout routes | CURRENT-REPO-FACT: local logout leaves SSO active. |
| 18 | API/reference signed backchannel validator and ADR005 | SOURCE-CONFIRMED choice; CURRENT-REPO-FACT: signed sid-scoped propagation; unavailable-peer limitation. |
| 19 | Subdirectory historical routing; WP home/site/multisite docs | NEW-RECOMMENDATION: WordPress URL APIs; multisite deferred explicitly because shared users/cookies require separate semantics. |
| 20 | WoodMart official registration/account builder docs; Woo login template hooks | NEW-RECOMMENDATION: Woo hooks plus generic frontend adapter; licensed runtime qualification BLOCKED. No theme modifications. |
| 21 | PWA standard and historical caching/security stack | SOURCE-CONFIRMED: auth/private no-store; NEW-RECOMMENDATION: explicit Cloudflare/Nginx/cache exclusions. Security/cache plugins not presumed qualified. |
| 22 | Personal context FLAIROC routing evidence and current `/gh/`, `/intl/` REST probes | SOURCE-CONFIRMED historical separate installs; current probes 403. Current independence/version/access BLOCKED; no mutation. |
| 23 | Training original delivery history lines 2141–42; current training/staging/POS REST probes | SOURCE-CONFIRMED historical staging training host/MU safety plugin; current probes 403. Runtime versions/access BLOCKED. |
| 24 | Official current WP download, PHP lifecycle, Woo requirements, OIDC standards | CURRENT-REPO-FACT for implementation inputs: WP download 7.1.5; choose PHP 8.3/8.4 CI, 8.5 core-only qualification; verify downloaded fixture versions independently. |
| 25 | Supplied MVP Steps, Development History Main1, Create Retrieval Prompt | SOURCE-CONFIRMED: minimum executable slice and independent peer ownership; older pre-development phase is superseded by this mission. |
| 26 | Supplied Staging Deployment history and current public checks | CURRENT-REPO-FACT: historic onboarding rollout claims are revision-bounded; live API now matches main. Private IAM readback still required. |
| 27 | Supplied UI Chats text, transfer-kit decisions/method | SOURCE-CONFIRMED: concise safe native UX, one identity/multiple local contexts; preserve PWA authentication/cache behavior. |
| 28 | Current Generic Client source `63ccf2c…`, composer/readme/link logic; php-jwt library | NEW-RECOMMENDATION: reuse maintained JWT verification, independently implement connector ownership/link/session policy. Generic Client supports Code/PKCE/JWKS but optional email/username linking and different persistence/logout require replacing core lifecycle; avoid a second plugin dependency. |

## Official implementation references

- https://developer.wordpress.org/reference/functions/wp_set_auth_cookie/
- https://developer.wordpress.org/reference/classes/wp_session_tokens/
- https://developer.wordpress.org/reference/functions/wp_login_form/
- https://developer.wordpress.org/plugins/security/
- https://developer.wordpress.org/plugins/plugin-basics/uninstall-methods/
- https://developer.wordpress.org/reference/functions/site_url/
- https://developer.wordpress.org/reference/functions/home_url/
- https://developer.wordpress.org/advanced-administration/multisite/
- https://developer.wordpress.org/advanced-administration/security/application-passwords/
- https://woocommerce.github.io/code-reference/files/woocommerce-templates-myaccount-form-login.html
- https://woocommerce.com/document/configuring-woocommerce-settings/accounts-and-privacy/
- https://woocommerce.com/document/enhanced-customer-accounts/enabling-modern-login-experience/
- https://woodmarttheme.com/docs/enable-customer-registration/
- https://woodmarttheme.com/docs/my-account-page-builder/
- https://openid.net/specs/openid-connect-core-1_0.html
- https://openid.net/specs/openid-connect-backchannel-1_0.html
- https://openid.net/specs/openid-connect-rpinitiated-1_0.html
- https://www.keycloak.org/docs/latest/server_admin/#pairwise-subject-identifier-mapper
- https://wordpress.org/download/ (7.1.5 observed)
- https://woocommerce.com/document/server-requirements/
- https://www.php.net/supported-versions.php
- https://github.com/oidc-wp/openid-connect-generic
- https://github.com/googleapis/php-jwt

## Repository and scope disposition

WB-DevWorld repository searches for accesslobby/wordpress found AccessLobby and no canonical connector. The GitHub connector has file/branch/PR tools but no repository-creation action. The authorized browser fallback reached a GitHub sign-in wall. NEW-RECOMMENDATION: keep a self-contained independently versioned PHP plugin under `integrations/wordpress`, with its own package/test/release lifecycle, until a separate repository can be created without guessing credentials. No duplicate repository is created. This can be extracted with its history later.

DEFERRED: unrestricted external activation, unreviewed scopes, real WoodMart/B2BKing/membership certification and multisite. OWNER-DECISION-REQUIRED only if a consequential external consent/retention/publisher policy cannot be resolved through a safe reversible pilot. A first-party ZIP is not universal external support.
