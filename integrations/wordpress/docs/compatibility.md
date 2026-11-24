# Consolidated alpha.7 qualification

Alpha.7 adds rollback for blank usernames introduced by late WordPress hooks. The earlier alpha.6 passes do not include this newly discovered case; only the release record's exact new revision and CI qualify the fix. Alpha.8 keeps that behavior and treats Wordfence Login Security's own-account capabilities as non-elevating so a real subscriber or customer role can be saved and used for JIT.

This package is a reviewed first-party pilot candidate. Its exact consolidated source, ZIP and results are recorded in the [consolidation acceptance record](https://github.com/WB-DevWorld/AccessLobby/tree/feat/wordpress-consolidation/docs/qa/wordpress-consolidation-2026-11-24). The earlier alpha.3/alpha.4/alpha.5 records below are historical evidence for the retained connector; they do not substitute for the combined branch's own checks.

The release workflow checks PHP8.3/8.4/8.5 protocol/static/package, native Windows ZIP bytes, five independent two-WordPress behavior matrices (CPT/HPOS, WP6.9/7.1, Woo11.1/11.2/11.3, Kadence), plus the additional distinct-hostname nginx/PHP-FPM HTTPS smoke. The broad behavior matrix and representative hosting smoke are different scopes. New upgrade coverage uses the exact qualified alpha.5 ZIP.

Multisite remains unsupported. Actual WoodMart/B2BKing/membership/cache/security/checkout-Blocks/extension and public-domain estate pilots remain unqualified until tested on their own installed versions. External publisher activation is excluded. A passing fixture does not establish production or actual CETECH/FLAIROC rollout.

## Earlier candidate evidence

This alpha supports reviewed first-party pilots. QUALIFIED below means the listed isolated fixture and revision, never every deployment of that product. Use a maintained security patch release in each WordPress/PHP line.

| Surface/environment | Status | Evidence / remaining gate |
|---|---|---|
| PHP 8.3 / 8.4 / 8.5 protocol, static, coding and packaging | QUALIFIED (bounded) | 39 unit tests / 44 assertions per job, locked dependency audit, PHPStan5 and WordPress coding/security rules in CI |
| WP7.1.5 / PHP8.4 / Woo11.3.1 classic CPT root + independent plain `/gh/` installation | QUALIFIED (fixture) | Actual HTTPS IAM/API/Chromium; 55 browser cases at `dccc000530e03f50103c2ea45d03ef7714d6e27b` (alpha.3) |
| WP6.9.12 / PHP8.3 plain root + independent `/gh/` | QUALIFIED (fixture) | 51 real IAM/API/browser cases at `dccc000530e03f50103c2ea45d03ef7714d6e27b` (alpha.3); includes enforced/Join/link/SSO/logout/recovery/fault/rollback |
| WP7.1.5 / PHP8.3 / Woo11.3.1 HPOS root + independent plain `/gh/` | QUALIFIED (fixture) | 55 browser cases and data preservation at alpha.3 `dccc0005`; current increment needs its own run |
| Current Woo11.3.1 on WP6.9 | UNSUPPORTED | Woo's own package requires WP7.0+; plain WP6.9 is tested separately |
| Hybrid and enforced core/admin/protected/frontend login | QUALIFIED (fixture) | Real local login, fresh linking, automatic SSO, safe original destination and local 403 authorization |
| Existing customer/order/address ownership, safe JIT, explicit linking | QUALIFIED (fixture) | Real WP/Woo APIs; no email merge, unchanged local IDs/roles/metadata and orders |
| Classic My Account / classic guest checkout with block-theme receipt | QUALIFIED (fixture) | Enforced-mode guest order, customer ID0, unchanged user count, expected total; receipt checked with Woo routing/API |
| Modern Woo enhanced login / checkout blocks / extensions | UNTESTED | Do not infer from classic checkout or the block-theme receipt; subscriptions/download entitlements need their installed extension/data |
| Logout / quiet SSO / recovery / outage / rollback | QUALIFIED (fixture) | Actual issuer backchannel, both logout choices, credential challenge after shared logout, one-use HTTPS recovery and reactivation session invalidation |
| Separate-process JIT / link / state races | QUALIFIED (bounded) | One JIT user, one conflicting-link winner, one consumed callback state; no load/performance claim |
| Install/deactivate/reactivate/schema upgrade/uninstall/reinstall | QUALIFIED (fixture) | Normal ZIP/WP-CLI lifecycle; users, mappings, orders retained; denied partial schema upgrade tested |
| Secure/HttpOnly cookies and private dynamic account pages | QUALIFIED (fixture) | HTTPS browser checks; production proxy/CDN exclusions remain a site gate |
| Generic account shortcode / wp_login_form frontend | QUALIFIED (fixture) | Native WordPress form/account actions exercised without theme-source edits |
| Login/Join shortcode, dynamic block/editor Journey/save/reload | QUALIFIED (bounded fixture) | Alpha.3 real editor/component persistence; arbitrary inserter/theme-builder UX remains untested |
| WoodMart + WooCommerce / WoodMart + B2BKing | UNTESTED | Supported hook/conventional-form adapter exists; licensed modal/mobile/account-builder/role/commerce tests outstanding |
| WPML / WP Rocket / Redis / Cloudflare / Wordfence | UNTESTED | Cache/security requirements documented; actual settings/route/topology tests required |
| Custom membership plugins/frontends | UNTESTED | Generic API exists; no individual paid-membership plugin certified |
| PHP8.5 real WP/Woo browser runtime | UNTESTED | Protocol/static/package CI passes; runtime matrix is PHP8.3/8.4 |
| Multisite/network activation | UNSUPPORTED | Explicitly refused; shared-user/network-cookie semantics require a separate contract |
| CETECH/FLAIROC estate | BLOCKED here | Workspace SSH network unreachable; owner reports Cursor has the route; no estate installation/migration performed |
| Arbitrary external WordPress activation | UNSUPPORTED | Token-wide pairwise privacy, internal-person continuity, consent and publisher lifecycle/onboarding remain closed |

Exact current source/package hashes are in each CI runtime artifact's `build.json`; detailed reports are under repository `docs/qa/wordpress-codex-2026-11-23`. Later source changes need their own passing run. The latest green candidate still requires controlled estate adoption, independent security review and promotion approval before production. First-party MVP and universal external support are not declared complete.

The HPOS declaration uses WooCommerce's [official compatibility API](https://developer.woocommerce.com/docs/features/orders/high-performance-order-storage/recipe-book/). Fixture order creation, guest checkout and uninstall retention use WooCommerce CRUD in both storage modes; no order-table SQL is part of the connector.

Alpha.4 adds WordPress registry onboarding, optional receipt reconciliation and a closed external identity preview. Its qualification is established only by the exact release acceptance and retained CI/native reports; the preceding alpha.3 proof does not automatically qualify changed source. External native pairwise probes are negative gate tests, never external activation.

Additional estate-version fixtures (qualified only by their own exact release CI reports): WP7.1.4/PHP8.4/Woo11.2.1/default theme, and WP7.1.1/PHP8.4/Woo11.1.1/Kadence1.5.2. Reported inventory source and local guest policies are in site-qualification.md. These do not certify WoodMart, its inactive/active Core combinations, B2BKing, caches or actual estate deployment. The official [Woo releases](https://developer.woocommerce.com/releases/) and [Kadence directory](https://wordpress.org/themes/kadence/) distinguish historical reproduction from current maintained versions.
