# Codex comparison: WordPress runtime evidence — 2026-11-23

Common starting head: `92afbb261672401426aa4d8d3ad36f2e81ac13fd`; independent branch `feat/wordpress-codex-comparison`, draft PR61. The owner explicitly authorized continued work alongside Cursor. PR60/handoff remains preserved; neither candidate is selected, merged or deployed by these results.

## Proven runtime

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
