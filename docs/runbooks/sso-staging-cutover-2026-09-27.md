# SSO staging cutover — 2026-09-27

This is a staging-only operator handoff for merged PR #18. It does not authorize production rollout or imply real peer adoption. The AccessLobby staging panel is reachable only through the owner's private SSH tunnel; the agent cannot operate that local tunnel.

## Qualified artifact set

Main commit: `703c9e6489d7ae5ea38d850da50925271160960e` (PR #18 squash). Main CI run `36350999533` and guarded image publisher run `36351102526` completed successfully for this exact SHA.

| Dokploy variable | Exact image reference |
|---|---|
| `API_IMAGE` | `ghcr.io/wb-devworld/accesslobby-api@sha256:0b34ef835e480f0ef4d830402da8604412caf5d93d54a6ad19acf9523f09194f` |
| `WEB_IMAGE` | `ghcr.io/wb-devworld/accesslobby-web@sha256:b597193fa22ccacf71af377fc9ad73d336adc66f56b86ec56064fa1976cfcb25` |
| `IAM_GATEWAY_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:27c93b60bd58287f52234b5378bbff26ddc9acee0b3f98204d726ed39752b58e` |
| Separate consumer `CONSUMER_IMAGE` | `ghcr.io/wb-devworld/accesslobby-reference-consumer@sha256:e0b94ac0073ff76e22d894eece18bea3ae5859dc982b02ee26acf423989e05bc` |

Set `GIT_SHA=703c9e6489d7ae5ea38d850da50925271160960e`. The API currently returned version `99c91488f28a4cf87b90dfdabf8e668fd6b70a3c` from public `/health/ready` during preparation, so this release has **not** been observed in staging.

## Operator sequence

1. Save the current protected Dokploy environment, current exact image digests, and a realm/client export for rollback. Confirm the two database backups and isolated restore evidence remain available. Do not paste secrets or exports into the repository or chat.
2. In the existing staging Dokploy Compose service, select the current `main` checkout and set only the three `*_IMAGE` variables and `GIT_SHA` above. Leave secrets, issuer, domains and network topology intact. Review Compose preview: only gateway, API and web may join Dokploy's proxy network. Deploy. The `migrate` service must complete migration `002_session_revocation` before the API starts. Check `/health/ready` reports the new full SHA and existing controlled login still works.
3. Through the restricted Keycloak administration path, configure a real staging SMTP sender and test delivery first. Then reconcile the **existing** `accesslobby-first-party` realm: registration allowed, verify email on, password reset on, duplicate emails off. On the existing `accesslobby-web` client, set Backchannel logout URL to `https://api.accesslobby.realjanelove.com/v1/backchannel-logout`, with session ID required and front-channel logout off. The realm template import is create-only; replacing the import file or restarting Keycloak does not make these live changes. Verify a new staging test user receives and completes email verification before broader exposure.
4. Create and verify DNS/TLS for the separate consumer origin (proposed `https://consumer.accesslobby.realjanelove.com`). Render/register the `reference-consumer` client exactly as in [reference-consumer-staging.md](reference-consumer-staging.md), including its `/backchannel-logout` URL. Add its client ID to `ALLOWED_CLIENT_IDS` while preserving `accesslobby-web`. Deploy the consumer image above as a separate Compose service, with `GRANTED_PERSON_IDS` empty. Its old-account fixture is optional and must use a protected staging-only scrypt password setting. Its sessions and account links are in memory and disappear on restart.
5. In a browser, record: new user starts at the consumer, verifies email and returns to that consumer; a controlled old peer account links after both authentication checks and retains its local ID; repeat sign-in resolves the same AccessLobby person; opening the second app uses the shared SSO session; local sign-out ends only the chosen app; all-apps sign-out from **each** app invalidates the other app's session. Check `/private` remains 403 without a local grant. Forged, replayed and wrong-audience logout tokens must not clear sessions. Record outcomes without passwords, tokens, cookies or person IDs.

If the identity API is not ready, the migration fails, email verification cannot complete, or the other app remains usable after all-apps logout, stop the rollout. Restore the previous image digests and the reviewed realm/client settings through the protected operator path. The additive migration can remain; do not delete identity rows or rebuild the realm. The next adoption target is POII, followed by DonLoft, each with its own durable local mappings and tested backchannel handler.
