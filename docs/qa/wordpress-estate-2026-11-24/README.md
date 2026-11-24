# WordPress estate qualification — 2026-11-24

Status: **PARTIALLY QUALIFIED**. The matching API is promoted, alpha.7 is installed on all three sites, and one real browser proved local Woo login, the preserved order, and this-site sign-out. SSO configuration, client registration, Join, linking, cross-site SSO and emergency recovery are not qualified.

The earlier “API promotion blocked” note is historical. [PR62](https://github.com/WB-DevWorld/AccessLobby/pull/62) merged as `d875712ecb41e06d8905046e0f4bc93bb8e9e7a5`. Public `/health/ready` reports that revision. Running images, unchanged IAM and gateway pins:

- API `ghcr.io/wb-devworld/accesslobby-api@sha256:ba3b0205278ac9f76f6f37559c71b803d1b569ce1945240e3974e8ba9d82679f`
- Web `ghcr.io/wb-devworld/accesslobby-web@sha256:57eeb4d83243c813c5a1eb20c444b9cfc3dc6c68cfbde7657a8f121e2c8eb999`
- IAM `ghcr.io/wb-devworld/accesslobby-iam@sha256:e0e92a6697f8d022a8e96dbff6966f272687c32ff8637fa331a0fa8ec984653f`
- Gateway `ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:0596f93a8bf4662f811645aedae7c28e4c5a5bebdce48fe94eefd531974d1558`

Migrations 001–006 are applied and the existing 9 Person records were preserved. Keycloak and the gateway were not redeployed.

Installed package is AccessLobby SSO for WordPress 0.1.0-alpha.7 from CI run 45382011687, SHA256 `373dce094881278b9f08e28ba3e847bb6634719605bef761ee251d80fa771afa`, 50 files / 91,493 bytes. The digest matched before and after transfer. A local Python 3.14 rebuild did not match that digest, so it was not installed.

## Why SSO is not configured

`Config::validate` calls `safe_role` before discovery. On every site the subscriber role has Wordfence Login Security's `wfls_show_login_security` in addition to `read` and `level_0`. FLAIROC training also has `wf2fa_activate_2fa_self` on subscriber and customer. Alpha.7 treats any other capability as unsafe, so settings cannot be saved and SSO cannot start. The plugin remains active with its default hybrid mode and JIT off. No role capability was removed.

[PR63](https://github.com/WB-DevWorld/AccessLobby/pull/63) is the alpha.8 source change. It treats only those two own-account capabilities as non-elevating and still rejects `manage_options`. It is not installed. The alpha.7 checksum will not be reused for that code.

First-party registration is also blocked: the sites' DNS is Cloudflare (`jason.ns.cloudflare.com`, `roxy.ns.cloudflare.com`). The available Wrangler OAuth token expired at 2026-11-10T11:43:48Z and its scopes include `zone:read` but not DNS edit. No TXT proof was published and no client was requested.

## Installations

All three are single-site, `wp_get_environment_type()=staging`, HPOS runtime enabled, and not multisite. Each WordPress database account can see only its own schema. Public responses include Cloudflare `cf-ray` and `cf-cache-status: DYNAMIC`. On each origin, nginx `real_ip_header` for `X-Forwarded-For` is commented out, so PHP `REMOTE_ADDR` is the TCP peer. Emergency recovery was not configured or rehearsed. A Cloudflare address will not be used as an administrator identity.

| Site | WordPress / PHP / Woo | Theme | Commerce policy | Notable active stack | Result |
|---|---|---|---|---|---|
| `https://staging.cetechbpa.com/` | 7.1.5 / 8.4.27 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9, WP Rocket 3.24, Redis Object Cache 3.0.0, Wordfence 9.1.1, delivery engine 1.0.0-m2.5, Jetpack 16.4. Paystack gateway disabled. B2BKing installed, inactive. | Alpha.7 active. Configuration **FAILED** (`unsafe_default_role`). Browser login **UNTESTED**. |
| `https://training.cetechbpa.com/` | 7.1.4 / 8.4.24 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout on; My Account registration on | B2BKing Core 5.2.61 and B2BKing 5.6.80, WPML 5.0.2, WP Rocket 3.24, Redis Object Cache 3.0.0, delivery engine 1.0.0-m2.4, POS bridge 0.6.0-stg05, MailPoet 5.44.0. Paystack enabled with its test-mode flag set. COD and B2BKing invoice/PO gateways enabled. Wordfence installed, inactive. | Alpha.7 active, owned by `cetechtraining` (directory 775, plugin file 664). Local browser login, order 50402 and this-site sign-out **QUALIFIED**. SSO **FAILED** until alpha.8. |
| `https://training.flairoc.com/` | 7.1.1 / 8.4.25 / 11.1.1 | Kadence 1.5.2 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9 is active while the theme is Kadence. ShopLentor 3.5.2, pre-orders 2.3.1, Mailchimp for WP 4.14.1. BACS and COD enabled. | Alpha.7 active. Configuration **FAILED** (`unsafe_default_role`). Local login created a session, then `wp-admin` returned to My Account. The account page contains the Woo shortcode, but the rendered page shows the coming-soon hero and not the account dashboard. Order display **UNTESTED**. |

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

## Controlled accounts and browser evidence

Before activation, each backup gzip still matched the table above. Each site then received two synthetic local accounts, `al-qual-customer` and `al-qual-admin`, plus one private virtual product and one on-hold order. Payment used an already enabled non-card gateway (`cod` on the two CETECH sites). New Action Scheduler rows for product lookup were left in place. No mail, webhook, Paystack, POS, delivery, SMS or ERP hook was canceled because none of those names appeared. Passwords stay in the host credential file, mode 600, and are not recorded here.

On training.cetechbpa.com a real browser submitted the local customer password at `wp-login.php`. The password form and “Continue with AccessLobby” were both present. The session landed on My Account as AccessLobby Qualification Customer, and `/my-account/orders/` showed order 50402. Woo logout opened the plugin's sign-out choice. “Sign out of this site” ended that local session: My Account then showed the login form, the AccessLobby button, and the existing B2B registration fields. No AccessLobby credential was entered. On training.flairoc.com the same customer login created a WordPress session and `wp-admin/profile.php` redirected back to My Account, which confirms the session. The published My Account page contains only the Woo shortcode, but the rendered page shows “is coming soon” and does not show the account dashboard or order 4043. That account surface is **PARTIALLY QUALIFIED**. Staging has not had this browser pass.

## Not claimed

No AccessLobby client is registered. Join, JIT, account linking, cross-site SSO, all-apps logout, backchannel delivery and emergency recovery were not run. Enforced mode stays off. Subdirectory estate coverage remains **UNTESTED**. External publisher activation and multisite remain unsupported. Production hosts, `p06-physical.cetechbpa.com` and the other FLAIROC installations were not changed. Issue 59 stays open.
