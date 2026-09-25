# Execution ledger — MVP-0

| Package | State | Evidence / next action |
|---|---|---|
| Source acceptance | COMPLETE | Source Pack DEC-001..008, Aug 7/Aug 30 evidence and native AccessLobby 1/2 checked; no material critical-path conflict. |
| Repo/bootstrap | DRAFT PR | Main bootstrap `966347b`; PR #1 implementation head `da695c1` passed CI run #20. Updated documentation/head `09d33d9` passed CI run #25 (`verify`, `iam-smoke`); check the final head again at merge. Main branch protection remains unverified. Issues #2–#12 track follow-up. |
| IAM/runtime | CODED, CI SMOKED | Keycloak 26.7.4 discovery/JWKS and exact generic-client callback were verified in ephemeral CI; no owned staging IAM runtime. |
| Identity/API | CODED, CI TESTED | Migration 001, mapping concurrency integration and negative JWT checks; real staging IAM smoke pending. |
| Web handoff | BUILT, UNVERIFIED | PKCE, state, nonce, sealed cookie and logout built; real browser smoke pending. |
| Generic consumer | CODED, PARTLY SMOKED | Independent reference consumer and local authorization-deny test exist. Live human E2E in staging remains issue #12. No named peer is required for the product deployment. |
| POII | DEFERRED ADOPTION | Implementation unavailable; integration resumes when its repo/environment is accessible. Never map by email. |
| Staging host | PREPARED, NOT DEPLOYED | Owner installed Docker/Dokploy, created a private-tunnel admin account, verified DNS for three staging names and created an `AccessLobby / staging` project with a Compose service shell. Git source Save, TLS, protected secrets, realm import and routes need verification/configuration. See `LIVE-ENVIRONMENT-FACTS.md` and issue #7. |
| Backups | CONTROL PLANE CONFIGURED | Owner screenshots show OVHcloud versioning and SSE-OMK, an uploaded Dokploy backup object, active daily 03:00 UTC control-plane backup and retention 30. Bucket access policy, first scheduled run and isolated restore remain unverified. Keycloak and identity DB backups follow deployment. |
| Production | NOT DEPLOYED | Separate issuer/domain, environment, backup/restore, monitoring and owner release decision pending. |
| DonLoft | DEFERRED ADOPTION | Implementation unavailable; reuse the same contract when accessible. |

Decision states: SOURCE-CONFIRMED boundaries in constitution; MVP-PROVISIONAL choices in ADRs; DEFERRED items in MVP spec; OWNER-BLOCKED facts in live environment file. Exact SHA, CI, image digests and deployment evidence must be appended as they occur. **Production MVP is not complete.**
