# WordPress estate qualification — 2026-11-24

Status: **PARTIALLY QUALIFIED**. AccessLobby SSO 0.1.0-alpha.9 is hybrid with JIT off on all three sites. Local customer login, order visibility and this-site sign-out remain proved. All three WordPress clients stay active first-party registrations. CETECH training keeps its dual-proof link. On 2026-11-25 that site passed site-only logout, quiet same-site re-entry, AccessLobby-initiated all-apps logout with a signed backchannel POST, the reverse WordPress all-apps logout, and survival of a separate Edge profile. Staging and FLAIROC remain unlinked because the qualification Edge profile receives a Cloudflare challenge on `wp-login.php`. Two-site quiet SSO and Join/JIT are untested. Enforced mode stays off.

The earlier “API promotion blocked” note is historical. [PR62](https://github.com/WB-DevWorld/AccessLobby/pull/62) merged as `d875712ecb41e06d8905046e0f4bc93bb8e9e7a5`. Public `/health/ready` reports that revision. Running images, unchanged IAM and gateway pins:

- API `ghcr.io/wb-devworld/accesslobby-api@sha256:ba3b0205278ac9f76f6f37559c71b803d1b569ce1945240e3974e8ba9d82679f`
- Web `ghcr.io/wb-devworld/accesslobby-web@sha256:57eeb4d83243c813c5a1eb20c444b9cfc3dc6c68cfbde7657a8f121e2c8eb999`
- IAM `ghcr.io/wb-devworld/accesslobby-iam@sha256:e0e92a6697f8d022a8e96dbff6966f272687c32ff8637fa331a0fa8ec984653f`
- Gateway `ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:0596f93a8bf4662f811645aedae7c28e4c5a5bebdce48fe94eefd531974d1558`

Migrations 001–006 are applied and the existing 9 Person records were preserved. Public registration then created qualification person `e37e055a-e095-41db-b6f6-9a7c87d356bb`, separate from the application owner. Keycloak and the gateway were not redeployed.

Alpha.7 from CI run 45382011687, SHA256 `373dce094881278b9f08e28ba3e847bb6634719605bef761ee251d80fa771afa`, 50 files / 91,493 bytes, was installed first. Its digest matched before and after transfer. A local Python 3.14 rebuild did not match that digest, so it was not installed. `Config::validate` then rejected subscriber on every site because Wordfence Login Security adds `wfls_show_login_security` (and, on FLAIROC, `wf2fa_activate_2fa_self`). No role capability was removed.

[PR63](https://github.com/WB-DevWorld/AccessLobby/pull/63) merged as `344cd8cee6ac48b952d9eaffac29b3b7e7473a95`. Alpha.8 treats only those two own-account capabilities as non-elevating and still rejects `manage_options`. The installed ZIP is the main Windows artifact from run 45415908064, SHA256 `5760b2daa738d7eab2b055548b67407e04bc0f60cf60a111a63987c424e58c3b`, 92,107 bytes. It matches the green PR artifact. The digest matched on each host before upgrade. Each site was `0.1.0-alpha.8`, hybrid, JIT off, and its discovery call reached API ready `d875712`.

[PR64](https://github.com/WB-DevWorld/AccessLobby/pull/64) merged as `99f4a45138be0ced62488f851cdd63d59d81aae8`, with [PR65](https://github.com/WB-DevWorld/AccessLobby/pull/65) included, and [PR66](https://github.com/WB-DevWorld/AccessLobby/pull/66) merged as `1ea357c`. The installed package is the main Windows artifact `accesslobby-wordpress-pilot-windows` from run `45461388834`, artifact `14951894136`: `accesslobby-sso-0.1.0-alpha.9.zip`, 92,760 bytes, SHA256 `6521df67c33a34d8ccdebd8832d26f13355ea5ea66d67397cc645f4254df7d42`. The same digest matched locally and on each host before `wp plugin install --force`. The temporary copy was removed from each host after install. Image pins are unchanged.

| Site | Request | Callback and signed-out return | Backchannel |
|---|---|---|---|
| training.cetechbpa.com | `cetech-training-wp`, `72d29a2d-f629-432e-9603-e1d798210990` | `https://training.cetechbpa.com/wp-login.php?action=al_callback` and `?action=al_signed_out` | `https://training.cetechbpa.com/wp-json/accesslobby/v1/backchannel-logout` |
| training.flairoc.com | `flairoc-training-wp`, `043bb9fe-9e16-4cd1-9e1d-120c819d58ee` | `https://training.flairoc.com/wp-login.php?action=al_callback` and `?action=al_signed_out` | `https://training.flairoc.com/wp-json/accesslobby/v1/backchannel-logout` |
| staging.cetechbpa.com | `cetech-staging-wp`, `39cdfa01-e33b-4116-948e-9d832a314c19` | `https://staging.cetechbpa.com/wp-login.php?action=al_callback` and `?action=al_signed_out` | `https://staging.cetechbpa.com/wp-json/accesslobby/v1/backchannel-logout` |

Application requests were created unreviewed, then verified and activated. Each is platform WordPress, visibility hidden, and admission authenticated open. `ALLOWED_CLIENT_IDS` remains `accesslobby-web,reference-consumer`. No row was inserted by hand.

Both Cloudflare nameservers, `jason.ns.cloudflare.com` and `roxy.ns.cloudflare.com`, returned these exact TXT values:

| Host | Value |
|---|---|
| `_accesslobby-verify.training.cetechbpa.com` | `accesslobby-verify=cabCC4l7m8P_wdY4XjFFQp0wp23gn3ithk8IwD1SCSo` |
| `_accesslobby-verify.training.flairoc.com` | `accesslobby-verify=XU3YgkTD1YoNgS58-egP-YyY6I9Y-8CKNAa7QdQEtHs` |
| `_accesslobby-verify.staging.cetechbpa.com` | `accesslobby-verify=-MMCIPgf8-FBgukZ7RBTgBFfmHTgJ73DyyzrirwhbbQ` |

The API `verifyOrigin` check, from the running API container, recorded `originVerified: true` for those three hosts. The private plan for each client was a public authorization-code client with PKCE S256, one exact callback, the matching signed-out return, backchannel logout with session required, and an access-token audience of `accesslobby-api`. Implicit flow, direct access grants and service accounts were off. That plan was accepted as first-party review `wordpress-estate-2026-11-24` and activated. A later full IAM read confirmed the same callback, logout, backchannel, PKCE and audience mapper on each client. The registry rows are `active` / `first_party`. A filtered client list omits the attribute map; the full client representation contains it.

## Installations

All three are single-site, `wp_get_environment_type()=staging`, HPOS runtime enabled, and not multisite. Each WordPress database account can see only its own schema. Public responses include Cloudflare `cf-ray` and `cf-cache-status: DYNAMIC`. On each origin, nginx `real_ip_header` for `X-Forwarded-For` is commented out, so PHP `REMOTE_ADDR` is the TCP peer. Emergency recovery was not configured or rehearsed. A Cloudflare address will not be used as an administrator identity.

| Site | WordPress / PHP / Woo | Theme | Commerce policy | Notable active stack | Result |
|---|---|---|---|---|---|
| `https://staging.cetechbpa.com/` | 7.1.5 / 8.4.27 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9, WP Rocket 3.24, Redis Object Cache 3.0.0, Wordfence 9.1.1, delivery engine 1.0.0-m2.5, Jetpack 16.4. Paystack gateway disabled. B2BKing installed, inactive. | Alpha.9 hybrid, JIT off. CLI and origin `login.css?ver=0.1.0-alpha.9`. Customer 3212, order 54346 still owned by 3212, users 2921, links 0. Local customer login reaches My Account. Connect AccessLobby has not completed: the POST to `wp-login.php?action=al_start` stops on Cloudflare's human verification. |
| `https://training.cetechbpa.com/` | 7.1.4 / 8.4.24 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout on; My Account registration on | B2BKing Core 5.2.61 and B2BKing 5.6.80, WPML 5.0.2, WP Rocket 3.24, Redis Object Cache 3.0.0, delivery engine 1.0.0-m2.4, POS bridge 0.6.0-stg05, MailPoet 5.44.0. Paystack enabled with its test-mode flag set. COD and B2BKing invoice/PO gateways enabled. Wordfence installed, inactive. | Alpha.9 hybrid, JIT off. CLI `0.1.0-alpha.9` and public `login.css?ver=0.1.0-alpha.9`. The existing user 45 `customer` link stays `active` `dual_proof`. Users stay 39. Order 50402 stays owned by 45. A new AccessLobby entry reaches My Account, Orders, and the homepage, and the session is still present after the peer recheck. |
| `https://training.flairoc.com/` | 7.1.1 / 8.4.25 / 11.1.1 | Kadence 1.5.2 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9 is active while the theme is Kadence. ShopLentor 3.5.2, pre-orders 2.3.1, Mailchimp for WP 4.14.1. BACS and COD enabled. | Alpha.9 hybrid, JIT off. CLI and origin `login.css?ver=0.1.0-alpha.9`. Customer 122, order 4043 still owned by 122, users 49, links 0. Anonymous `/my-account/` still shows the coming-soon page. `wp-login.php` stops on Cloudflare's human verification, so the login form was not reached in this pass. |

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

On training.cetechbpa.com a real browser submitted the local customer password at `wp-login.php`. The password form and “Continue with AccessLobby” were both present. The session landed on My Account as AccessLobby Qualification Customer, and `/my-account/orders/` showed order 50402. Woo logout opened the plugin's sign-out choice. “Sign out of this site” ended that local session: My Account then showed the login form, the AccessLobby button, and the existing B2B registration fields. No AccessLobby credential was entered. On staging.cetechbpa.com the same alpha.8 browser flow signed in as the synthetic customer, showed order 54346 at `/my-account/orders/`, and “Sign out of this site” returned the signed-out confirmation. Local staging login is **QUALIFIED**.

FLAIROC training’s missing dashboard was WooCommerce Launch Your Store, not a theme edit. `woocommerce_coming_soon` is `yes` and `woocommerce_store_pages_only` is `no`, so every front-end page is coming soon except a user who can `manage_woocommerce`. The My Account page is still page 13 with the Woo shortcode. The private-link option is enabled; its share key was not used. The existing `flairoc-training-safety` plugin only disables `wp_mail` and was left in place. After the exemption below, a signed-in synthetic customer saw the account dashboard and order 4043, then signed out of this site. The anonymous homepage still says the site is coming soon, so the shop was not launched. That signed-in account flow is **QUALIFIED** with the exemption installed. Anonymous My Account, the local login form on that route, and the signed-out return are **UNTESTED**: the filter does not run for a signed-out visitor, so those pages still render the coming-soon hero.

The temporary file is `/home/flairoctraining/htdocs/training.flairoc.com/wp-content/mu-plugins/al-qual-account-preview.php`, owner `flairoctraining:flairoctraining`, mode 644, 472 bytes, SHA256 `0830877c73e41c5fc77bf215cf3d6e18916972cc3f03c5952ef50c9ccf25a3a2`. Its full source is:

```php
<?php
/**
 * Plugin Name: AccessLobby qualification account preview
 * Description: Temporary exemption so a signed-in customer can open WooCommerce account pages while the site stays in coming-soon mode. Remove after the qualification check.
 */

add_filter(
	'woocommerce_coming_soon_exclude',
	static function ( $excluded ) {
		if ( $excluded ) {
			return $excluded;
		}
		return is_user_logged_in() && function_exists( 'is_account_page' ) && is_account_page();
	}
);
```

Remove only that file as `flairoctraining`, then confirm it is gone and the anonymous homepage still says the site is coming soon. Do not delete `flairoc-training-safety.php` and do not change `woocommerce_coming_soon` or `woocommerce_store_pages_only`.

## Recovery

Enforced mode stays off. Recovery accepts a session only when `ACCESSLOBBY_EMERGENCY_ENABLED` is true, the request is HTTPS, and `REMOTE_ADDR` is one of the configured `ACCESSLOBBY_EMERGENCY_IPS`. Neither constant is set. The staging host has only `lo` and `ens3`; nginx listens on public 80, 443 and 8080, with no VPN or private admin interface. The origin certificate is issued by `CN=staging.cetechbpa.com` to itself, so a normal browser does not trust it. Certificate checks were not disabled. PHP still sees the TCP peer because nginx’s forwarded-header handling is commented out. A Cloudflare address is not an administrator, and a loopback tunnel would identify every local process rather than one person. No recovery allowlist or ticket was created.

## Capability results

| Capability | Result |
|---|---|
| Local customer login, own order, and this-site sign-out on alpha.8 | **QUALIFIED** on all three sites |
| FLAIROC coming-soon account exemption | **QUALIFIED** for a signed-in account page. Anonymous My Account login and signed-out return remain **UNTESTED**. |
| Application request, origin proof, reviewed activation and IAM readback | **QUALIFIED** for the three hidden, authenticated-open WordPress clients |
| Unlinked-identity refusal | **QUALIFIED** on CETECH training: an unlinked AccessLobby identity received `account_link_required`. Users remained 39 and links remained 0. |
| Explicit dual-proof linking | **QUALIFIED** on CETECH training only. Qualification person `e37e055a-e095-41db-b6f6-9a7c87d356bb` linked to WordPress user 45, role `customer`, provenance `dual_proof`. One link. Order 50402 stays on user 45. Users stayed 39. The alpha.9 upgrade did not recreate the account or the link. Staging and FLAIROC remain at 0 links. The privileged account is **UNTESTED**. |
| Repeat AccessLobby login and quiet SSO | **QUALIFIED** for one CETECH training session on alpha.9, and again for same-site re-entry after site-only logout. Audit `session_started` id 36 and `callback_succeeded` id 37 are both at `1795546126` for user 45. The later site-only result is in the logout row. Quiet SSO between two WordPress sites remains **UNTESTED**. |
| Site-only logout and quiet re-entry | **QUALIFIED** on CETECH training. `logout_this_site` id 42 at `1795612735` for user 45, then the signed-out page. “Continue with AccessLobby” returned without a Keycloak password form: `auth_started` id 43 at `1795612752`, `session_started` id 44 and `callback_succeeded` id 45 at `1795612757`. My Account showed the qualification customer and Orders showed order 50402. Role stayed `customer`, the link stayed one active `dual_proof`, and users stayed 39. |
| All-apps logout and signed backchannel | **QUALIFIED** on CETECH training for both directions, after a staging-IAM egress correction recorded below. AccessLobby web “Sign out of AccessLobby and supported apps” produced origin `POST /wp-json/accesslobby/v1/backchannel-logout` HTTP 200 at 2026-11-25 13:40:11 UTC and `backchannel_accepted` id 56 at `1795614011`, before the next WordPress page load. The targeted session row was gone. No `session_reconciled_ended` was written. The separate Edge profile still showed “Hello AccessLobby Qualification Customer”. The reverse WordPress “Sign out of all connected apps” wrote `shared_logout_recorded` id 63 and `logout_all_requested` id 64 at `1795614194`, `logout_this_site` id 65 at `1795614195`, then `backchannel_accepted` id 66 at `1795614199` with origin POST 200 at 13:43:19 UTC. That browser reached the signed-out page. Edge still showed the qualification customer. `shared_logout_recorded` is the receipt end marker and is not the backchannel event. |
| Enforced mode and emergency recovery | **BLOCKED** until a single-administrator route is rehearsed |

## Logout delivery and the Cloudflare gate — 2026-11-25 UTC

The first AccessLobby all-apps logout, at 13:29:32 UTC, did not reach WordPress. Keycloak logged `UnknownHostException: training.cetechbpa.com` for client `cetech-training-wp`. The staging IAM container was attached only to the internal `backend` and `iam-edge` networks and had no default route. The API container on the same host could already resolve that name. No origin backchannel request was logged, both WordPress session rows remained, and no `backchannel_accepted` was written.

The correction connected that running IAM container to the existing non-internal network `accesslobby-accesslobbystaging-beass9_default`, which is the egress network the API container already uses. It is a runtime attachment, not a compose change, image-pin change, or Cloudflare change. Rollback is `docker network disconnect accesslobby-accesslobbystaging-beass9_default accesslobby-accesslobbystaging-beass9-iam-1`. A later container recreate drops the attachment. After it, `getent` resolved the training host and a credential-free GET of the backchannel route returned HTTP 404, which is the route's non-POST response. The signed POST tests above then returned HTTP 200.

The independent browser is Microsoft Edge 158 using the preserved profile `%LOCALAPPDATA%\al-qual-edge`. It is not the IDE qualification tab and not the owner's default Edge or Chrome profile. It signed in as the qualification customer and remained signed in after both all-apps directions.

Cloudflare Events were not queried. No `CLOUDFLARE_API_TOKEN` is configured, and no zone rule was changed. The 2026-11-24 Work-executor probes remain staging `a5fac7a44f9a3a0f-ORD` and FLAIROC `a5fac7bf784b23d3-ORD`; those are not this browser. On 2026-11-25 the qualification Edge profile received `cf-mitigated: challenge` for GET `/wp-login.php`: staging `a6011677ed90f30c-ACC` and FLAIROC `a6011694bd059330-ACC`, both HTTP 403. The FLAIROC page shows “Performing security verification” and that Ray ID. It does not show the source address, and Events was not available, so no IP exception was created. Standard Bot Fight Mode was left unchanged. Staging and FLAIROC linking waits for a person to complete that challenge in this same Edge profile, then a fresh local WordPress login.

## Not claimed

Three first-party WordPress clients are registered and active. All three sites run alpha.9 in hybrid mode with JIT off. CETECH training has one dual-proof customer link, and its AccessLobby logout and signed backchannel are qualified above. Staging and FLAIROC linking, two-site quiet SSO, privileged linking and Join/JIT remain **UNTESTED** while the qualification browser is challenged. Enforced mode stays off. Subdirectory estate coverage remains **UNTESTED**. External publisher activation and multisite remain unsupported. Production hosts, `p06-physical.cetechbpa.com` and the other FLAIROC installations were not changed. No Cloudflare exception was added. Issue 59 stays open.
