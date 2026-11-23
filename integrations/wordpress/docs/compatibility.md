# Compatibility and qualification

This alpha supports reviewed first-party pilots. QUALIFIED below means the listed isolated fixture and revision, never every deployment of that product. Use a maintained security patch release in each WordPress/PHP line.

| Surface/environment | Status | Evidence / remaining gate |
|---|---|---|
| PHP 8.3 / 8.4 / 8.5 protocol, static, coding and packaging | QUALIFIED (bounded) | 39 unit tests / 44 assertions per job, locked dependency audit, PHPStan5 and WordPress coding/security rules in CI |
| WP7.1.5 / PHP8.4 / Woo11.3.1 root + independent plain `/gh/` installation | QUALIFIED (fixture) | Actual HTTPS IAM/API/Chromium; 27 browser cases at `1802e18bb1f86992428b61c8db6ba44412944a76` |
| WP6.9.12 / PHP8.3 plain root + independent `/gh/` | QUALIFIED (fixture) | Real IAM/API/browser matrix; enforced/Join/link/SSO/logout/recovery/fault checks pass at `93eae64e0e73c895058e832b4de74420ba4cd175`; latest job includes rollback |
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
| Login/Join shortcode, block/editor, template/API helpers | PARTIALLY QUALIFIED | Runtime source exists and common underlying flow is tested; editor insertion/theme-builder UX needs its own qualification |
| WoodMart + WooCommerce / WoodMart + B2BKing | UNTESTED | Supported hook/conventional-form adapter exists; licensed modal/mobile/account-builder/role/commerce tests outstanding |
| WPML / WP Rocket / Redis / Cloudflare / Wordfence | UNTESTED | Cache/security requirements documented; actual settings/route/topology tests required |
| Custom membership plugins/frontends | UNTESTED | Generic API exists; no individual paid-membership plugin certified |
| PHP8.5 real WP/Woo browser runtime | UNTESTED | Protocol/static/package CI passes; runtime matrix is PHP8.3/8.4 |
| Multisite/network activation | UNSUPPORTED | Explicitly refused; shared-user/network-cookie semantics require a separate contract |
| CETECH/FLAIROC estate | BLOCKED here | Workspace SSH network unreachable; owner reports Cursor has the route; no estate installation/migration performed |
| Arbitrary external WordPress activation | UNSUPPORTED | Token-wide pairwise privacy, internal-person continuity, consent and publisher lifecycle/onboarding remain closed |

Exact current source/package hashes are in each CI runtime artifact's `build.json`; detailed reports are under repository `docs/qa/wordpress-codex-2026-11-23`. Later source changes need their own passing run. The latest green candidate still requires controlled estate adoption, independent security review and promotion approval before production. First-party MVP and universal external support are not declared complete.
