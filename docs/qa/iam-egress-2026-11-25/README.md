# IAM durable outbound network — 2026-11-25

Status: **IMPLEMENTATION AND STAGING NETWORK/LOGOUT RECREATION QUALIFIED** by the evidence types below. Overall deployment inventory remains incomplete; the WordPress estate remains **PARTIALLY QUALIFIED**. Relates to #59 and PR68. No production acceptance is inferred.

## Later two-site acceptance

The published operator commit cfd71f0 now extends the accepted durable route to quiet SSO and both signed shared-logout directions across CETECH training and staging. [Two-site source/event/control scope](../wordpress-two-site-2026-11-25/README.md). Earlier061857b/5e778d9 references are now retrievable. Their old unavailable status and staging challenge below are historical. This adds no new network rollout or HTTP-status claim for the two-site pass. FLAIROC linking, real-site Join/JIT, recovery/enforced mode and external activation remain open.

## Current staging acceptance

The operator reports that PR68 main423b9ac8a2db5fba332252b08737794692236a24 is applied as network configuration, with the existing image digests and image-source GIT_SHA d875712 unchanged. Only IAM was recreated; database volumes were preserved. The same gateway container passed nginx -t and was reloaded. Backend/iam-edge remain internal; the dedicated non-internal bridge has one peer, and IAM's single IPv4 default route uses it. No host port is published. The old temporary attachment was retained until the replacement worked. [Categorical operator evidence](operator-post-recreation.json).

After recreation, actual AccessLobby shared logout reached WordPress before the next page load: backchannel_accepted audit75 / Unix1795622222 / origin POST200 at15:57:02UTC. The independent Edge profile stayed signed in. Site-only logout is audit79 and quiet re-entry80–82. WordPress shared logout recorded receipt83/request84/local85 and a separate signed acceptance86, origin POST200 at15:59:38UTC. No session_reconciled_ended followed. Customer45, active dual_proof link, customer role, order50402 and39 users remain unchanged. This qualifies actual training logout on the durable route, not only the CI namespace probe; it does not prove two independent WordPress sites or a different physical device.

Provenance: the owner supplied Cursor's runtime report and local qualification commits061857b and5e778d9. Canonical GitHub could not resolve either commit when checked here. Record them as reported local references until the branch is pushed and the full SHAs/diffs can be retrieved. No private host, signed token or browser session was accessed or retested by this Work environment. PR68's post-merge CI45647948724, theme45647948846 and immutable-image publishers45648482563/45648315146 all pass; publication does not promote those new images to staging.

The runtime inspector's only reported findings are missing iam-config and migrate containers. Their prior completion is operator-reported, not established by their absence. Network-policy acceptance is separate from the still-incomplete overall inventory. The additive networkPolicyPassed report field preserves the original passed=false and nonzero CLI exit for absent/failed jobs. Do not rerun configuration/migration jobs merely to make an inventory green; retain private deployment history/receipts and verify current migration/realm state through the protected operator route. No skip-jobs policy is added.

The latest same-profile staging wp-login challenge has Ray a601de7339f8d057-ACC. A person must complete it in the existing Windows qualification Edge profile, then start a fresh local WordPress login/Connect flow. Two-WordPress quiet SSO, other-site links, Join/JIT, privileged linking and trusted emergency recovery/enforced mode remain open. Source acceptance, earlier CI and the temporary-route history follow; they are historical checkpoints, not the current rollout status.

## Reproduced regression

| Evidence | Exact reference |
|---|---|
| Base main | cd09c064b2ad2575cfb328d3a7d9492bcd6229c0 |
| Regression-only candidate | 38456b3d4eec797bde437b18c951422c12b1acd1 |
| Actual PR merge checkout | 969b9eb634269bd275d7faff6d390cf646cb6fc1 |
| Native CI | [45644765464](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45644765464), IAM job139312654873 |
| Categorical artifact | iam-network-smoke /15036224170 |
| Retained report | [ci/red/report.json](ci/red/report.json), SHA256 9d255cb50387b8fd5b83a157926c443e7ae5e552bc74150767b6d074b112db10 |

The normal-network DNS/TLS control reached HTTP200. Real Keycloak/PostgreSQL booted on source internal-only IAM networks. The legacy phase had no default route and could not reach public HTTPS. Recreating IAM from the same declared source also had no route or HTTPS reachability, so the required desired-topology assertion failed. Cleanup passed. The general verify job passed; this is an intentional routing regression, not a generic startup/test-infrastructure failure.

## Qualified implementation

| Evidence | Exact reference |
|---|---|
| Implementation candidate | 557e40a43184e49efe253299172871c261b1cd96 |
| Actual PR merge checkout | 1ae5aa2191c37937144f1cdc56d7bb3299097189 |
| Main CI | [45646022732](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45646022732), verify139317125911 / IAM139317126388, both PASS |
| Theme CI | [45646022420](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45646022420), job139317125062 PASS |
| Categorical artifact | iam-network-smoke /15037623773 |
| Retained report | [ci/green/report.json](ci/green/report.json), SHA256 f3fccf08f0a597607216a99d00f19f5c300329d07da00f8bac76b42df4eaa2ec |

Both declared and recreated phases report exactly one actual kernel default route matching the dedicated egress gateway, exact network membership, DNS/TLS HTTP200 and denial of private HTTP8080 and management9000 from the unshared bridge. Both phases are new container IDs, legacy remains isolated and cleanup passes. All three relevant jobs pass, retaining actual IAM client/admission/logout, restricted-gateway and application/UI/PWA checks. No WordPress source/package changed and its broad matrix was not rerun or relabeled by this infrastructure-only increment. Documentation/evidence successors require their own CI.

At15:32:35UTC the [independent credential-free public observation](public-before-rollout.json) still finds deployed API ready200/d875712, web/discovery/JWKS200 with two keys, and root/admin/master/metrics/health404. These nine public checks are not private image inventory, signed-in browser acceptance or a deployment of this change.

## Bounded source fix

Source adds an ordinary Compose-owned iam-egress bridge, attached only to IAM. Backend/iam-edge stay internal, IAM stays off the shared proxy/default networks, and no host port or public IAM domain is added. Source Compose CI enforces the whole service/network matrix. Runtime inspection checks actual isolation/driver and exclusive egress peer count, image pins, private attachments and published-port absence. Local Python infrastructure suite passes63 tests, including missing egress, temporary default/proxy attachments, shared egress and altered network isolation.

The real IAM fixture passes declared topology and forced recreation with one default route through the dedicated bridge, DNS/TLS reachability, exact network membership and denial of private HTTP/management access from an unshared network. Curl shares IAM's namespace; this is network evidence, not signed Java-client delivery. The normal-network control, real IAM readiness and negative legacy topology stay in the test. Existing actual IAM/gateway/API/PWA tests remain in CI. No Docker daemon is available locally; native CI is the runtime authority.

## Earlier temporary-route checkpoint and remaining estate gates

The [estate ledger](../wordpress-estate-2026-11-24/README.md) records operator-supplied Nov25 training site-only logout/quiet re-entry, both shared-logout directions with signed POST200/audits56 and66 before page access, and another Edge browser's surviving session. Customer45/link/customer role/order50402/users39 were preserved. The reported repair attached running IAM to the existing stack default network; it is temporary. The latest operator evidence working tree was uncommitted when reported; its prior inspected head ed84fa9266d83486f227af3c2c4adb6e89a044b1 is not credited with those later tests.

The [network-only staging runbook](../../runbooks/iam-outbound-network-staging.md) preserves current image digests and image-source GIT_SHA d875712ecb41e06d8905046e0f4bc93bb8e9e7a5, recreates only IAM, reloads the unchanged gateway to re-resolve IAM, and requires real signed logout after recreation. The operator has now reported that sequence completed above. It records rollback without deleting data or silently restoring a no-route state. No rollout, secret access, image promotion, WordPress change or live signed-in test has been performed from this Work environment.

Issue59 remains open. Two-WordPress quiet SSO, other-site linking/logout, controlled Join/JIT, privileged linking and trusted emergency recovery/enforced mode remain incomplete. Browser Cloudflare challenges need the owner in the existing Windows Edge profile; they are not solved by this network change. External activation and multisite remain unsupported.
