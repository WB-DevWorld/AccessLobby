# Execution ledger — MVP-0

| Package | State | Evidence / next action |
|---|---|---|
| Source acceptance | COMPLETE | Source Pack DEC-001..008, raw Aug 7/Aug 30, native AccessLobby 1/2 checked; no material critical-path conflict. |
| Repo/bootstrap | DRAFT PR | Main bootstrap `966347b`; PR #1 at `9e44ba7` passed CI run #10; new Dokploy changes await CI qualification. Branch protection unverified. Issues #2–#12 track bounded follow-up. |
| IAM/runtime | CODED, CI SMOKED | Keycloak 26.7.4 discovery/JWKS and generic registered client exact callback verified in ephemeral CI; no owned staging runtime. Docker unavailable in scratch. |
| Identity/API | CODED, CI TESTED | Migration 001, mapping concurrency integration and negative JWT checks; real IAM smoke pending. |
| Web handoff | BUILT, UNVERIFIED | Code + PKCE, state, nonce, sealed cookie, logout; browser smoke pending. |
| Generic consumer | CODED, PARTLY SMOKED | Client renderer/onboarding, independent reference consumer, local authorization deny test and unauthenticated HTTP smoke. Live human E2E in staging remains issue #12. No named peer required for AccessLobby product deployment. |
| POII | DEFERRED ADOPTION | Implementation unavailable; integration resumes when its repo/environment is accessible. Never map by email. |
| Staging | PREPARED, NOT DEPLOYED | Owner-reported Hetzner host, Cloudflare development zone and OVHcloud Roubaix location. `infra/compose.dokploy.yaml` and staging runbook added; new CI check pending. Provider firewall absent, no agent SSH access, DNS/TLS and backup bucket unverified. Issue #7. |\n| Production | NOT DEPLOYED | Separate issuer/domain, environment, backup/restore, monitoring and release approval pending. |
| DonLoft | DEFERRED ADOPTION | Implementation unavailable; reuse the same contract when accessible. |

Decision states: SOURCE-CONFIRMED boundaries in constitution; MVP-PROVISIONAL choices in ADRs; DEFERRED items in MVP spec; OWNER-BLOCKED facts in live environment file. Exact SHA, PRs, CI runs, image digests and deployment evidence must be appended as they occur. **Production MVP is not complete.**
