# Alpha.5 controlled staging qualification

Use this runbook with the exact source/ZIP/CI revisions in the alpha.5 acceptance record. This candidate remains independent from Cursor PR60; do not install competing versions on one site at the same time or merge/select a candidate through this runbook. Production authorization and real backup/recovery rehearsal remain separate gates.

## Prepare and preserve

1. Use a non-production clone or owner-designated training/staging site. Read `integrations/wordpress/scripts/site-inventory.php` through WP-CLI and retain its non-secret inventory privately. Confirm the actual WordPress/Woo/theme/plugins, root or subdirectory paths, HPOS/CPT, guest policy, cache/CDN and security controls. Do not infer an active WoodMart theme merely from an installed WoodMart Core plugin.
2. Take a restorable host/database backup; record its private evidence reference and rehearse rollback. Capture a controlled customer's local user/order ownership, roles, addresses, downloads/subscriptions where installed and relevant B2B/membership state. Exclude real personal content from public evidence.
3. Establish the host-only emergency mechanism, exact observed administrator IP allowlist and short one-use ticket rehearsal. Proxy headers never substitute for the actual trusted remote-IP boundary. Do not expose a general local password screen if AccessLobby fails.
4. Freeze exact AccessLobby source and immutable images. This branch's typed WordPress registry routes and session receipts require migrations005/006 and the matching API; consent preview adds007/008. Keep `EXTERNAL_PROFILE_PREVIEW_ENABLED=false` on API/web for first-party WordPress qualification. Preserve the existing AccessLobby PWA deployment/update contract.

## Connect in hybrid mode

Install the versioned ZIP and verify its SHA256 before activation. Open Settings → AccessLobby, copy the exact callback, logout return and backchannel URLs, and request a distinct typed WordPress application for this exact installation. `/gh/` and `/intl/` are distinct installations only after runtime inventory establishes that fact. Use the existing DNS proof/private first-party review/provisioning/readback process; no site receives IAM administration privilege. Configure local app admission separately from WordPress roles.

Start with WordPress + AccessLobby, JIT disabled until local policy is reviewed. Test connection metadata, actual local login, Continue with AccessLobby and quiet SSO. Link a controlled existing customer and separately a privileged administrator using fresh dual proof. Verify the original numeric local user, orders, addresses, capabilities and local memberships remain intact. Matching email alone must not link. Re-test lost proof, wrong identity, duplicate mapping and original protected destination.

## Qualify selected pages and enforced mode

Create ordinary frontend test pages using the shortcode and dynamic block. Select only their dedicated login pages in Settings → AccessLobby → Frontend login pages. Leave a separate public page containing a login button unselected. Hybrid mode must keep normal page/login behavior.

Record connection, backup/recovery references, linked/unlinked privileged counts and migration acknowledgements. Only then use the readiness gate to enable AccessLobby only; expect existing sessions to be invalidated. Verify core wp-login/wp-admin, Woo My Account and required-account checkout, the selected pages with JavaScript disabled, safe protected return_to, rejected foreign return, and absence of loops. Public browsing/guest checkout must remain available according to Woo policy. Actual WoodMart modal/mobile, B2BKing, membership, WPML, Wordfence, WP Rocket, Redis and CDN tests require their real installed versions and origin/cache checks; a generic fixture is not estate certification.

Run this independently on a root site and a subdirectory site. Reuse the IAM browser session to demonstrate quiet second-site SSO; confirm each retains its own local user ID and role. Where available, repeat WordPress ↔ an existing connected application. Do not use production shoppers as test accounts or alter domain business/pricing rules.

## Logout, outages and rollback

Prove site-only sign-out leaves IAM/other app signed in and quiet re-entry works. Prove all-app sign-out ends the same browser session and targeted backchannel associations; another device must survive. Include malformed/replayed/unrelated logout requests. The optional receipt contract reconciles a missed peer at the next due check, with a maximum90-second outage grace and unchanged expiry; this is not instantaneous push or an all-devices operation. Establish fresh SSO sessions before asserting receipt coverage; older sessions retain legacy bounded behavior.

Rehearse AccessLobby/API and backchannel outages, new-login failure, bounded existing-session handling and exact host recovery. Restore hybrid/local behavior through authorized host configuration or deactivation; never delete users, orders or mappings to recover sign-in. Deactivate/reactivate, update from the exact alpha.2 test artifact where appropriate and confirm no user/order loss; private real-site backups remain the authoritative rollback.

Retain a categorical result for each site with actual environment/versions/mode/login/link/JIT/commerce/logout/SSO/rollback and source/package/image revisions. Mark missing licensed access or credentials BLOCKED/UNTESTED, rather than borrowing the fixture result. Do not call the first-party estate MVP complete until its actual two-site vertical slice, commerce preservation and rollback have passed. Do not call the inactive external-consent preview universal WordPress support.
