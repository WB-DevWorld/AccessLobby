# AccessLobby current-state audit — 2026-09-29 UTC

## Current conclusion

**Working controlled staging platform; first production MVP incomplete.** Organizations and peer context projection have advanced beyond the original MVP. First-party application onboarding is **REPO-VERIFIED + CI-VERIFIED + published**, but **not staging-verified**. No production or named-peer adoption is claimed.

This report is the sanitized baseline from the owner-authorized reconciliation. Historical ledger entries retain their dates; the current assessment here supersedes their obsolete status claims. Product authority is reconstructed in [MVP reconciliation](ACCESSLOBBY-MVP-RECONCILIATION.md); the broader design is mapped in [roadmap status](ACCESSLOBBY-BROADER-ROADMAP-STATUS.md).

| Truth plane | Exact reference and finding |
|---|---|
| Audit starting main | `09e5b33222458071757b969c351d752600a047e1`, PR #43 |
| Hygiene merge | `05fa130b17d5488f5282cb75e6e23a999f2ff7d4`, [PR #45](https://github.com/WB-DevWorld/AccessLobby/pull/45); documentation only |
| Feature candidate | `aadfad381b3f43d8c93cce1ba84805aead4efb52`, [PR #42](https://github.com/WB-DevWorld/AccessLobby/pull/42) |
| Candidate manifest | [five-image onboarding manifest](../infra/releases/staging-2026-09-29-app-onboarding.json); handoff [PR #43](https://github.com/WB-DevWorld/AccessLobby/pull/43) |
| Observed public API | `936aae12571346920923ed392731611eaa0ecf8a`, live and ready, reconfirmed 23:12 UTC |
| Accepted staging baseline | [account-routing manifest](../infra/releases/staging-2026-09-29-account-routing.json); owner inventory nine services/zero findings at 12:41 UTC |
| Fresh public test | 23/23 credential-free checks PASS at 21:56 UTC and on the resumed 23:12 UTC run; five successful consumer-home samples in each run |
| Signed-in evidence | OWNER-REPORTED September 29 results at account-routing baseline; raw screenshots not available for reinspection |
| Production | UNVERIFIED; no distinct live production or accepted promotion located |

Public health reports the API's build SHA, not every service's digest. The private owner inventory is a different evidence source. This audit did not access protected Dokploy/IAM/database consoles or invent private runtime observations.

## Evidence register

| ID | Exact source | What it proves / limit |
|---|---|---|
| E01 | [PR #42](https://github.com/WB-DevWorld/AccessLobby/pull/42), merge `aadfad3`; migrations 001–004 and current code | First-party onboarding/admission implementation; not deployment |
| E02 | [main CI 36631057106](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36631057106), [theme 36631057139](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36631057139) at `09e5b33` | Green main qualification. Inspected verify log: 33 Python tests; API 19/19, web 13/13, consumer 13/13, no failures; PostgreSQL 17.11 and migrations through004 |
| E03 | [feature CI 36629974878](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36629974878), [theme 36629974855](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36629974855) at `aadfad3` | Exact feature main qualified; PostgreSQL DNS/readback/registry activation integration plus disposable Keycloak provisioning/retry/mismatch/suspend smoke |
| E04 | [app publisher 36630209514](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36630209514), [IAM publisher 36630147344](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36630147344) | All five immutable candidate images published; manifest records digests. Not deployed |
| E05 | [handoff](runbooks/app-onboarding-staging-handoff-2026-09-29.md), [acceptance](runbooks/app-onboarding-staging-acceptance.md), #44 | Exact current rollout and nine bounded acceptance gates |
| E06 | September 29 private operator conversation, 12:41 inventory /12:42 public pass; owner test statements | OWNER-REPORTED stable IDs, personal/organization workflows and peer-local tests. Categorical results; no per-case signed log or original screenshot reinspection |
| E07 | Fresh read-only preflight 2026-09-29T21:56:17.068381Z using repository script | STAGING-VERIFIED public statuses/issuer/keys/branding/deny paths at older API; no authenticated user or digest claims |
| E08 | [LIVE-ENVIRONMENT-FACTS](../LIVE-ENVIRONMENT-FACTS.md), September 25 owner evidence | IAM/identity manual upload/download/integrity/isolated restore PASS; configured schedules and lifecycle, sampled anonymous403. No scheduled-run/complete ACL/RPO/RTO/rollback proof |
| E09 | Live ruleset 23998346 “Protect main”, inspected September 29 | PR and `verify`/`iam-smoke` required, deletion/non-fast-forward prohibited, no bypass; approving reviews=0, code-owner review=false |
| E10 | [PR #45 CI 36637124988](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36637124988), [theme 36637124962](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36637124962) | Hygiene change green, inspected exact head `235d21b29c12915a9e32b78e20c54c1789a5a5c1`, merged with no conflicts or unresolved review threads |
| E11 | Private Source Pack, transfer kit, histories and native AccessLobby 1/2 | SOURCE-CONFIRMED intent where explicitly accepted; older implementation reports subordinate to repository/runtime |
| E12 | Current security/recovery/deployment docs and workflows | Operational designs and controls exist. Runbooks and green builds do not prove actual recovery/promotion |
| E13 | [main CI 36637397576](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36637397576), [theme 36637397583](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36637397583) at `05fa130` | Resumed audit independently confirmed successful current-main checks and both publishers (36637603722/36637567710). The handoff still selects the pinned `aadfad3` artifacts; publishing newer documentation revisions does not deploy them |
| E14 | Resumed read-only public preflight 2026-09-29T23:12:27.695245Z | 23/23 PASS, API live/ready `936aae1`, exact issuer, two signing keys, restricted IAM paths, branded forms and healthy reference consumer. No authenticated, private-digest or production claim |

Automated test totals refer to those suites, not the total number of browser assertions. Theme screenshots and isolated Chromium checks are CI evidence, not live signed-in acceptance. The main09e5 publishers also passed (36631267052/36631266518); they do not invalidate the handoff's deliberately pinned feature-source images.

## Live implementation inventory

| Area | Current main implementation | Qualification and material limits |
|---|---|---|
| Human identity | Opaque UUID person, active/suspended; issuer+subject unique link; advisory/transaction lock; no email merge | PostgreSQL concurrent eight-call mapping tested; stable IDs OWNER-REPORTED. Runtime restart/suspended-person HTTP gate remains #5 |
| Authentication | Keycloak; exact discovery/JWKS; RS256 issuer/audience/azp/expiry; code+PKCE/state/nonce | Crypto negatives CI; public issuer, two keys/restrictions PASS; full live failures not done |
| Web/session | Next.js; resolve identity+contexts before local cookie; personal-only account landing, org/invite chooser; fresh-human sign-in | One-hour encrypted HttpOnly Secure SameSite=Lax cookie, no refresh. Switching human is separate from context choice |
| Logout | POST origin/scope validation; current app clears local state; shared issuer logout; signed backchannel and durable API SID revocation | Both choices implemented and CI-qualified, complete two-app live propagation/limits unverified |
| Nest API | /v1/me, contexts, organization/invitation/membership routes, app request/visibility/proof/grants/entry; health and request IDs | Management routes first-party web only; readiness primarily DB, not a full identity/consumer E2E check |
| Organizations | Flat self-asserted org; owner/admin/member; existing-person ID invites7days; accept/decline/revoke/expiry; role/remove/leave; last active owner guard | Owner creation/accept/roles/outsider/last-owner/multi-org/transfer/removal tests reported. Decline/revoke/expiry and suspended org not independently accepted |
| Peer projection | Self-only active memberships; consumer context selection/recheck; local policy remains separate | Selected-membership removal owner-PASS. Not delegation or organization authentication |
| Reference consumer | Own local account ID, explicit join and legacy proof/link fixture; local resource grant; logout choices | In-memory sessions/links lost on recreation; sample fixture not production persistence/adoption |
| Application registry | Migration004, request owner, visibility independent of admission, exact same-origin HTTPS URLs, DNS challenge/proof, requested/active/suspended state | Code+CI only for new path; pending request cap10; no public activation |
| Private provisioning | Plan or reviewed first-party activation; live DNS recheck, scoped private IAM token, exact create/readback/retry/mismatch denial; no realm creation | Disposable IAM + PostgreSQL integration CI qualified. Protected live staging operation not run |
| App entry | Verified azp selects app; active human; authenticated_open or current per-person grant; expiry/revoke; audit events | No Docker customer list required for open admission. Organization seats/entitlements/delegated admin not implemented |
| Suspension | Registry denial committed before IAM disable/readback; bounded retry with same reference | CI-tested fail-closed; unchecked peer sessions not magically ended |
| UI | Identity/account/recovery surface, contexts/orgs/apps; Copy ID; light/dark styling; branded Keycloak login/register/error/logout layouts | Owner Copy ID/login/roles accepted baseline; full six-viewport overflow/focus/touch/authenticated route matrix incomplete |
| Delivery | PR/CI, five image publishers, digest manifests; Docker/Dokploy; IAM gateway, Cloudflare-routed public staging; separate IAM/identity DB | Controlled operator rollout; no automatic staging deploy. Public origin does not expose private IAM admin |
| Operations | Health/log foundations; configured encrypted/versioned off-host backups; recovery/rollback/security runbooks | Owner manual database restores passed. Scheduling/privacy-policy completeness, measured recovery, rollback, alerting and production remain partial |

## Staging acceptance reconciliation

All September 29 signed-in rows below are **OWNER-REPORTED**. The retrieved conversation contains screenshot references and prior assistant review, but original runtime screenshots were unavailable for reinspection here. Do not upgrade this to agent-operated browser verification.

| Demonstration | Revision/evidence | Current status | Repeat after candidate rollout? |
|---|---|---|---|
| Nine-service running digest/network inventory | `936aae1` manifest; owner report 12:41 UTC, zero findings | OWNER-REPORTED PASS | Yes, including all five images |
| Public health/issuer, two JWKS keys/gateway404 restrictions | Owner12:42 and agent21:56,23/23; `936aae1` | STAGING-VERIFIED public PASS | Yes |
| Branded login and registration form | Fresh public200, exact redirect rejection400 | STAGING-VERIFIED form only | Yes; form is not account creation |
| Real login, repeat login, stable Copy ID | `936aae1`, owner “all Copy ID” and unchanged-ID statements | OWNER-REPORTED PASS | Yes |
| Personal account vs org/invitation routing | Owner signed-in examples at baseline | OWNER-REPORTED PASS | Yes |
| Organization creation/invite accept/owner-admin-member | Owner categorical exercised tests | OWNER-REPORTED PASS | Yes |
| Outsider denial/last-owner guard | Owner exercised denial/guard | OWNER-REPORTED PASS; exact HTTP not inferred from screenshots | Yes |
| Two orgs/different roles/context and same human ID | Owner next pass “IDs stayed same … all tests passed” | OWNER-REPORTED PASS; lacks per-case timestamp | Yes |
| Reference local account, local deny and positive grant | Same baseline; positive grant both contexts; fixture restored empty | OWNER-REPORTED PASS; person-wide local grant is expected sample behavior | Yes |
| Remove selected membership; personal still works | Owner reported all guided follow-up cases passing | OWNER-REPORTED PASS, bounded categorical evidence | Yes |
| Transfer owner/former owner exit/new last-owner guard | Same guided follow-up statement | OWNER-REPORTED PASS, bounded categorical evidence | Yes |
| Invite decline/revoke/expiry; suspended organization/person | No complete signed-in per-case proof located | UNVERIFIED; CI coverage exists | Required |
| Existing legacy account explicit link | Demo and CI exist; no complete latest operator proof | UNVERIFIED live | Required |
| Actual new registration/email/reset | Registration form renders; no completed verified lifecycle proof | UNVERIFIED | Required before corresponding public claims |
| Both logout choices/two-app backchannel/expiry/failure | Earlier logout/re-entry report, code+CI | PARTIAL live acceptance | Required |
| Six viewport overflow/focus/touch/light/dark on signed-in routes | Existing preview screenshots and CI auth theme | PARTIAL; not explicit complete live assertions | Required #27/#29 |
| Onboarding five images/migration004/runtime | Main candidate published; public API still older | UNVERIFIED deployed | Required #44 |
| Live DNS/first-party activation/readback | Disposable CI only | UNVERIFIED staging | Required #44 |
| Open/restricted entry, grant expiry/revoke, permission independence | New tests CI only | UNVERIFIED staging | Required #44 |
| New-app suspension/outage/logout/backchannel retry | CI only | UNVERIFIED staging | Required #44 |

Earlier consumer home502/timeouts, old health404s and one registration transient occurred at historical checkpoints. Fresh home/health tests pass. This does not prove the private cause has been corrected; #7 retains a bounded log/monitoring investigation. Do not perpetuate “health404 currently” as status.

## GitHub hygiene performed before status calculation

Initial **0 open PRs, 14 open issues** were independently queried. Every open issue's full body/comments/acceptance criteria was inspected, with linked merges, current code/tests/CI and applicable runtime evidence. No initial open PR existed to merge or close.

| PR | Action taken | Why |
|---|---|---|
| Initial live backlog | None; zero open | No obsolete/qualified outstanding PR to act on |
| #45 | Created, checks passed, exact diff/reviews/threads inspected, squash merged | Small permanent issue-disposition rule and acceptance ledger; no protection bypass |
| Current audit documentation PR | Branch→PR→CI→merge required | Sanitized current baseline and stale-doc corrections only; its final merge records provenance in GitHub |

| Issue closed | Classification/reason | Evidence and successor |
|---|---|---|
| [#16](https://github.com/WB-DevWorld/AccessLobby/issues/16) | CLOSE — SUPERSEDED; historical giant Wave1 implementation assignment | Foundation/refinement and identity clarity merges; remaining explicit browser assertions moved to #27, live auth #6, lifecycle #25, branding #29 |
| [#19](https://github.com/WB-DevWorld/AccessLobby/issues/19) | CLOSE — SUPERSEDED; obsolete Cursor refinement assignment | Same bounded current successors; closure does not claim every historical acceptance test passed |

Both were closed with `not_planned` supersession reason and explanatory evidence, not marked fully completed.

| Issue updated and kept open | Completed/current evidence | Exact remaining gate |
|---|---|---|
| [#2](https://github.com/WB-DevWorld/AccessLobby/issues/2) | Bootstrap, CODEOWNERS, PR/check rules; hygiene rule | Required approving review count currently0; enforce and demonstrate intended review protection |
| [#5](https://github.com/WB-DevWorld/AccessLobby/issues/5) | Mapping/migrations001–004 and crypto/concurrency PostgreSQL CI; stable live owner IDs | Runtime PostgreSQL version, suspended-person HTTP denial, restart/mapping preservation on candidate |
| [#6](https://github.com/WB-DevWorld/AccessLobby/issues/6) | Implemented safe sign-in/callback/logout; baseline real login/repeat | Live failed credentials, state/nonce/PKCE tamper, expiry, both logout and participating-app propagation |
| [#7](https://github.com/WB-DevWorld/AccessLobby/issues/7) | Initial staging and immutable flow achieved; current public23/23 | Current rollout/inventory/client hash, bounded private transient diagnosis, #44 and #12 acceptance; no false “staging absent” |
| [#10](https://github.com/WB-DevWorld/AccessLobby/issues/10) | Manual IAM/identity backup/download/isolated restore PASS; schedule/retention config and privacy sampling | Actual scheduled runs/full scoped policy/retention; control-plane restore/RPO/RTO; rollback/alerts/security; production environment/Go-No-Go |
| [#12](https://github.com/WB-DevWorld/AccessLobby/issues/12) | Reference local account, deny/positive grant/context removal owner-PASS | Legacy-link, lifecycle if claimed, both logout, full negative matrix/readback/hash/current digests/reliability; #44 new admission |
| [#25](https://github.com/WB-DevWorld/AccessLobby/issues/25) | Friendly lifecycle/no-link options and realm feature gates; local account creation owner-PASS | No-link shared exit, both logout, enabled/disabled promise and responsive assertions; public lifecycle acceptance before claims |
| [#27](https://github.com/WB-DevWorld/AccessLobby/issues/27) | Identity clarity/Copy ID and reference alignment implementation; owner Copy ID PASS | Consolidated six-viewport explicit overflow/focus/touch/theme/authenticated-route checks |
| [#29](https://github.com/WB-DevWorld/AccessLobby/issues/29) | Branded IAM/theme/reconcile CI and actual public forms + owner login | Actual claimed registration, invalid credential validation, both logout/branded confirmation, six-viewport assertions |
| [#44](https://github.com/WB-DevWorld/AccessLobby/issues/44) | Newly created bounded acceptance issue; feature fully merged/CI/published | Nine exact current onboarding rollout/admission/failure gates; stays open until live evidence |

Bodies of #2/#7/#11 were refreshed where obsolete descriptions materially misled; all retained initial issues received current evidence/disposition comments. #44 is new, not an overlooked original issue.

| Issue intentionally deferred | Dependency/reason |
|---|---|
| [#8](https://github.com/WB-DevWorld/AccessLobby/issues/8) POII | Implementation repository/integration unavailable; no platform MVP dependency |
| [#9](https://github.com/WB-DevWorld/AccessLobby/issues/9) DonLoft | Same; files/ACL stay DonLoft-owned |
| [#11](https://github.com/WB-DevWorld/AccessLobby/issues/11) Post-MVP | Updated umbrella: organizations/first-party registry foundations now built; broader lifecycle/privacy/actors/federation remain intentionally outstanding |

Result: **2 issues closed as superseded; 12 original issues updated; 1 bounded issue created; 13 open issues.** None was closed simply for a merge. Partial/umbrella production issues correctly remain open.

The [PR template](../.github/pull_request_template.md) and [AGENTS](../AGENTS.md) now require **Closes/Fixes/Resolves** for fully satisfied DoD, **Relates to** for partial work with remaining gate, or justified **No issue**. After every merge, inspect each linked issue, close completed ones with evidence and update partial ones. PR #45 explicitly performed that post-merge check.

## Next-work critical path

Work/AI can prepare sanitized commands, fixtures, plans, code review and evidence reconciliation directly. This audit has no protected operator session or live human credentials; it has not run private deployment, backup or account actions. Owner authorization for this audit does not turn absent access into runtime evidence.

| Work package | Why next / prerequisite | Evidence that closes it | Issue | Work/AI vs operator |
|---|---|---|---|---|
| NEXT-01 Protect review and freeze exact candidate | Repo audit found approvals0; current green/published candidate and previous manifest available | Required review policy demonstrated; chosen `aadfad3` manifest + previous images/schema recovery baseline recorded | #2/#7/#10/#44 | AI audits/prepares; repository administrator sets review policy; operator confirms safe recovery baseline |
| NEXT-02 Roll out pinned onboarding candidate | No new feature work needed; requires NEXT01 safe baseline/private access | Backup, migration004 success, five actual digest matches, source SHA/readiness/issuer/gateway/core 23 checks and pilot login | #44/#7/#5 | AI provides manifest/checks; protected Dokploy/database operator deploys/inventories |
| NEXT-03 Qualify first-party app admission live | Requires004 and candidate; owned disposable HTTPS hostname + review/scoped IAM runner | Request/DNS missing+outage/recheck, exact live activation/readback/retry/mismatch; two humans open entry; restricted deny/grant/expiry/revoke; local role separation; suspension/outage/logout | #44/#12 | AI review/evidence tooling; owner/operator DNS, IAM, fixtures and signed-in exercise |
| NEXT-04 Finish core/account/browser conformance | Run on same candidate, participating clients and controlled humans | Suspended person/restart DB version, failed auth/state/nonce/PKCE/expiry, legacy proof/link, both logout/no-link exit/backchannel; org edge cases; explicit viewport/focus/touch/theme assertions; investigate private transient logs | #5/#6/#12/#25/#27/#29/#7 | AI can automate available test surfaces; operator/human supplies protected/signed-in cases |
| NEXT-05 Prove operational recovery and monitoring | Candidate/schema fixed; can prepare in parallel with NEXT03/04 after safe baseline | Successful scheduled backups + scope/retention, isolated IAM/identity/control-plane restore with RPO/RTO, compatible rollback drill, alert/response observation, no secrets in evidence | #10 | AI plans/checks; protected infrastructure operator executes |
| NEXT-06 Qualify distinct production and Go/No-Go | Core/selected-release acceptance and NEXT05 pass | Separate issuer/data/secrets/DNS/TLS, reviewed trusted client IP/cookie/brute-force/admin boundaries, production monitoring/backups, exact manifest and approved decision | #10 | AI reviews evidence; owner/administrator creates resources and accepts Go/No-Go |
| NEXT-07 Promote and verify real controlled use | Recorded Go decision for exact images | Actual production inventory, human stable ID/login/re-entry/logout, independent consumer local-denial and integration acceptance, monitoring/recovery handoff | #10 | Operator promotes; human/operator runs acceptance; AI reconciles outcomes/issues |

Registration/email/recovery should be accepted before opening or advertising those paths. A controlled production pilot may use the already-authorized provisioning model with a proven protected recovery procedure; external policy and named peers must not delay it. Operational recovery is a prerequisite to promotion and a safe migration baseline, not a feature to add after production.

## Retrieval/reconciliation ledger

These are distinct objectives performed in this audit. The Source Pack's historical 80 passes are **not** counted. Initial issue/PR evidence was gathered to reconcile GitHub before calculating project status. Subsequent intent/runtime passes built this report.

| Pass | Distinct objective | Evidence examined / conclusion |
|---|---|---|
| R01 | Query live head | Main09e5, not assumed handoff |
| R02 | Exhaust current open PRs | Live list empty; no uninspected PR |
| R03 | Inspect all14 open issue bodies/comments/DoD | Full current records and linked work; titles alone not used |
| R04 | Correlate recent merged PRs | #26–43 and predecessor work; complete vs partial issue linkage |
| R05 | Check review/control-plane truth | Live ruleset/CODEOWNERS/checks; zero required approvals |
| R06 | Identity/API issue qualification | #5, migrations and PostgreSQL/token tests; partial live gates |
| R07 | Web/session/lifecycle issue qualification | #6/#25/#29, code+CI+operator acceptance limits |
| R08 | UI issue overlap/supersession | #16/#19/#27; preserve unrun assertions in current successors |
| R09 | Staging/consumer issue qualification | #7/#12, manifests/public/operator results |
| R10 | Production and peer umbrella disposition | #8/#9/#10/#11, actual deferred/ops gates |
| R11 | Establish permanent closure rule | Existing PR template/AGENTS, PR #45 checks/merge/post-merge |
| R12 | Source universe integrity/coverage | Pack manifest/source index/retrieval register, attachments and native metadata |
| R13 | Original product purpose | Direct SRC-0026 and DEC-001/002/010, independent generic product |
| R14 | Confirmed decisions vs proposals | DEC/REQ/PROP machine registers and accepted source anchors |
| R15 | Conflicts/supersessions | CONFLICT register/timeline/deferred scope; ownership ratification gaps |
| R16 | Earliest MVP steps | Original12-step text, signup/email/reset and named peers retained historically |
| R17 | 24-hour execution correction | Controlled pilot provisioning permitted; production goal retained |
| R18 | Later generic-platform correction | Owner unavailable-POII/DonLoft instruction; no named-peer prerequisite |
| R19 | Durable identity and contact independence | Native1/2 and pack identity/data analysis, current store/unique mapping |
| R20 | AccessLobby vs Keycloak ownership | Transfer D-008/D-009, constitution, IAM/runtime/database boundary |
| R21 | OIDC reusable integration | Contract/renderer/client tests, exact issuer/callback/API semantics |
| R22 | Realm/trust-domain policy | Native historical excerpts, ADR002/008, nonmutating planner/client provisioner |
| R23 | Login/session/logout | Callback/session/backchannel/SID code, ADR005 and tests |
| R24 | Lifecycle/recovery expectations | Earliest vs pilot freeze, flags/reconciler, SMTP/owner proof gaps |
| R25 | Personal context and human switching | Current landing/context code and owner baseline evidence |
| R26 | Organizations/memberships/invites | Migration003, integration tests, role/last-owner/removal lifecycle |
| R27 | Account classes/authority/routing | Catalogue and architecture audit vs source actor/capability matrices |
| R28 | Registry/visibility/admission | Migration004, API/UI, authenticated_open/grant_required independence |
| R29 | Domain proof/client automation | DNS challenge, private plan/activation/readback/mismatch/retry tests |
| R30 | First-party vs external publishers | External decision proposal and deliberately closed activation |
| R31 | Pairwise privacy/claims/consent | Native/source expectations vs universal person ID/token-sub lookup risk |
| R32 | Entry grants vs domain resource rights | APIentry vs peer local policy and selected membership checks |
| R33 | Non-human/delegated actors | Pack actor model, native human/personas, no dedicated credential schema |
| R34 | POII/DonLoft/WordPress/POS adoption | Ecosystem matrices and actual consumer code; no named adoption proof |
| R35 | UI reference/Identity Wave | UI chat, images, fixture policy, screenshots/acceptance assertions |
| R36 | CI and exact test evidence | Main verify logs33+19+13+13, migration004, theme and private IAM smoke |
| R37 | Immutable artifacts/release flow | Publish workflows/five-image manifests, no automatic staging deploy |
| R38 | Staging infrastructure/public boundary | Compose networks/services, gateway paths/proxy/Cloudflare evidence |
| R39 | Public runtime re-probe | 23/23 @21:56UTC, actual API936aae1 and current healthy consumer |
| R40 | Recover signed-in operator results | September 29 history, stableIDs/org/local-grant/removal/transfer; revision limits |
| R41 | Backup/schedule/privacy/retention | Owner manual backup/restore and configuration vs unverified schedules/ACLs |
| R42 | Rollback/RPO/RTO/production | Runbooks and missing qualifying operational/promotion evidence |
| R43 | Current onboarding release difference | PR #42/43 and current older runtime; bounded #44 created |
| R44 | Working-method and release authority | Transfer kit method/standards/Cursor/master/user knowledge; no implementation shortcut |
| R45 | Broader capability and scope mapping | Product workstreams, ownership, account taxonomy, deferred/open policy |
| R46 | Completion denominators and shortest path | Numbered18MVP/8software/10staging/8production groups, dependency order |
| R47 | Stale-issue saturation | Re-query current13 open; current evidence/gates on each; superseded16/19 closed |
| R48 | Stale-document saturation | Compare current ledgers/catalogue/onboarding/ADR/UI claims to code/operator facts |
| R49 | Merged-work/status saturation | Organizations/projection/routing/appregistry included, separate code/deploy/test |
| R50 | Older-revision test saturation | Owner936aae1 never reassigned to aadfad3; CI and public probes bounded |
| R51 | Superseded-scope saturation | No POII-first/public-signup dependency resurrection; broad requested scope remains visible with ownership uncertainty |
| R52 | Recover interrupted audit without discarding work | Recovered all three report drafts and 17 existing-document edits; source and evidence copies retained privately |
| R53 | Recheck GitHub after hygiene merge | Main `05fa130`, zero open PRs, all 13 open issue bodies/comments, superseded closures and recent merged PRs; no intervening feature merge |
| R54 | Recheck current control plane and CI | Active ruleset still requires zero approvals; current-main CI/theme and both publishers succeeded; no GitHub releases found |
| R55 | Independently reconfirm public staging | 23/23 at 23:12 UTC, API still `936aae1`; authenticated baseline evidence is not transferred to the onboarding candidate |
| R56 | Verify denominators and document integrity | Recomputed 18 MVP and 50 broader workstream rows; all relative Markdown file targets resolve; diff/source-material boundaries checked |
| R57 | Final source and supersession cross-check | Original 12 steps, controlled-pilot/generic-consumer correction and exact owner staging statements reread; historical expectations preserved, no named-peer or public-signup blocker resurrected |

## Audit limits and closure criterion

Accessible private source packs, source exports, native documents, repository history/current code, all live issues and public staging were reconciled. Protected runtime inventory, signed-in test actions, scheduled backups and production cannot be independently re-run without the operator channel. Their absence is recorded as an evidence gap, not an invented failure or blanket “not built”.

The final documentation change must pass its own CI and be merged normally. Post-merge reconciliation must recheck open PR/issue counts and confirm linked issues retain their actual unpassed gates. Final saturation found and corrected two additional stale surfaces: the old Cursor handoff still referenced closed assignments, and the account-routing runbook still led with its pre-deployment checkpoint. Both now distinguish current evidence from preserved history. All 13 open issue dispositions were re-read; the current manifests/CI feature train and older-revision tests were cross-checked, and no superseded named-peer/public-signup prerequisite was reintroduced. No feature implementation, visibility changes, secret exposure, force push or recovery-branch deletion belongs to this mission.
