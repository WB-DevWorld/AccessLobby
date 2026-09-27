# Execution ledger — MVP-0

| Package | State | Evidence / next action |
|---|---|---|
| Source acceptance | COMPLETE | Source Pack DEC-001..008, Aug 7/Aug 30 evidence and native AccessLobby 1/2 checked; no material critical-path conflict. |
| Repo/bootstrap | NEW IMAGES PUBLISHED; STAGING STILL ON PRIOR SHA | Main `703c9e6489d7ae5ea38d850da50925271160960e` passed CI and guarded publication for four images. Owner-reported Dokploy deployment of earlier `99c9148` pulled three pinned GHCR digests and started all seven services. New images and the independent reference consumer are not yet deployed in staging. |
| IAM/runtime | STAGING SMOKED | Owner-reported realm discovery matched the exact HTTPS issuer and exposed two JWKS keys. Restricted gateway returned 404 for root, admin, master realm, metrics, health and root discovery; forged forwarding headers did not alter issuer or endpoint origins. An unregistered redirect returned 400. |
| Identity/API | STAGING SMOKED | API `/health/live` and `/health/ready` returned 200, version matched `99c9148`; `/v1/me` returned 401 without or with an invalid token. A controlled browser login resolved an active person ID and repeat sign-in returned the same ID. |
| Web handoff | STAGING BROWSER SMOKED | Owner completed sign-in, repeat sign-in and sign-out through the staging browser, including the post-logout landing page. Capture remaining negative flow evidence during the separate consumer run. |
| Generic consumer | SEPARATE IMAGE PUBLISHED | Independent reference consumer and local authorization-deny test exist. Its separate image and Compose service are prepared; live consumer sign-in, linking, local 403 and sign-out propagation remain open. This is not a named peer integration. |
| POII | DEFERRED ADOPTION | Implementation unavailable; integration resumes when its repo/environment is accessible. Never map by email. |
| Staging host | DEPLOYED, SMOKED | Owner-reported Dokploy v0.30.7 Compose preview attached only gateway, API and web to its proxy network; protected secrets and a SHA-checked realm import were saved. HTTPS web, API and issuer routes worked. Separate consumer and rollback drill remain. See `LIVE-ENVIRONMENT-FACTS.md`. |
| Backups | TWO DATABASE RESTORES PASSED | Owner reported successful uploads for Keycloak and identity PostgreSQL archives to OVHcloud S3, downloaded both, validated gzip and completed isolated PostgreSQL restores with matching realm/user and identity row fingerprints (`ISOLATED_RESTORE_PASS`). Control-plane backup upload also exists. First scheduled runs, bucket policy and versioned lifecycle retention remain open. |
| Production | NOT DEPLOYED | Separate issuer/domain, environment, backup/restore, monitoring and owner release decision pending. |
| DonLoft | DEFERRED ADOPTION | Implementation unavailable; reuse the same contract when accessible. |

Decision states: SOURCE-CONFIRMED boundaries in constitution; MVP-PROVISIONAL choices in ADRs; DEFERRED items in MVP spec; OWNER-BLOCKED facts in live environment file. Exact SHA, CI, image digests and deployment evidence must be appended as they occur. **Production MVP is not complete.**

## Peer SSO expansion — review branch (2026-09-27)

Owner decision: every connected peer lets a user start registration there, permits an existing account to be linked after proving both sign-ins, and asks on sign-out whether to end this app's session or the shared browser SSO session. This resolves the product choice in Source Pack Q-008 and advances Q-009/Q-010; [ADR 005](docs/adr/005-peer-join-link-and-logout-choice.md) records the provisional mechanics and limits.

This branch adds `prompt=create` registration entry from AccessLobby and the reference consumer; explicit dual-auth legacy linking in the sample peer with an in-memory local mapping; separate local/shared sign-out controls; verified OIDC backchannel logout in the peer; and durable first-party `sid` revocation through API migration 002. It updates the client renderer and onboarding contract. Local `pnpm typecheck`, `pnpm test`, `pnpm build` and Python renderer tests pass. PR #18 CI run #48 passed PostgreSQL migration/integration tests and IAM smoke; its container startup step caught omitted example modules in the Dockerfile, corrected in a followup commit. Neither staging configuration reconciliation, SMTP/registration email verification, live two-app session propagation, nor a named real peer adapter has been observed in this branch. Existing realm import is create-only. Do not count this branch as deployed or as all-peer adoption.

## Release evidence — 2026-09-27

PR #18 merged as main `703c9e6489d7ae5ea38d850da50925271160960e`. Main CI run `36350999533` and guarded image publisher run `36351102526` succeeded; the exact API, web, gateway and separate consumer digests are recorded in the [staging cutover runbook](docs/runbooks/sso-staging-cutover-2026-09-27.md). The public staging API still reported `99c91488f28a4cf87b90dfdabf8e668fd6b70a3c` at `/health/ready` after image publication. Deployment of this release, Keycloak SMTP/realm reconciliation, reference consumer onboarding and two-app browser acceptance remain open. The Dokploy panel is accessible only through the owner's private local SSH tunnel, unavailable to this agent workspace.
