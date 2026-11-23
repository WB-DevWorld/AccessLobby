# Estate qualification checkpoint — 2026-11-23

Owner supplied the SSH routes below and states Cursor can access them. These are access leads, not observed software inventories. This workspace's SSH attempts returned `Network is unreachable` before authentication; no remote host was changed. The default local SSH configuration also initially failed an ownership check; an isolated default-free read-only attempt established the network blocker. No credentials were requested in chat.

| Site | Environment | Owner-supplied SSH route | WP/Woo/theme/plugins | Mode/login/link/JIT/logout/SSO | Result |
|---|---|---|---|---|---|
| staging.cetechbpa.com | Owner-designated staging | Private SSH route in owner handoff | Unverified | NOT RUN | BLOCKED here; Cursor route available per owner |
| training.cetechbpa.com | Training; historical staging/MU safety evidence | Private SSH route in owner handoff | Unverified now | NOT RUN | BLOCKED here; public REST probe 403 |
| training.flairoc.com | Owner-designated training | Private SSH route in owner handoff | Unverified | NOT RUN | BLOCKED here; Cursor route available per owner |
| flairoc.com/gh/ | Historical independent install; verify current topology | Private SSH route in owner handoff (other FLAIROC estate) | Unverified now | NOT RUN | Public REST probe 403; production SSH/migration not attempted |
| flairoc.com/intl/ | Historical independent install; verify current topology | Private SSH route in owner handoff | Unverified now | NOT RUN | Public REST probe 403; production migration not attempted |
| pos.cetechbpa.com | Historical lead only | Not established for this site | Unverified | NOT RUN | Public REST probe 403; do not assume WordPress |
| CETECH /gh /ng /en | Historical routing leads | Verify host/site paths through read-only inventory | Unverified | NOT RUN | No topology/version inference |

Cursor should first read-only inventory hostname, site document root, WordPress/PHP/Woo versions, theme/child-theme, active plugins, HPOS, environment type, existing auth hooks, caches/proxy trust, roles/users and guest-checkout policy. Avoid dumping wp-config, salts, passwords, tokens or customer data. Use existing SSH configuration and keep each site/client separate.

Before any pilot: backup/restore and rollback reference, hybrid mode, exact issuer/client/registered routes, controlled local administrator/customer dual-proof link, observed Woo history preservation, negative authorization, then a second independent site with quiet SSO and both logout scopes. No production enforcement without controlled promotion. Record exact plugin SHA/ZIP hash and actual site versions for every pass.

## Shared estate inventory reported by the independent lane

**CURRENT-REPO-FACT (reported inventory, not re-executed here):** PR60's committed `CURRENT-WORK.md` at `948018e9a77e0e4bb3fb4b75350092867f08473d` records a read-only SSH inventory. It reports no site changes, backup or pilot installation. Source: [exact ledger](https://github.com/WB-DevWorld/AccessLobby/blob/948018e9a77e0e4bb3fb4b75350092867f08473d/CURRENT-WORK.md). This improves the software baseline; it does not establish authentication qualification for either candidate.

| Site | Reported PHP / WordPress / Woo | Reported theme and relevant plugins | Guest checkout | This candidate's site login/link/JIT/logout/SSO |
|---|---|---|---|---|
| training.cetechbpa.com | 8.4.24 / 7.1.4 / 11.2.1 | WoodMart child1.0.0 / parent8.6.6; B2BKing5.6.80; WP Rocket3.24; Redis3.0.0 | yes | NOT RUN; SSH route remains blocked here |
| staging.cetechbpa.com | 8.4.27 / 7.1.5 / 11.2.1 | WoodMart child1.0.0 / parent8.6.6; WP Rocket3.24; Redis3.0.0; Wordfence9.1.1 | no | NOT RUN; no installation/migration |
| training.flairoc.com | 8.4.25 / 7.1.1 / 11.1.1 | Active Kadence1.5.2; Woo + WoodMart Core1.1.9. WoodMart8.6.1/child installed but inactive | no | NOT RUN; no installation/migration |

The expanded disposable matrix reproduces WP7.1.4/Woo11.2.1 with a public default theme and WP7.1.1/Woo11.1.1/Kadence1.5.2. These are version/theme fixtures, not clones of private data/configuration, WoodMart/B2BKing/caching/security certification, or a recommendation to retain older software. Latest maintained WP/Woo fixture lanes remain separate. Kadence generic/core/Woo account and mounted-login behavior must pass the new exact CI run before qualification; theme-builder/custom-header variants remain site-specific.
