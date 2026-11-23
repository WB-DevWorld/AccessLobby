# AccessLobby SSO for WordPress

Version **0.1.0-alpha.3** — controlled first-party pilot. Standalone installable PHP plugin, independently versioned inside this repository. It does not import the TypeScript service or access another application's database.

WordPress + AccessLobby keeps local login and adds SSO. AccessLobby only redirects supported interactive login through AccessLobby after a migration readiness gate. WordPress users/roles, WooCommerce orders/customers, membership/B2B rules and guest checkout remain local. Email never links accounts. See the [versioned contract](docs/contract-v0.1.md).

Requires PHP 8.3+, OpenSSL/Sodium, WordPress 6.9+, InnoDB users/usermeta and plugin tables, HTTPS and a reviewed first-party AccessLobby client. Multisite is rejected explicitly. Version floors describe intended support; the [compatibility matrix](docs/compatibility.md) records tested versions independently.

1. Follow [setup](docs/setup.md) in a backed-up training/staging site, initially in hybrid mode.
2. Register exact callback/signed-out/backchannel URLs in AccessLobby; activate reviewed app admission.
3. Link existing users explicitly or enable safe JIT for new identities. Follow [migration](docs/migration.md) before enforced mode.
4. Qualify [logout](docs/logout.md), [recovery/rollback](docs/recovery.md) and local authorization on each site.

Administrator: [settings and operations](docs/administrator.md), [troubleshooting](docs/troubleshooting.md). Developer: [public hooks, tests and release](docs/developer.md). Security: [security/retention](docs/security.md). Estate: [qualification record](docs/site-qualification.md). External publishers: [separate gate](docs/external.md).

Build: `composer install --no-interaction`, `python3 scripts/prefix-jwt.py`, `composer test`, `composer analyze`, `python3 scripts/package.py --output dist/accesslobby-sso-0.1.0-alpha.3.zip`. Locked JWT code is namespace-isolated; no runtime dependency downloads. CI covers PHP8.3/8.4/8.5 protocol/static/package checks and actual HTTPS IAM/API/two-WordPress Chromium fixtures. The [compatibility matrix](docs/compatibility.md) distinguishes exact passing fixture revisions from real-estate and external-publisher gates.

Relates to AccessLobby #59. Package/CI evidence does not mean CETECH/FLAIROC deployment or universal external support.
