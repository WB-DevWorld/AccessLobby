# ADR014 — Private IAM with durable outbound delivery

Status: implementation candidate, 2026-11-25. Relates to #59. This changes network configuration, not identity, client admission, logout scope or WordPress policy.

## Observed failure

The estate operator proved training WordPress logout only after attaching the running IAM container to the stack's ordinary default bridge. Before that, Keycloak logged an UnknownHostException for the registered WordPress hostname and the namespace had no default route. Source Compose attaches IAM only to internal backend and iam-edge networks. The successful manual attachment is not preserved by recreation. Existing IAM CI uses docker run on the ordinary default network and does not reproduce this source topology.

## Decision

Add a Compose-owned iam-egress bridge with internal=false. Only IAM joins it. Keep backend and iam-edge internal=true, keep IAM off dokploy-network, publish no host ports, and preserve the restricted gateway as the only public IAM target. Do not use the project default network, an external network or a hard-coded deployment project name as the permanent fix.

The single non-internal attachment supplies the default route. CI checks that the actual IPv4 default gateway matches that bridge after creation and again after forced IAM recreation. This avoids adding a new Compose gw_priority version requirement. Source assertions and the runtime inventory reject missing/extra IAM attachments, another service sharing iam-egress, altered network isolation or a published host port. Runtime inspection also checks that the egress bridge has exactly one container peer; it does not export environment variables or network peer details.

The dedicated bridge permits outbound networking; it is not a hostname allowlist or an outbound firewall. Normal Docker bridge isolation, no published ports and exclusive attachment retain the container ingress boundary. The host and privileged Docker operators remain trusted. Application URL/registration/SSRF policy is unchanged; no arbitrary client activation is introduced. Future outbound filtering can be added as a separate reviewed policy without placing IAM on the shared proxy network.

## Evidence and limits

The CI-only fixture renders the real production Compose with synthetic configuration, boots real Keycloak/PostgreSQL on the legacy internal-only topology, and proves the missing route. It then uses the unmodified declared network topology, requires DNS/TLS reachability from the IAM namespace, verifies private HTTP/management listeners cannot be reached from an unshared bridge, and repeats after recreation. A normal-network HTTPS control distinguishes an unavailable public test target from the regression. Cleanup is limited to a collision-checked random CI project and its disposable volumes. No live project, database, credential or domain is used.

The namespace probe is not a Java HTTP-client or signed logout delivery test. Existing actual IAM/gateway tests remain, and staging must repeat genuine signed peer delivery after the controlled network-only rollout. The operator's prior signed POST200/backchannel events qualify training under the temporary attachment, not the durable source change. Another browser remaining signed in proves browser-session isolation, not a different physical device.

## Deployment and rollback

Use the [network-only staging runbook](../runbooks/iam-outbound-network-staging.md). Preserve all running image digests, image-source GIT_SHA, issuer, clients, volumes and secrets. Record the new Compose source separately. Recreate only IAM from the real Dokploy-generated configuration; reload the existing gateway so its static upstream resolves the recreated IAM. Verify the default route, restricted public paths, readiness and signed logout before accepting the rollout. No server-side build or database restore is required.

Removing the temporary default-network attachment alone restores the original failure. Rollback preserves the prior configuration and data and, if needed, restores the explicitly recorded temporary working attachment while its drift remains open. External publishers, two-WordPress SSO, Join/JIT, privileged linking and emergency recovery keep their own gates.

Official references: Docker [Compose network internal property](https://docs.docker.com/reference/compose-file/networks/#internal), [default gateway and connectivity](https://docs.docker.com/engine/network/), and [bridge isolation and port publishing](https://docs.docker.com/engine/network/drivers/bridge/).
