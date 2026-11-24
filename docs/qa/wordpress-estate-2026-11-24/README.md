# WordPress estate qualification — 2026-11-24

Status: **BLOCKED** before connector installation. Inventory, database isolation checks, protected backups and isolated restore drills are done. Hybrid login, Join, linking, enforced mode, cross-site SSO, logout, backchannel and emergency recovery were not run.

Candidate remains [PR62](https://github.com/WB-DevWorld/AccessLobby/pull/62) head `161e05bc0a81e70c60ad23cf287f29a3abb5b8b6`. Qualified plugin source is `3d9aa57aef00807ac5174ff28fe807409873a838`, AccessLobby SSO for WordPress 0.1.0-alpha.7, ZIP SHA256 `373dce094881278b9f08e28ba3e847bb6634719605bef761ee251d80fa771afa` (50 files / 91,493 bytes). That head's 13 CI jobs succeeded. The branch had not moved when this record was written. The ZIP was not copied to a site.

## Why installation stopped

Public `https://api.accesslobby.realjanelove.com/health/live` and `/health/ready` report `3d9220a140d61df5effe633bc72cf5142c4a8371`, which is current `main`. Realm discovery at `https://iam.accesslobby.realjanelove.com/realms/accesslobby-first-party` responds and advertises PKCE S256 and backchannel logout. That revision does not contain API migrations 005/006 or typed WordPress registration.

Images publish only after CI succeeds on `main`. `compose.dokploy.yaml` pins `API_IMAGE` and `WEB_IMAGE` by digest, so merging alone does not move staging until those pins change. The Dokploy project is `accesslobby-accesslobbystaging-beass9`. The operator key for that host is accepted, but the private key is encrypted and the SSH agent has no unlocked identity. No untracked server build was used. No realm import, database edit or IAM admin credential was sent to WordPress.

## Installations

All three are single-site, `wp_get_environment_type()=staging`, HPOS runtime enabled, and not multisite. Each WordPress database account can see only its own schema. Public responses include Cloudflare `cf-ray` and `cf-cache-status: DYNAMIC`. On each origin, nginx `real_ip_header` for `X-Forwarded-For` is commented out, so PHP `REMOTE_ADDR` is the TCP peer. Emergency recovery was not configured or rehearsed. A Cloudflare address will not be used as an administrator identity.

| Site | WordPress / PHP / Woo | Theme | Commerce policy | Notable active stack | Result |
|---|---|---|---|---|---|
| `https://staging.cetechbpa.com/` | 7.1.5 / 8.4.27 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9, WP Rocket 3.24, Redis Object Cache 3.0.0, Wordfence 9.1.1, delivery engine 1.0.0-m2.5, Jetpack 16.4. Paystack gateway disabled. B2BKing installed, inactive. | Backup/restore passed. Connector **BLOCKED**. |
| `https://training.cetechbpa.com/` | 7.1.4 / 8.4.24 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout on; My Account registration on | B2BKing Core 5.2.61 and B2BKing 5.6.80, WPML 5.0.2, WP Rocket 3.24, Redis Object Cache 3.0.0, delivery engine 1.0.0-m2.4, POS bridge 0.6.0-stg05, MailPoet 5.44.0. Paystack enabled with its test-mode flag set. COD and B2BKing invoice/PO gateways enabled. Wordfence installed, inactive. | Backup/restore passed. Connector **BLOCKED**. |
| `https://training.flairoc.com/` | 7.1.1 / 8.4.25 / 11.1.1 | Kadence 1.5.2 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9 is active while the theme is Kadence. ShopLentor 3.5.2, pre-orders 2.3.1, Mailchimp for WP 4.14.1. BACS and COD enabled. | Backup/restore passed. Connector **BLOCKED**. |

`p06-physical.cetechbpa.com` is a separate staging schema on the training database host. It was inventoried only and not backed up or changed. No subdirectory installation was found. Estate subdirectory coverage remains **UNTESTED**; fixture subdirectory evidence stays in the consolidation CI record.

User and HPOS order-row counts at the restore comparison, without customer identifiers:

- staging: 2,918 users and 15,009 `wp_wc_orders` rows on both the live schema and the isolated copy
- training: 37 users and 124 order rows on both
- training.flairoc.com: 47 users and 9 order rows on both

## Private recovery references

Backups live only on the site hosts, mode 700, outside the web root, under `accesslobby-qual-backups`. They include the gzip database export, `wp-config.php` and the nginx vhost. Those files are not in Git.

| Site | Directory stamp | gzip SHA256 | Bytes | Isolated restore |
|---|---|---|---|---|
| staging.cetechbpa.com | `staging.cetechbpa.com-20261124T132601Z` | `1d8412d4becd3e81747d33394eae2324d1be39890db7ea4d0f5a2afc0c16e584` | 78,918,266 | Local MariaDB schema. All 421 base tables imported. User and order counts matched. Schema dropped. |
| training.cetechbpa.com | `training.cetechbpa.com-20261124T132605Z` | `4e73b60765869306fd598e450ebd322f02c09f4436162e8261ea49fe61da2990` | 19,240,627 | Private MySQL 8.4.10 on 127.0.0.1 only. MariaDB collation `utf8mb3_uca1400_ai_ci` (53 occurrences) was substituted to `utf8mb3_general_ci` for that engine. Counts matched. Instance and datadir removed. |
| training.flairoc.com | `training.flairoc.com-20261124T132303Z` | `18ccd0824c81f0076e59c6800268051748048996c69d6380c1f70c13fb71faad` | 19,147,614 | Same-engine local MariaDB. Counts matched with no collation substitution. Schema dropped. |

## Not claimed

No AccessLobby client, hybrid mode, Join/JIT, account link, SSO, logout, backchannel, outage or rollback behavior was observed on these sites. External publisher activation and multisite remain unsupported. Production hosts were not changed.
