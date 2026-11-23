# Codex comparison: WordPress runtime evidence — 2026-11-23

Common starting head: `92afbb261672401426aa4d8d3ad36f2e81ac13fd`; independent branch `feat/wordpress-codex-comparison`. The owner's renewed instruction explicitly authorizes continued work alongside Cursor. Neither candidate is selected or merged by these results.

A local isolated fixture used actual Keycloak 26.7.0 over HTTPS, unchanged AccessLobby API source plus PostgreSQL 17.12, MariaDB 11.8.6, PHP 8.4.27, WordPress 7.1.5 and WooCommerce 11.3.1. Site A is a root installation with WooCommerce; Site B is a separate database/client under `/gh/`. Loopback certificates are trusted explicitly by server transports; no production TLS check is disabled. Registry review/DNS rows and people are disposable fixtures, not live onboarding evidence.

- WordPress/Woo database suite: 36 assertions PASS.
- Independent subdirectory WordPress database suite: 34 assertions PASS.
- Adversarial hook/audit/recovery/schema tests: 16 per site PASS.
- Actual HTTP Code/PKCE/JWKS/identity/admission/link/SSO/logout flow: eight cases PASS. Existing Woo customer history/roles remain; quiet second-site SSO creates a different local user/role; local-only logout leaves B active; real issuer backchannel ends matching sessions on A and B; issuer re-entry subsequently requires authentication.
- Protocol unit baseline remains 39 tests/44 assertions PASS; PHPStan level5 and configured WordPress coding/security checks pass locally.

The local Chromium launch was blocked by the workspace's prohibited Unix socket. HTTP protocol results are deliberately not called browser UI results. A separate real browser CI matrix is added for WordPress 7.1.5/PHP8.4 and patched minimum-line WordPress 6.9.12/PHP8.3. It must pass before claiming that qualification.

Enforced-mode full UI, guest purchase, real emergency HTTPS redemption, actual licensed WoodMart/B2BKing and controlled estate rollout remain distinct acceptance work. External privacy/onboarding remains closed, and multisite is explicitly unsupported. No live server/client/production state was modified.

Runtime package tested: alpha.2, SHA-256 `0b9fe5a24afcdf0de5d9141584dc38f161cba00c26c11c958136d9f74e064aa7`. This identifies the runtime bytes in this run; later runtime source edits require a new hash/result. Tests/harness can evolve separately and are tracked in Git.
