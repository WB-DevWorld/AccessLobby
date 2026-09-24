# Execution ledger — MVP-0

| Package | State | Evidence / next action |
|---|---|---|
| Source acceptance | COMPLETE | Source Pack DEC-001..008, raw Aug 7/Aug 30, native AccessLobby 1/2 checked; no material critical-path conflict. |
| Repo/bootstrap | DRAFT PR | Main bootstrap `966347b`; PR #1, CI run #8 passed at `4d65f96`; branch protection unverified. Issues #2–#11 track bounded follow-up. |
| IAM/runtime | CODED, UNVERIFIED | Keycloak 26.7.4 local/production compose and realm template; Docker unavailable here. |
| Identity/API | CODED, CI TESTED | Migration 001, mapping concurrency integration and negative JWT checks; real IAM smoke pending. |
| Web handoff | BUILT, UNVERIFIED | Code + PKCE, state, nonce, sealed cookie, logout; browser smoke pending. |
| Generic consumer | ACTIVE | Complete repeatable onboarding and conformance proof with independent local authorization. No named peer required for AccessLobby product deployment. |
| POII | DEFERRED ADOPTION | Implementation unavailable; integration resumes when its repo/environment is accessible. Never map by email. |
| Staging/production | BLOCKED ON INFRA | Domain, proxy, secrets, compute, backup destination unknown. |
| DonLoft | DEFERRED ADOPTION | Implementation unavailable; reuse the same contract when accessible. |

Decision states: SOURCE-CONFIRMED boundaries in constitution; MVP-PROVISIONAL choices in ADRs; DEFERRED items in MVP spec; OWNER-BLOCKED facts in live environment file. Exact SHA, PRs, CI runs, image digests and deployment evidence must be appended as they occur. **Production MVP is not complete.**
