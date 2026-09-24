# Execution ledger — MVP-0

| Package | State | Evidence / next action |
|---|---|---|
| Source acceptance | COMPLETE | Source Pack DEC-001..008, raw Aug 7/Aug 30, native AccessLobby 1/2 checked; no material critical-path conflict. |
| Repo/bootstrap | DRAFT PR | Main bootstrap `966347b`; PR #1 head `247de927` passed CI run #9. Branch protection unverified. Issues #2–#12 track bounded follow-up. |
| IAM/runtime | CODED, CI SMOKED | Keycloak 26.7.4 discovery/JWKS and generic registered client exact callback verified in ephemeral CI; no owned staging runtime. Docker unavailable in scratch. |
| Identity/API | CODED, CI TESTED | Migration 001, mapping concurrency integration and negative JWT checks; real IAM smoke pending. |
| Web handoff | BUILT, UNVERIFIED | Code + PKCE, state, nonce, sealed cookie, logout; browser smoke pending. |
| Generic consumer | CODED, PARTLY SMOKED | Client renderer/onboarding, independent reference consumer, local authorization deny test and unauthenticated HTTP smoke. Live human E2E in staging remains issue #12. No named peer required for AccessLobby product deployment. |
| POII | DEFERRED ADOPTION | Implementation unavailable; integration resumes when its repo/environment is accessible. Never map by email. |
| Staging/production | BLOCKED ON INFRA | Domain, proxy, secrets, compute, backup destination unknown. |
| DonLoft | DEFERRED ADOPTION | Implementation unavailable; reuse the same contract when accessible. |

Decision states: SOURCE-CONFIRMED boundaries in constitution; MVP-PROVISIONAL choices in ADRs; DEFERRED items in MVP spec; OWNER-BLOCKED facts in live environment file. Exact SHA, PRs, CI runs, image digests and deployment evidence must be appended as they occur. **Production MVP is not complete.**
