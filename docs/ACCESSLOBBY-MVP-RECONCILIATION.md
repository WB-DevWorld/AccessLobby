# AccessLobby MVP reconciliation — 2026-09-29 UTC

## Conclusion and evidence boundary

AccessLobby has a working controlled staging identity platform, with organization workflows implemented beyond the original narrow MVP. Its first production MVP is **PARTIAL**. First-party application onboarding is implemented, CI-qualified and published, but its pinned candidate has not been observed deployed or accepted. No production deployment or production acceptance is evidenced.

This audit began at main `09e5b33222458071757b969c351d752600a047e1`; hygiene PR [#45](https://github.com/WB-DevWorld/AccessLobby/pull/45) subsequently merged as `05fa130b17d5488f5282cb75e6e23a999f2ff7d4`. The onboarding feature source remains `aadfad381b3f43d8c93cce1ba84805aead4efb52` ([#42](https://github.com/WB-DevWorld/AccessLobby/pull/42)); documentation changes do not change that manifest's source.

A fresh credential-free public preflight at **2026-09-29 21:56 UTC**, repeated at **23:12 UTC**, passed **23/23 checks** in both runs. The API still reported `936aae12571346920923ed392731611eaa0ecf8a`. Operator acceptance on September 29 belongs to that account-routing revision, not to the onboarding candidate. See [current-state audit](ACCESSLOBBY-CURRENT-STATE-AUDIT.md) for exact evidence, backlog and next steps.

## Authority and source reconstruction

Product intent follows explicit owner instructions and later corrections, accepted decisions and contracts, then proposals. Code and CI prove implementation; runtime and operator evidence prove different things. An open issue does not prove missing code; a merge does not prove deployment.

The private sources examined were the September 23 Source Pack (README, confirmed decisions, requirements, conflicts, questions, ownership/actor/integration matrices, timeline, scope/deferred registers, retrieval ledger, manifest and underlying excerpts); transfer-kit decision log, development method, engineering standards, Cursor workflow, master instructions and user knowledge; retrieval prompt; MVP steps; development history; staging history; UI chat and reference images. Native Drive documents **AccessLobby 1** and **AccessLobby 2** were searched directly to check identity, account and realm interpretation. Their metadata matched the historical source period; no later global realm ratification was discovered there.

Important private source anchors, without publishing their content:

| Anchor | Authority and finding |
|---|---|
| Source Pack DEC-001–011, especially 001–009 | Independent branded identity/SSO product; durable human ID; individual before organization; app admission separate from peer resource authorization; API/event integration; replaceable Keycloak baseline. |
| Source Pack CONFLICT-006, Q-001/Q-027 | Global trust-domain topology remains unresolved; an ecosystem name is not itself a ratified realm policy. |
| SRC-0026, August 7 owner roadmap, §§4–13 | Durable identity, first-party/eventual external apps, discoverability/invite access, person-first organizations and distinct domain permissions. Requested analysis does not settle every proposed role or entitlement. |
| Transfer-kit D-008/D-009 | Shared identity/access boundary and individual-first participation; peer business permissions remain local. |
| `AcessLobby MVP Steps.txt`, steps 1–12 | Earliest production sequence, including signup/verification/recovery and named proving peers. |
| Development history, original 24-hour execution instruction, §13 | Securely provisioned pilot humans permitted; self-signup not mandatory for the identity spine; email/recovery conditional on infrastructure, otherwise explicit limitation and follow-up. |
| Development history, owner correction around line 2757 | POII/DonLoft unavailable; AccessLobby must work with any compatible platform. Named-peer availability must not block the platform MVP. |
| Development history, later peer join/link and sign-off instructions; ADR 005 | New and existing peer users; explicit proof of both accounts; user chooses current-app or shared current-browser sign-out. |
| September 29 staging history, owner results around lines 2133 and 2282 | Account/organization and reference-consumer tests reported passing at `936aae1`; grant fixture returned to empty. |
| Same history, latest app-onboarding implementation/handoff | First-party request, DNS proof, private activation and admission implemented; rollout remains operator work. |
| UI chat and images | Owner requested Identity, Apps/Trust and Insights directions including search/analytics. Sample scores, permissions, consent and connected-app data are design illustrations, not live evidence. Canonical broad search/analytics ownership remains unresolved. |

This is a reconstruction of the accessible source universe, not a claim to have retrieved every conversation in the owner's account. Native Drive checks and underlying excerpts were used to resolve material uncertainty rather than treating repeated assistant summaries as authority.

## Original MVP requirement matrix

The earliest steps and the subsequent 24-hour instruction are kept distinct. Status below describes historical authority and subsequent disposition, not present implementation.

| ID | Capability/step | Historical requirement | Source/status | Later changed? |
|---|---|---|---|---|
| O01 | Source acceptance | Accept source decisions, resolve conflicts, freeze the smallest build | MVP steps 1–2; SOURCE-CONFIRMED | Current owner instructions supersede obsolete source expectations. |
| O02 | Repository/control plane | Separate AccessLobby repo; clear ownership, PR review, CI and contracts | Steps 3; working-method kit | No removal; required review enforcement remains a gap. |
| O03 | IAM runtime | Keycloak, isolated staging issuer, TLS, persistent separate IAM database | Steps 4; 24-hour plan | One first-party realm/environment is MVP-PROVISIONAL, not global final topology. |
| O04 | Durable identity | AccessLobby-owned immutable opaque person ID | DEC-003; steps 5 | Unchanged. |
| O05 | Subject mapping | Unique issuer/subject-to-person link; no email identity or implicit linking | Steps 5; identity contract | Unchanged; cross-issuer/pairwise linking remains future work. |
| O06 | API/product boundary | Independent backend/database, authenticated versioned identity, health and audit | Steps 5; DEC-001/005/007 | Expanded with organizations and app registry. |
| O07 | Web/login | Thin independent frontend: sign in, identity/status, logout | Steps 6 | Expanded to Identity Wave, contexts, organizations and app owner surface. |
| O08 | OIDC | Authorization Code + PKCE S256, exact callbacks, state and nonce | Steps 4–7; contract v0.1 | Unchanged. |
| O09 | Discovery/token validation | Exact issuer, discovery/JWKS, signature, audience, expiry and client checks | Steps 7/9 | Registry client admission now supplements transitional allowlist. |
| O10 | Integration Contract v0.1 | Durable person response, token rules, failures, local account linking, local authorization | Step 7 | Membership and first-party app-entry extensions added; no automatic resource grant. |
| O11 | First proving consumer | Initially POII | Step 8 | SUPERSEDED as platform prerequisite by generic independent consumer. Adoption retained separately. |
| O12 | Staging real human | Actual human login; repeat sign-in preserves ID | Steps 4–9 | Controlled provisioning explicitly permitted by 24-hour instruction. |
| O13 | Signup | Account creation was listed in earliest tiny MVP | Step 2 | Controlled pilot provisioning permitted later; public registration remains implemented but not fully accepted. |
| O14 | Email verification | Verify email, avoid duplicate identity | Step 2 | Conditional/deferred for controlled pilot; required before claiming verified public email onboarding. |
| O15 | Password recovery | Recover/reset account access | Step 2 | SMTP-dependent public recovery may be deferred with explicit pilot limitations; pilot recovery procedure must still be proven. |
| O16 | Logout/re-entry | End session and re-enter safely | Steps 6/9 | Later owner chose both current-app and shared current-browser options; all-device/offline guarantees remain separate. |
| O17 | Failure behavior | Invalid/expired/wrong token, bad callback, disabled user deny safely | Step 9; execution acceptance | No removal. Automated coverage does not finish live negative acceptance. |
| O18 | Database migration | Repeatable schema, preserved mapping and restart behavior | Steps 5/9 | Four migrations now exist; new candidate requires live 004 evidence. |
| O19 | CI | Typecheck, tests, builds, security/source checks, merge gates | Steps 3/12 | Expanded PostgreSQL, IAM, theme/container/proxy coverage. |
| O20 | Immutable artifacts | Promote exact qualified images, avoid untracked code in environments | Steps 9/12 | Implemented manifest/publisher; rollout remains controlled operator action. |
| O21 | Monitoring | Health, useful logs, monitoring and incident readiness | Step 9 | Health/log foundations exist; production alerts and observations not qualified. |
| O22 | Backups | Both IAM and identity stores; secure off-host scheduled retention | Step 9 | Manual backups/configuration proved in staging; scheduled execution and full policy scope unverified. |
| O23 | Restore | Restore isolated backups and verify identity/auth; recovery timing | Step 9 | Owner passed database drills; measured RPO/RTO and control-plane recovery remain. |
| O24 | Rollback | Safe image/schema rollback, rehearsed before promotion | Step 9; working-method kit | Runbook/pins exist; rehearsal unverified. |
| O25 | Production promotion | Production real users and independently deployed OIDC consumer | Step 9 and 24-hour production objective | Not replaced by staging or broader feature work. |
| O26 | Second/reusable consumer | DonLoft reuse, safe reversible migration | Steps 10–11 | Named-peer rollout deferred; generic reusable contract proof is the platform gate. |
| O27 | Continuous delivery | Small reviewed vertical slices, staging qualification and exact promotion | Step 12 | CI/publishing present; staging/production acceptance remains explicit, not automatic. |

## Supersessions and effective scope

| Earlier plan | Current effective treatment | Evidence/status |
|---|---|---|
| POII first; DonLoft next as necessary proving applications | Independently deployed compatible consumer proves AccessLobby. POII and DonLoft adoption remain separate later milestones. | Explicit later owner correction; [MVP-0](MVP-0.md). SUPERSEDED prerequisite; adoption DEFERRED. |
| Public signup/email verification/recovery in earliest list | Controlled pilot humans may qualify the first production identity baseline. Do not claim verified signup or self-service recovery without SMTP and end-to-end acceptance. State pilot recovery limitations. | Later 24-hour instruction; feature gates and realm reconciler; [ADR 005](adr/005-peer-join-link-and-logout-choice.md). |
| Thin web only; organizations outside 24-hour path | Flat organizations, invitations, roles and contexts implemented beyond original baseline. Qualify what the selected release ships. | PRs #37–40, owner staging results. ALREADY EXCEEDED MVP in code, partial acceptance. |
| App registry/admission deferred or open | Reviewed first-party registry/admission now implemented; current candidate needs live qualification. External self-service remains closed. | PR #42, migration 004; #44. ALREADY EXCEEDED original MVP in code. |
| Manual environment list for every customer | `authenticated_open` supports active human entry without individual Docker IDs; `grant_required` uses durable per-app grants. Peer still owns local roles/resources. | PR #42; [onboarding](consumer-onboarding.md). New path not yet staging-verified. |
| Ordinary people, organizations or apps might cause realms | Reuse existing environment realm; app creates client. Distinct issuer only for an approved trust domain; environment baseline created once. | [ADR 008](adr/008-realm-boundaries-and-automation.md), planner/provisioner. Global topology still OPEN. |
| Single sign-out action | User chooses current app or connected participating apps in this browser session. | Later owner choice, ADR 005. Offline peers/all devices not promised. |
| Broad search/KYC/risk/billing in old AccessLobby discussions | Keep historical requests visible; ownership ratification gaps remain. Do not make them identity MVP blockers or silently declare every owner request superseded. | Source Pack conflicts; narrower ownership model and later UI requests. |

## Current effective MVP completion gate

The completion gate is **usable production identity infrastructure for a controlled cohort**, not a feature-complete external identity marketplace. Required software, acceptance and operational work are counted separately.

| Classification | Effective requirement |
|---|---|
| REQUIRED FOR MVP | Independent product/repo; review/control plane; isolated IAM; durable human identity; authenticated versioned API; safe code+PKCE web login; controlled provisioning/recovery limits; both sign-out choices/re-entry; generic compatible client registration/linking/conformance; peer-local authorization separation; green CI; exact immutable rollout; actual release acceptance; monitoring; scheduled protected backups; restore/recovery timing; safe rollback; production security/configuration, Go/No-Go and real production use. |
| ALREADY EXCEEDED MVP | Flat organizations/roles/invitations/contexts and read-only peer projection; first-party application request/DNS/private activation/entry grants. These are beyond the original narrow baseline. The chosen production candidate must still qualify these shipped changes. |
| DEFERRED AFTER MVP | Identity merge/closure/contact lifecycle; verified email signup/recovery if production remains controlled pilot; passkeys/MFA/device management; hierarchy/delegation/legal authority; external pairwise consent/scopes; seats/bulk entitlements; non-human actors; federation/SCIM/SAML; offline-peer reconciliation; named-peer migrations. |
| SUPERSEDED | POII/DonLoft availability as prerequisites; realm-per-person/organization/app assumption; Docker person list as a scalable central admission design. |
| OWNER DECISION REQUIRED | External trust/privacy/admission policy, organizational authority/recovery, exceptional trust-domain criteria and unresolved search/verification ownership. Widening public production signup requires a deliberate rollout decision; controlled pilot is already authorized and need not await it. |

The shortest path is to qualify the already-published current first-party candidate, finish remaining core acceptance and operations, then promote. A smaller historical candidate could be a deliberate release decision, but this audit does not silently abandon merged work or require external-app policy before a controlled first-party MVP.

## MVP status matrix

**Y** = capability/control exists or its identified evidence gate is fully demonstrated; **P** = partial; **N** = no qualifying evidence; **—** = not a meaningful automated-test dimension. Designed may be provisional. Staging results here refer to identified earlier revisions; all shipped behavior must be requalified at the selected candidate. Production column is N because no production is evidenced.

| ID / MVP requirement | Current effective requirement | Designed | Implemented | CI | Staging | Production | Status | Remaining work | GitHub issue |
|---|---|---:|---:|---:|---:|---:|---|---|---|
| M01 Source/contract freeze | Accepted independent identity boundary and generic MVP | Y | Y | — | — | N | DONE | Preserve corrections and versioned contract | #11 for future scope |
| M02 Repository control | PR/checks plus required approving review | Y | P | Y | — | N | PARTIAL | Ruleset currently requires zero approvals; enforce review policy | #2 |
| M03 Isolated staging IAM | Issuer/JWKS/gateway restrictions, separate databases | Y | Y | Y | Y | N | DONE | Recheck candidate and production separately under M12/M17 | #7 |
| M04 Durable identity/API | Unique durable mapping, PostgreSQL, disabled-person/restart behavior | Y | Y | Y | P | N | PARTIAL | Exact runtime DB version, suspended-person HTTP denial, restart preservation | #5 |
| M05 Safe web sign-in | Code+PKCE, callback state/nonce, expiry and error handling | Y | Y | Y | P | N | PARTIAL | Live negative callback/credential/expiry acceptance | #6 |
| M06 Pilot lifecycle | Secure controlled humans and demonstrable recovery path/limits | Y | Y | Y | P | N | PARTIAL | Protected recovery drill; qualified signup/email/reset before broader claims | #25/#29 |
| M07 Session/logout | Current-app vs shared-browser sign-out, backchannel/re-entry | Y | Y | Y | P | N | PARTIAL | Both choices, two participating apps, no-link exit, invalid event/outage limits | #6/#25/#12 |
| M08 Generic integration | Arbitrary compatible consumer, exact registration/readback, explicit legacy link | Y | Y | Y | P | N | PARTIAL | Client hash/readback, legacy proof, full conformance; new path in #44 | #12/#44 |
| M09 Local authorization | Login/context does not grant peer resource access | Y | Y | Y | Y | N | DONE | Repeat against candidate; fixture is not a production permission store | #12/#44 |
| M10 CI qualification | PostgreSQL, auth, IAM/theme/container/proxy checks | Y | Y | Y | — | N | DONE | Each release retains its exact green runs | #2 |
| M11 Immutable rollout | Qualified five-image manifest, live digest/migration match | Y | Y | Y | P | N | PARTIAL | Deploy pinned `aadfad3`, inventory all images and migration 004 | #7/#44 |
| M12 Release acceptance | Current candidate core, organizations and app entry work live | Y | Y | P | P | N | PARTIAL | Latest onboarding revision not accepted; full selected-release regression | #44/#6/#12/#27/#29 |
| M13 Monitoring | Health/logs plus actionable operational alerts | Y | P | P | P | N | PARTIAL | Private transient diagnosis, production alert/recovery observation | #7/#10 |
| M14 Scheduled backups | IAM/identity/control plane, scoped access, encrypted off-host retention | Y | P | — | P | N | PARTIAL | Successful schedules, policy scope, actual retention/expiration evidence | #10 |
| M15 Recovery | Isolated IAM/identity restores and operator recovery, measured RPO/RTO | Y | P | — | P | N | PARTIAL | Database drill is owner-PASS; timing and control-plane drill remain | #10 |
| M16 Rollback | Schema-compatible image rollback or rehearsed restoration | Y | P | — | N | N | PARTIAL | Rehearse selected candidate including migration 004 | #10/#44 |
| M17 Production environment/security | Distinct issuer/data/secrets, TLS/ingress/cookies/rate/audit review | Y | P | P | P | N | PARTIAL | Provision/qualify actual production, trusted client IP, security acceptance | #10 |
| M18 Production Go/No-Go/use | Evidence-approved exact promotion, real controlled user and consumer | Y | N | — | — | N | NOT STARTED | Complete preceding gates, record decision, promote and accept live production | #10 |

M03 and M09 are DONE for their bounded existing staging evidence, not production claims. M11/M12 prevent that evidence from qualifying a later untested artifact. M14/M15 explicitly retain the successful owner database backup/restore work.

## Completion measurement

These counts are derived from the numbered sets below. They measure bounded groups, not every assertion or percentage of code.

- **Strict effective MVP gates: 4/18 fully satisfied** (M01, M03, M09, M10); 13 PARTIAL; 1 NOT STARTED.
- **Required software capability groups present and CI-qualified: 8/8** (C01–C08 below). This says the identity spine is built; it excludes operational controls, live negative qualification and production.
- **Current-release staging qualification groups: 4/10 demonstrated on the identified `936aae1` baseline**, 6 incomplete. **0/10 fully qualified at the newer onboarding candidate**. This does not mean earlier acceptance was lost; it means it cannot be relabeled as a newer run.
- **Production readiness groups: 0/8 fully passed in production qualification**; supporting staging work is partial evidence.
- **Production-verified capabilities: 0 claimed.** No arbitrary overall percentage is assigned.

| Required software group | Implemented evidence |
|---|---|
| C01 IAM/credential runtime | Keycloak image, realm configuration/reconciliation, gateway |
| C02 Durable person/link | Migration 001, identity store, concurrent PostgreSQL tests |
| C03 Identity API/failure boundary | Nest API, auth verifier, /v1/me, health, request/audit handling |
| C04 Browser login | Next OIDC callback, state/nonce/PKCE and person/context resolution |
| C05 Controlled provisioning/lifecycle configuration | Protected IAM provisioning and explicit web/realm registration/recovery gates; public verified email is not claimed |
| C06 Sessions/sign-out | Web/peer scope choices, signed backchannel, migration 002 revoked sessions |
| C07 Generic client integration | Contract, exact client renderer/planner, private first-party registry provisioning |
| C08 Independent consumer/local account/resource policy | Separately deployable reference consumer, join/link fixtures, local grant and selected-membership checks |

| Staging group | Baseline evidence/status | Candidate retest |
|---|---|---|
| S01 Issuer, gateway, live/ready | DONE; fresh 23/23 public pass @936aae1 | Required |
| S02 Actual login/repeat stable human ID | DONE; OWNER-REPORTED @936aae1 | Required |
| S03 Personal/organization roles/routing and guards | DONE; OWNER-REPORTED exercised cases @936aae1; remaining lifecycle cases tracked separately | Required |
| S04 Local account/grant denial+positive/context removal | DONE; OWNER-REPORTED @936aae1; no exact HTTP claim from screenshot alone | Required |
| S05 Invalid tokens/callback, suspension/restart/expiry | PARTIAL; automated tests and limited public rejection | Required |
| S06 Both sign-out choices/backchannel/outage | PARTIAL; historic logout/re-entry, full two-app pass open | Required |
| S07 Pilot recovery/public lifecycle claims | PARTIAL; pilot provisioned, registration form accessible, no verified registration/reset completion | Required |
| S08 Arbitrary client readback/legacy linking/full conformance | PARTIAL; existing peer works, complete proof matrix missing | Required |
| S09 Candidate digests/schema/live regression | NOT STARTED for onboarding rollout; older owner inventory passed | Required |
| S10 DNS/activation/open+restricted entry/revocation/suspension | NOT STARTED in live staging; CI qualified | Required |

S03 counts the owner-reported exercised workflow group, not every organization edge case. Invite decline/revoke/expiry and suspended-organization cases remain UNVERIFIED and must appear in the selected-release acceptance record.

| Production group | Full qualifying result |
|---|---|
| P01 Separate production issuer/environment/data/secrets | UNVERIFIED |
| P02 Security/core/release acceptance and ingress trust | UNVERIFIED |
| P03 Scheduled scoped protected backups/retention | UNVERIFIED; staging manual and configuration evidence exists |
| P04 Isolated recovery with measured RPO/RTO/control plane | UNVERIFIED; owner staging database drills passed |
| P05 Safe selected-release schema/image rollback rehearsal | UNVERIFIED |
| P06 Monitoring/alerts/operator response | UNVERIFIED; health/logs exist |
| P07 Exact approved manifest and recorded Go/No-Go | UNVERIFIED |
| P08 Production controlled human + separate consumer acceptance | UNVERIFIED |

## Original execution sequence mapped to current reality

The earliest 12-step file combined production qualification/promotion and then named two peers. The following normalized sequence preserves those original objectives while exposing their later generic substitutions.

| Step | Original intent | What happened instead/current status | Evidence | Remaining requirement |
|---|---|---|---|---|
| 1 Source acceptance | Retrieve and accept decisions | DONE; Source Pack accepted, direct sources and later corrections reconciled | SOURCE-OF-TRUTH, constitution, this audit | Keep ambiguity/proposals separate |
| 2 MVP freeze | Tiny production slice; initially signup/email/reset listed | DONE definition; controlled pilot and generic consumer corrected scope | MVP-0, 24-hour instruction and owner correction | Do not equate staging with production |
| 3 Repo/control plane | Reviewed independently owned repo/CI | PARTIAL; checks/PR rules exist, approvals zero | Live ruleset 23998346; CI; PR #45 rule | #2 review enforcement |
| 4 Staging IAM | Isolated Keycloak/Postgres/TLS | DONE baseline staging; separately monitored runtime | Public issuer/JWKS/restrictions and owner inventory | Selected candidate repeat; production separate |
| 5 Identity/API | Durable human/map/versioned API | PARTIAL qualification; implemented and CI-tested | Migration001, PostgreSQL tests, stable owner IDs | Suspension/restart/runtime DB acceptance |
| 6 Thin web | Login, status, logout | PARTIAL qualification; much wider account/org/UI exists | Web code; owner signed-in baseline | Both sign-out/negative/browser gates |
| 7 Integration Contract | Reusable generic identity/auth boundary | DONE design/implementation; acceptance partial | v0.1 and extensions, consumer tests | Complete full independent conformance |
| 8 Proving consumer | POII first | Generic separate reference peer implemented and exercised | Owner local account, grant/denial tests | Legacy link and new registry live proof; POII separately deferred |
| 9 Production qualification | Security, backup, restore, rollback, monitoring | PARTIAL; manual database recovery passed, ops gaps remain | #10, recovery/security runbooks | Schedules, RPO/RTO, rollback, alerts and release acceptance |
| 10 Production promotion | Real production human/client | NOT STARTED/evidenced; staging expanded first | No production runtime/Go-No-Go found | Qualified exact release into isolated production |
| 11 Second/reusable consumer | DonLoft and reversible migration | Reusable generic contract path present; named adoption DEFERRED | Onboarding/renderer/reference peer; #8/#9 | Real peer availability and bounded migration acceptance |
| 12 Delivery train | Reviewed small reversible release slices | PARTIAL; CI→immutable publish works, deployment operator-controlled | Workflows/manifests/PR train | Explicit staging acceptance and safe production promotion |

The plan is still recognizable through its identity spine and delivery controls, but product breadth advanced before the original production milestone.

## What works and what does not

A controlled person can sign in to staging, keep one stable AccessLobby ID, use a personal account view, create or join flat organizations, switch context and participate as owner/admin/member. Tested owner workflows include invitations, membership guards and transfers. A separate reference app can resolve the same human, create its own local account and independently allow or deny a resource; removing selected organization membership blocks that context without changing the human ID.

In current main, an app owner can request a first-party app and prove its callback hostname, and a protected operator can provision/read back its client. Open admission avoids per-person Docker lists; restricted entry has durable per-app grants. **This new path is not yet demonstrated running in staging.** Activation is reviewed/private, not fully automatic external self-service.

Public signup verification/reset, full two-app logout, comprehensive live failure/browser qualification, scheduled backup proof, measured recovery/rollback, monitored production and actual POII/DonLoft adoption remain incomplete or unverified. See the [ordered critical path](ACCESSLOBBY-CURRENT-STATE-AUDIT.md#next-work-critical-path).
