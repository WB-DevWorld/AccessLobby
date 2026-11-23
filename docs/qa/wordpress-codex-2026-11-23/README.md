# Latest WordPress qualification

[Alpha.4 acceptance and remaining delivery](alpha4-acceptance.md) is current: tested implementation 7c9ec8c, package 906f9044, all 11 CI jobs, five two-WordPress/reference-app matrices and supplementary native HTTP 24 cases. Exact clean source/package evidence is in alpha4-ci-7c9ec8c8. Historical alpha.2/alpha.3 records below remain their own snapshots; they do not describe current receipt/onboarding/external-preview behavior.

# Codex comparison: WordPress runtime evidence — 2026-11-23

Common starting head: `92afbb261672401426aa4d8d3ad36f2e81ac13fd`; independent branch `feat/wordpress-codex-comparison`, draft PR61. The owner explicitly authorized continued work alongside Cursor. PR60/handoff remains preserved; neither candidate is selected, merged or deployed by these results.

## Latest alpha.3 acceptance

[Alpha.3 acceptance and remaining mission](alpha3-acceptance.md) records tested source `dccc000530e03f50103c2ea45d03ef7714d6e27b`, package SHA256 `695ea54b7cca6857b96c5e8bc3a8740d470a718a4bfe4ca22f520a7f5971e17e`, **55 browser cases per Woo classic/HPOS lane and 51 on plain WP**, all nine CI jobs, actual editor/mobile/disconnect/reconnect and previous-to-current ZIP upgrade continuity. Exact categorical reports are in `alpha3-ci-dccc0005`; separate native HTTP/inventory proof in `alpha3-native-8fa0d849`. Root and subdirectory installations retain local identity/authorization/commerce. Real estate, licensed plugins, unavailable-peer durable logout, multisite and arbitrary external onboarding are not declared complete.

## Previous alpha.2 retained acceptance

The final comparison qualification is in [ACCEPTANCE.md](ACCEPTANCE.md). Candidate `a04f35944b9c3af304d9cdfda89650cbb6770c21` passes all six WordPress workflow jobs: PHP8.3/8.4/8.5 protocol/static/coding/package; real WP7.1.5/Woo11.3.1 classic CPT on PHP8.4; real WP7.1.5/Woo11.3.1 HPOS on PHP8.3; and plain WP6.9.12 on PHP8.3. Each lane uses two independently registered installations and an independent `/gh/` site. The Woo lanes each pass 39 browser cases; plain WP passes 35. General API/UI/PWA/IAM/container/proxy regression and branded-IAM CI pass at the same candidate.

Exact immutable ZIP SHA256: `3fd9652455522eb23d50f04b161f529b0a656805bebddf5b0c69a3f489fba81c`. All 48 files match the tested source. Sanitized, revision-bound reports under `ci-a04f3594` survive artifact expiry. Public read-only health and package-byte proofs are separate JSON records. Older counts below are historical increments; no old result is used to infer a later-head pass.

The installed compatibility guide conservatively records the HPOS lane as pending at package freeze. The later passing CI reports above establish its bounded fixture qualification without changing those tested package bytes. They do not certify Checkout Blocks, proprietary themes/extensions, real estate deployment or arbitrary external publishers.

## Historical incremental runtime

The isolated fixtures use actual HTTPS Keycloak26.7.0, unchanged AccessLobby API source plus PostgreSQL, real WordPress/MariaDB and independently registered root and `/gh/` installations. Site A has WooCommerce on the current WP7.1.5 matrix; the patched WP6.9.12 matrix is plain WordPress because current Woo11.3.1 requires WP7.0+. Loopback certificates are explicitly trusted; production TLS checking is never disabled. Synthetic registry/DNS-review records are test prerequisites, not domain/publisher onboarding evidence. The two installs have separate databases/clients/user IDs and origin ports; public cross-domain estate adoption remains a separate gate.

At `1802e18bb1f86992428b61c8db6ba44412944a76`, the WP7.1.5/PHP8.4/Woo11.3.1 Chromium job passes **27 cases**: hybrid local login, fresh customer/admin dual proof, session rotation, quiet second-site SSO, local/shared signed backchannel logout, verified peer Join, migration/readiness, HTTPS recovery/replay, enforced core/admin/My Account/frontend entry, original destination, local authorization denial, a real guest order without an account, outage/prerequisite faults, and rollback/reactivation. [WordPress workflow](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45254815855). The general API/UI/PWA/offline/update/container/proxy workflow also passes at this head: [CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45254815967). PHP8.3/8.4/8.5 protocol/package jobs pass. Exact later-head results and package hashes are retained by CI; `build.json` records revision and archive hashes.

The WP6.9.12/PHP8.3 real browser suite passes at `93eae64e0e73c895058e832b4de74420ba4cd175`: [workflow](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45253869624). Current-head runs also cover rollback and source/package metadata/HTTPS-home validation. Consult their exact job result rather than inferring a new-head pass from an earlier one.

## Committed local categorical reports

Native PHP8.4.27 / WP7.1.5 / Woo11.3.1 / MariaDB11.8.6 / PostgreSQL17.12 evidence in this directory:

- Database suite: 37 root/Woo + 35 subdirectory assertions PASS.
- Adversarial hooks/audit/revocation/recovery/schema checks: 19 per site PASS.
- Three independent-process JIT/link/state races PASS.
- Seventeen real HTTP authentication/identity/admission/link/verified-Join/SSO/logout/enforced/recovery/outage/fault cases PASS.
- Normal ZIP lifecycle/uninstall/reinstall preserves users, mappings and orders on both sites.
- Unit baseline: 39 tests / 44 assertions PASS; PHPStan5 and configured WordPress coding/security checks pass.

These native reports test package SHA256 `2d0fcea9cba31a02782327b63896291863bb53ae4f3b203940fd377ecba83cf9`. All 48 packaged files were compared byte-for-byte against runtime/docs files at `93eae64e0e73c895058e832b4de74420ba4cd175`, with zero mismatches. The final HTTPS-home guard adds one assertion per database suite; its subsequent CI result is separate.

Local Chromium cannot launch under this workspace's Unix-socket restriction. Native HTTP results are explicitly labeled `HTTP_PROTOCOL_NOT_BROWSER_UI`; browser evidence comes from actual remote Chromium CI. Only categorical JSON is retained/uploaded. Private credentials, realm imports, mail verification links and raw runtime logs are excluded.

The current browser harness also checks four enforced `/gh/` entry/return cases. The root site exercises the actual readiness UI; the second site uses an explicit host-only fixture setting to isolate path-prefix behavior. These results must be read from the exact run, separately from the earlier counts above.

## Limits

No live CETECH/FLAIROC host, client/IAM configuration, production storefront or main branch was changed. Licensed WoodMart/B2BKing/mobile/cache/security-plugin qualification and controlled real-host backup/recovery remain outstanding. Arbitrary external publisher activation remains closed; token-wide pairwise identity/consent/onboarding and independent external pilot are not implemented. Multisite is unsupported. This is a reviewable first-party candidate, not a completed estate rollout or universal WordPress release. [Fair comparison criteria](../../wordpress-candidate-comparison.md).
