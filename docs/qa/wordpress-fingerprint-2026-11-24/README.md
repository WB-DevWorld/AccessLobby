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

## Qualified fixed source

Fixed source **2b763858bbe5e091fd6500df3130778f62eef222** passes [WordPress45458761687](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45458761687), [general CI45458761635](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45458761635), and [IAM theme45458761562](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45458761562). All 13 jobs pass. Native PHP8.3/8.4/8.5 runs report 42 tests / 82 assertions and pass syntax, static analysis, coding/security rules and package checks.

| Native two-site fixture | Browser cases | Phase regression | alpha.6 to alpha.9 upgrade |
|---|---:|---|---|
| WP6.9.12 / PHP8.3 / plain WordPress | 70 | PASS | PASS |
| WP7.1.1 / PHP8.4 / Woo11.1.1 / Kadence | 74 | PASS | PASS |
| WP7.1.4 / PHP8.4 / Woo11.2.1 | 74 | PASS | PASS |
| WP7.1.5 / PHP8.3 / Woo11.3.1 | 74 | PASS | PASS |
| WP7.1.5 / PHP8.4 / Woo11.3.1 | 74 | PASS | PASS |

Total: **366 real browser cases**. These disposable stacks do not certify licensed WPML, WoodMart or B2BKing on an estate site. The representative trusted-hostname nginx/PHP-FPM HTTPS smoke also passes.

The browser build reports record candidate2b763858 and synthetic merge checkout b2934d47252e57d8bd9d062141756b341c278fa4, with sourceDirty=false. PR65 merged into PR64 at **743afe9e0dd429fff471491c26ac76fb61e0a7c2**, whose Git tree equals the qualified source. Retained [62 categorical reports](reports/) include all five lanes, lifecycle/security/concurrency checks, HTTPS and package comparison.

Canonical installable ZIP: **0.1.0-alpha.9**, 50 files, **92,760 bytes**, SHA256 **6521df67c33a34d8ccdebd8832d26f13355ea5ea66d67397cc645f4254df7d42**. Native Windows and Linux inner ZIPs are byte-identical. Every packaged entry matches Git source2b763858; the outer GitHub artifact ZIP has a different digest and is not the installable plugin.

Local Node syntax, diff whitespace and all five fixture-safety Python tests pass. PHP, Composer and Docker are unavailable locally; native runtime evidence comes from CI.

## Protected-main integration

PR64's integrated head743afe9 also passes all13 jobs: [WordPress45460141296](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45460141296), [general45460140673](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45460140673), and [theme45460140815](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45460140815).

PR64 merged as **99f4a45138be0ced62488f851cdd63d59d81aae8**. Its Git tree d257d908c43ac9593039e7ede6b5ce734413a4cf equals the qualified fixed source and PR65 integration. Post-merge main checks are separate from those completed pre-merge checks; consult the exact run when selecting an artifact.

The [release-time estate snapshot](https://github.com/WB-DevWorld/AccessLobby/blob/c2fcee80509be04ff2f273d8c33988097e0817e6/docs/qa/wordpress-estate-2026-11-24/README.md) recorded alpha.8 before rollout. The [living estate ledger](../wordpress-estate-2026-11-24/README.md) advances with later operator observations; this fixture report does not establish those estate results.

## Estate acceptance still required

Build a new exact ZIP after integration into PR64, record source/run/SHA256, and install first on CETECH training. Preserve the existing dual-proof mapping and customer history. Prove repeat AccessLobby entry survives My Account and another storefront request before expanding to staging/FLAIROC and measuring two-site SSO/logout.

The separate external-privacy probes still report passed=false, including cross-client sid and undeclared-claim findings. Pairwise subjects alone do not satisfy that gate; external API entry is rejected and externalApplicationsActivated=0. External publisher activation remains blocked.

No API/web/IAM/gateway image promotion or identity migration is required by this PHP-only correction. Enforced mode and emergency recovery remain off. External publishers and multisite remain outside this increment.
