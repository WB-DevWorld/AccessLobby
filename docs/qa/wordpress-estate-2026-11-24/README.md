# WordPress estate qualification — 2026-11-24

Status: **PARTIALLY QUALIFIED**, updated from published operator commit cfd71f0d7a060f40dba1b56427a8420cea1ce10a. CETECH training and staging qualify explicit customer links, quiet SSO and signed shared logout in both directions with targeted local session removal. An independent same-person browser survives the AccessLobby-initiated logout; its row remains after the WordPress-initiated logout, with a final fresh request still unrecorded. Alpha.9 stays hybrid/JIT off. FLAIROC linking, real-site Join/JIT and enforced recovery remain open.


## Two independent WordPress sites — current acceptance

[Exact source, event table, limitations and categorical evidence](../wordpress-two-site-2026-11-25/README.md). The reviewer retrieved cfd71f0; it did not re-execute private-host/browser tests. Staging's dual_proof link is customer3212/order54346/users2921; training keeps customer45/order50402/users39. Roles, guest policy and image pins remain unchanged. Staging's privileged synthetic account remains unlinked.

Training's genuine quiet callback is audits87–89. The main Edge profile then establishes fresh sessions on both clients; a separate profile signs in as the same qualification person. AccessLobby shared logout is accepted by staging16/training96 before either next page; both main-browser associations end while a fresh control Orders request still shows50402. After new main-browser sessions, staging's shared logout20–23 is followed by training accepted100 before training is opened; only the target association is removed and the control row remains.

These are signed receiver/audit and session-removal observations. The generic nginx log inspected for this two-site pass had no corresponding access line, so no origin HTTP status is claimed. Prior training-only POST200 evidence is not relabeled. A fresh control-browser request after the second logout is not in cfd71f0; record that one observation if its session remains valid. Separate physical-device behavior remains untested.

The published earlier commits061857b1508c2859f640591190c028a6e7bc5e83 and5e778d9f5eceae5d60aa6c9365947a1fe64bc026 are now retrieved. PR69 merged as afca3f13, with green main CI; older unavailable-commit and staging-challenge statements below are historical checkpoints. FLAIROC's latest main-profile challenge is a6024847dd2b3175. Controlled Join/JIT can be prepared on an available CETECH test site independently of that one site's browser gate, following the validated-role and verification contract. No production or image change.

## Earlier durable IAM recreation checkpoint — 2026-11-25

The operator reports committed local evidence061857b and5e778d9 on feat/wordpress-estate-qualification, with main423b9ac8 fetched without resetting that branch or the other working tree. Canonical GitHub could not resolve those two commits when checked here. They remain reported local references pending push/full-SHA inspection. This Work environment has not accessed the private hosts or qualification browser. [Categorical deployment evidence and precise provenance](../iam-egress-2026-11-25/operator-post-recreation.json).

The operator applied Compose423b9ac8a2db5fba332252b08737794692236a24 with the existing image pins/GIT_SHA d875712 and database volumes preserved. Only IAM was recreated. The same gateway passed nginx -t and reloaded. Backend/iam-edge remain internal; iam-egress is a non-internal bridge with one peer, used by IAM's single IPv4 default route. No host port is published. The working temporary default attachment remained on the old container until replacement was running; it was not disconnected first.

| Post-recreation flow | Audit / origin evidence | Result |
|---|---|---|
| AccessLobby shared logout into active WordPress | backchannel_accepted75, Unix1795622222, origin POST200 at15:57:02UTC before the next WordPress page load | QUALIFIED on durable route |
| Site-only logout and quiet re-entry | logout audit79; re-entry80–82 | QUALIFIED |
| WordPress shared logout | shared_logout_recorded83, request84, local85, separate backchannel_accepted86; origin POST200 at15:59:38UTC | QUALIFIED on durable route |
| Independent browser and local data | Edge qualification profile stayed signed in. No session_reconciled_ended followed. Customer45/active dual_proof link/customer role/order50402/users39 preserved. | QUALIFIED browser isolation/data preservation; separate physical device untested |

Public ready reports d875712; web/discovery/JWKS200 and IAM root/admin/master/metrics/health404 by operator report. Runtime inventory's two findings are absent iam-config/migrate containers, reported previously completed. Their absence is not proof of historical completion. Network policy matches; overall inventory remains incomplete. The inspector's additive networkPolicyPassed field preserves its strict overall pass/exit semantics. Do not rerun completed bootstrap jobs just to repopulate the container list.

Staging wp-login in the same Edge profile still shows a Cloudflare challenge, latest Ray a601de7339f8d057-ACC. A person must complete it in the existing %LOCALAPPDATA%\al-qual-edge profile, then start a fresh local WordPress login/Connect flow. No clearance export, source-IP guess, IP exception or Bot Fight Mode change. The manual check is separate from the now-qualified IAM route and training logout. Join/JIT, privileged linking, other-site linking and two-WordPress SSO remain open. Earlier observations below retain their original test conditions.

## Earlier training logout — temporary-route checkpoint, 2026-11-25

The operator supplied these observations in the work conversation; its latest estate working-tree changes were not yet committed. The last inspected qualification branch head is ed84fa9266d83486f227af3c2c4adb6e89a044b1. Do not attribute the new tests to that commit or claim they were re-executed by this Work environment. The [durable networking acceptance record](../iam-egress-2026-11-25/README.md) separates reproducible CI from this live evidence.

| Journey | Observation | Qualification |
|---|---|---|
| Site-only logout and quiet re-entry | Audit42 logout_this_site; Continue with AccessLobby returned to My Account and order50402 with no Keycloak password form, audits43–45. | QUALIFIED on training |
| AccessLobby web shared logout while WordPress session active | After the temporary routing repair, origin POST200 at13:40:11UTC; audit56 backchannel_accepted before any next WordPress page. Target session removed without session_reconciled_ended. | QUALIFIED under temporary network condition |
| WordPress shared logout | Receipt marker shared_logout_recorded audit63, logout_all_requested64, logout_this_site65; independent signed backchannel_accepted66 and origin POST200 at13:43:19UTC. Browser reached signed-out page. | QUALIFIED under temporary network condition |
| Independent browser session | Edge158 qualification profile stayed on My Account through both shared logouts. | QUALIFIED browser-session isolation; not a separate physical-device result |
| Local ownership | Customer45, active dual_proof mapping, customer role, order50402 and39 users unchanged. | Preserved |

The first shared-logout attempt failed with Keycloak UnknownHostException for training.cetechbpa.com and no IAM default route. The operator connected IAM to accesslobby-accesslobbystaging-beass9_default, already used by the API. That manual attachment disappears when IAM is recreated. Source Compose's two internal-only IAM networks explain the gap. This success is not acceptance of durable routing; follow the network-only runbook and repeat signed delivery after recreation. Simply disconnecting the temporary attachment reintroduces the failure. No image, plugin, guest or enforced-mode policy changed.

Cloudflare Events remain unavailable without an appropriate token. The Service, rule and actual source IP for Work probes a5fac7a44f9a3a0f-ORD (staging) and a5fac7bf784b23d3-ORD (FLAIROC) are unknown. The actual Edge GET /wp-login.php returned403/cf-mitigated=challenge with staging Ray a6011677ed90f30c-ACC and FLAIROC Ray a6011694bd059330-ACC. No IP exception or Bot Fight Mode change occurred. Driver Booster's elevated foreground window blocks Cursor's desktop control; the owner must minimize/close it, solve the challenge in the existing Windows qualification Edge profile, then begin a fresh local login/Connect flow. No clearance cookie is exported and no source IP is inferred from a Ray ID.

Earlier installation, inventory and recovery observations follow unchanged.

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
| `https://staging.cetechbpa.com/` | 7.1.5 / 8.4.27 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9, WP Rocket 3.24, Redis Object Cache 3.0.0, Wordfence 9.1.1, delivery engine 1.0.0-m2.5, Jetpack 16.4. Paystack gateway disabled. B2BKing installed, inactive. | Alpha.9 hybrid/JIT off. One active dual_proof link for customer3212, role/customer order54346/users2921 preserved; privileged synthetic account unlinked. Quiet entry/site-only re-entry and signed two-site shared logout qualified in cfd71f0. |
| `https://training.cetechbpa.com/` | 7.1.4 / 8.4.24 / 11.2.1 | Woodmart Child 1.0.0, parent Woodmart 8.6.6 | Guest checkout on; My Account registration on | B2BKing Core 5.2.61 and B2BKing 5.6.80, WPML 5.0.2, WP Rocket 3.24, Redis Object Cache 3.0.0, delivery engine 1.0.0-m2.4, POS bridge 0.6.0-stg05, MailPoet 5.44.0. Paystack enabled with its test-mode flag set. COD and B2BKing invoice/PO gateways enabled. Wordfence installed, inactive. | Alpha.9 hybrid/JIT off. Customer45/active dual_proof link/customer role/order50402/users39 preserved. Fresh quiet callback87–89; both shared-logout directions include signed receipt at this site before page access. Independent browser control observation and exact scope are in cfd71f0. |
| `https://training.flairoc.com/` | 7.1.1 / 8.4.25 / 11.1.1 | Kadence 1.5.2 | Guest checkout off; My Account registration on | Woodmart Core 1.1.9 is active while the theme is Kadence. ShopLentor 3.5.2, pre-orders 2.3.1, Mailchimp for WP 4.14.1. BACS and COD enabled. | Alpha.9 hybrid, JIT off. CLI and origin `login.css?ver=0.1.0-alpha.9`. Customer 122, order 4043 still owned by 122, users 49, links 0. Anonymous `/my-account/` still shows the coming-soon page. `wp-login.php` stops on Cloudflare's human verification, so the login form was not reached in this pass. Latest main-profile challenge a6024847dd2b3175; linking remains blocked pending manual clearance and fresh local login. |

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
| Explicit dual-proof linking | **QUALIFIED** on CETECH training45 and staging3212 for the same verified AccessLobby identity. Local customer roles/orders50402 and54346/users39 and2921 preserved; staging link audits5–8. FLAIROC linking is **BLOCKED** by its current browser challenge. Privileged linking remains **UNTESTED**. |
| Repeat login and two-site quiet SSO | **QUALIFIED**: training fresh callback87–89 at1795624582–1795624598, without password entry; staging site-only9 and quiet return10–12 at1795624695–1795624700 while training stays signed in. Published source cfd71f0. Real-site Join/JIT remains **UNTESTED**, off by configuration. |
| Both shared-logout directions and independent browser isolation | **QUALIFIED for signed receiver acceptance/targeted removal** across training and staging: AccessLobby logout accepted staging16/training96, WordPress logout staging20–23 then training100 before page access. Fresh control request survives the first direction; control row survives the second, but its post-request observation is **UNTESTED**. No HTTP status or different-device result claimed for this pass. |
| Enforced mode and emergency recovery | **BLOCKED** until a single-administrator route is rehearsed |

## Not claimed

Three first-party clients are active, with alpha.9/hybrid/JIT off. CETECH training and staging have separate linked local customers with preserved roles/orders and actual quiet SSO/shared-logout acceptance above. FLAIROC linking, real-site Join/JIT, privileged linking, trusted emergency recovery/enforced mode and estate subdirectory coverage remain open. Overall inventory still lacks completed-job container/history evidence; its network verdict is separate. External activation and multisite remain unsupported. Production, p06-physical and other FLAIROC installs were not changed. Issue59 stays open.
