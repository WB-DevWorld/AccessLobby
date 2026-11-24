# Consolidated first-party WordPress staging

Use feat/wordpress-consolidation / PR62 and the exact qualified source, ZIP and image revisions in the [acceptance record](../qa/wordpress-consolidation-2026-11-24/README.md). PR60 and PR61 are preserved inputs; do not install competing candidates on the same site. This is a controlled staging runbook. Main merge, immutable AccessLobby staging promotion and production enforcement remain separate recorded actions.

Alpha.7 supersedes alpha.6 for new pilots after the late-hook rollback defect. The current acceptance contains the reproduced red baseline and exact fixed-source proof; the earlier alpha.6 result remains historical.

## Preserve and inventory

1. Start with the owner-designated CETECH staging/training or FLAIROC training installation. Reconfirm hostname, document root and environment before writing. Run integrations/wordpress/scripts/site-inventory.php through that site's WP-CLI, retaining the private categorical inventory. Establish active theme/child theme, WP/PHP/Woo, HPOS/CPT, B2B/membership/cache/security plugins, guest policy and root/subdirectory topology. Installed WoodMart Core alone does not prove WoodMart is active.
2. Record a restorable host/database backup and rehearse recovery. Capture only a controlled administrator/customer's original local IDs, roles, capabilities, orders, addresses and installed extension relationships. Keep customer content and credentials out of repository evidence.
3. Secure host access and explicitly configure the emergency mechanism from the [recovery guide](../../integrations/wordpress/docs/recovery.md). Rehearse its exact-IP, short, single-use ticket for an existing administrator. Do not infer the emergency IP from arbitrary proxy headers or expose unrestricted local password login during an outage.
4. Use the existing AccessLobby branch → PR → CI → immutable image → staging workflow. The matching API applies migrations001–006. It must support typed WordPress URLs and optional opaque session receipts before relying on those features. Record actual running image digests and API revision. Preserve PWA redirect, logout, private cache and update behavior.

This first-party release has no consent/profile preview routes, CLI or migrations007/008. Old preview flags do not enable them. Existing development preview data is retained and inactive. The deferred implementation remains at PR61/3131df44bb7f6bb006a2dac6bcbac29591f288e9; never drop identity or commerce data to change release scope.

## Register and start in hybrid mode

Verify the installable alpha.7 ZIP against its acceptance-record digest. Upload that ZIP through WordPress Plugins, activate and open Settings → AccessLobby. The outer review/evidence archive is not installable. The plugin's [setup guide](../../integrations/wordpress/docs/setup.md) explains all settings and exact WordPress-derived routes.

Register each installation as a distinct typed WordPress application using the displayed callback, signed-out return and backchannel URLs verbatim, including fixed queries and path prefixes. Complete the existing DNS proof, private first-party review, provisioning and live IAM readback. Do not hand-edit application rows, substitute wildcards or distribute IAM administration credentials to WordPress. Select app entry (authenticated_open or grant_required) separately from local roles and entitlements.

Start in **WordPress + AccessLobby**, with JIT disabled until the local role/journey policy is reviewed. Verify metadata connectivity and actual local/SSO sign-in. Fresh dual-proof link one existing customer and one existing privileged account. Record original local IDs, roles and commerce ownership before/after. Matching email must fail to auto-link. Exercise lost proof, different person, replay, collision and retained protected destination.

## Qualify both modes and independent sites

Use two independently registered non-production installations, including one WooCommerce installation and a subdirectory where available. Prove Site A → AccessLobby → Site B reuses one browser SSO session without another credential prompt, while each site retains its own local account/data. Repeat with another connected application where available.

Test wp-login, wp-admin, frontend login, Woo My Account, registration/Join and checkout policy. Use editor shortcode/block pages and a mounted/mobile login adapter; select dedicated login pages for server-side entry with JavaScript disabled. A separate unselected public page containing a login action must stay public. Test safe original destinations and foreign-return rejection.

After backup/recovery, controlled privileged linking and measured readiness acknowledgements, enable **AccessLobby only**. Verify automatic initiation, normal local password/cookie/registration denial, callback/logout exemptions and no loops. Keep explicit machine authentication policy separate. Unknown identity claims must not elevate a user. Guest purchasing remains governed by Woo; required-account checkout is a separate local policy.

Qualify actual WoodMart/modal/mobile, B2BKing, WPML, WP Rocket, Redis, Wordfence, Cloudflare and installed commerce/membership extensions independently. Synthetic role/business metadata and public default/Kadence fixtures are not licensed-stack certification.

## Logout, outages and rollback

Prove **Sign out of this site** clears only the current local session, leaves IAM/other apps active and permits quiet re-entry. Prove **Sign out of all connected apps** ends the shared browser SSO session and matching participating app sessions; another browser/device survives. Exercise signed backchannel, wrong issuer/audience/signature, replay, unrelated sid and a missed peer.

Opaque receipt checks reconcile a missed backchannel at the next due check, normally 30 seconds; outage grace is at most 90 seconds without extending the cookie expiry. Older sessions retain their prior bounded behavior. Establish fresh SSO sessions before asserting receipt coverage. These controls do not mean sign out every device.

Rehearse AccessLobby/API/backchannel outages, new-login failure, bounded existing-session behavior and deliberate host recovery. Follow the recovery guide to deactivate or restore the intended hybrid/local policy without deleting users, orders or mappings. Test actual alpha.6 → alpha.7 ZIP upgrade and data preservation. Reactivating saved enforced mode invalidates local sessions created during rollback. A database rollback must not discard newer commerce records.

For each site retain environment, exact versions/client/routes/revisions/digests, modes and categorical login/link/JIT/commerce/logout/SSO/recovery/rollback outcomes. Keep missing credentials or licensed access BLOCKED/UNTESTED. No first-party estate MVP acceptance without the real two-site, commerce-preserving and reversible vertical slice. No external publisher activation is authorized by this runbook.
