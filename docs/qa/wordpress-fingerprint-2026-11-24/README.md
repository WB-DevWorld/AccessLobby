# WordPress fingerprint review — 2026-11-24

Relates to #59, #64 and stacked #65. This is fixture/implementation evidence, not estate SSO acceptance.

## Observed estate blocker

Operator record c2fcee8 reports alpha.8 linking the existing CETECH training customer without changing local role, user count or order ownership. A later SSO callback creates a session, then the frontend reconciler ends it because WPML changes only the home URL's trailing slash during login_init.

PR64/7a09d7b normalizes new fingerprints. Its legacy reader still recognizes only the canonical current pair and exact raw current pair. For example, an old (https://example.test/, https://example.test) digest is rejected when the current raw pair is (https://example.test/, https://example.test/), despite no host or path change.

## Native regression

Regression-only commit **0aeee42b3f47f55689b90e52a3158a5824bd9416** adds the missing sixteen old/current slash combinations and real trust-change negatives.

[Run45458219445](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45458219445) fails the new ConfigTest::testEveryLegacySlashCombinationSurvivesARequestPhaseChange assertion on PHP8.3, PHP8.4 and PHP8.5. Each unit job reports 42 tests, 71 assertions and one failure. Job IDs: 138673335727, 138673335942 and 138673335979.

## Bounded correction

Recognize exact current raw URLs and the four conventional legacy spellings derived from the current site/home bases. New fingerprints remain canonical. Issuer, API, client ID, URL host, path, scheme and port remain part of every digest; actual changes must fail closed.

The disposable MU fixture changes the empty-path home URL to unslashed during login_init and slashed on frontend requests. The real browser case verifies those two observed spellings, quiet callback entry, identity on the first and next storefront request, unchanged local user count and the active local mapping. It does not install or certify WPML itself.

Local Node syntax, diff whitespace and all five fixture-safety Python tests pass. PHP, Composer and Docker are unavailable locally. Final native PHP/static/package/browser CI is **PENDING** for the reader fix.

## Estate acceptance still required

Build a new exact ZIP after integration into PR64, record source/run/SHA256, and install first on CETECH training. Preserve the existing dual-proof mapping and customer history. Prove repeat AccessLobby entry survives My Account and another storefront request before expanding to staging/FLAIROC and measuring two-site SSO/logout.

No API/web/IAM/gateway image promotion or identity migration is required by this PHP-only correction. Enforced mode and emergency recovery remain off. External publishers and multisite remain outside this increment.
