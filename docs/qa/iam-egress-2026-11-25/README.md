# IAM durable outbound network — 2026-11-25

Status: **REGRESSION REPRODUCED; IMPLEMENTATION QUALIFIED IN CI; STAGING ROLLOUT PENDING**. Relates to #59 and PR68. This record separates actual CI, source changes and operator-reported runtime evidence.

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

## Operator runtime evidence and remaining gate

The [estate ledger](../wordpress-estate-2026-11-24/README.md) records operator-supplied Nov25 training site-only logout/quiet re-entry, both shared-logout directions with signed POST200/audits56 and66 before page access, and another Edge browser's surviving session. Customer45/link/customer role/order50402/users39 were preserved. The reported repair attached running IAM to the existing stack default network; it is temporary. The latest operator evidence working tree was uncommitted when reported; its prior inspected head ed84fa9266d83486f227af3c2c4adb6e89a044b1 is not credited with those later tests.

The [network-only staging runbook](../../runbooks/iam-outbound-network-staging.md) preserves current image digests and image-source GIT_SHA d875712ecb41e06d8905046e0f4bc93bb8e9e7a5, recreates only IAM, reloads the unchanged gateway to re-resolve IAM, and requires real signed logout after recreation. It records rollback without deleting data or silently restoring a no-route state. No rollout, secret access, image promotion, WordPress change or live signed-in test has been performed from this Work environment.

Issue59 remains open. Two-WordPress quiet SSO, other-site linking/logout, controlled Join/JIT, privileged linking and trusted emergency recovery/enforced mode remain incomplete. Browser Cloudflare challenges need the owner in the existing Windows Edge profile; they are not solved by this network change. External activation and multisite remain unsupported.
