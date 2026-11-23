# Compatibility and qualification

All rows below describe this checkpoint, not a promise inferred from code presence.

| Surface/environment | Status | Evidence / remaining gate |
|---|---|---|
| PHP 8.4.27 protocol unit suite | QUALIFIED (bounded) | 39 tests / 44 assertions locally; not WordPress runtime evidence |
| PHP syntax / WordPress coding checks / PHPStan level 5 | QUALIFIED (bounded local checks) | All passed locally on PHP 8.4.27; remote CI and runtime remain separate |
| PHP 8.3 / 8.5 | UNTESTED locally | CI matrix prepared; version floors are not test results |
| WordPress 7.1.5 root installation | UNTESTED | Official ZIP downloaded; real fixture not yet qualified |
| WordPress 6.9 compatibility | UNTESTED | Intended minimum; needs actual runtime matrix |
| Independent `/gh/` installation | UNTESTED | URL validation unit cases pass; full callback/session/browser flow remains |
| WooCommerce customer/order preservation | UNTESTED | Real API fixture assertions written, not yet executed |
| WoodMart + WooCommerce | UNTESTED | Hook/adapter implementation, licensed runtime/modal/mobile qualification outstanding |
| WoodMart + B2BKing / WPML | UNTESTED | Local roles/data boundary preserved by design; no actual runtime proof |
| WP Rocket / Redis / Cloudflare / Wordfence | UNTESTED | Cache/security requirements documented; actual settings/route tests outstanding |
| Generic shortcode/block/helpers | PARTIALLY QUALIFIED | Source exists; runtime/editor/theme evidence outstanding |
| Custom membership frontends | UNTESTED | Generic API exists; no specific membership plugin certified |
| Multisite/network activation | UNSUPPORTED | Activation explicitly refused; shared users/cookies need a separate contract |
| First-party CETECH/FLAIROC sites | BLOCKED | Workspace SSH network unreachable; use Cursor's existing access |
| Arbitrary external WordPress activation | UNSUPPORTED | Token-wide privacy/internal-person/consent/onboarding gates remain closed |

SUPPORTED/QUALIFIED claims must be revision-specific and backed by actual evidence. This alpha is not production-approved.
