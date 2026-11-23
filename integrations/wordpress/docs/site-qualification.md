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
