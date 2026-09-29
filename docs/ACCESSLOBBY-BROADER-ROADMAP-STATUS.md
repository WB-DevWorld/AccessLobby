# AccessLobby broader roadmap status — 2026-09-29 UTC

## Product purpose and current reach

AccessLobby is intended to be an independent branded identity, authentication, SSO, shared organization and broad application-access foundation for first-party and eventually external applications. It owns a durable human identity independent of credentials or contacts. Keycloak supplies replaceable IAM mechanics. Connected applications retain their own users/history, domain roles and resource permissions and can migrate/detach without a cross-database foreign key.

The human identity spine and generic interoperability are implemented. Flat organizations and first-party app onboarding extend beyond the original tiny MVP. The account-routing baseline is running and has owner-reported human/organization tests; the newer onboarding feature is merged/CI/published but not observed deployed. The broader product is not complete, and there is no production acceptance.

Evidence: Source Pack DEC-001–011, direct August 7 SRC-0026, transfer-kit D-008/D-009, native AccessLobby 1/2, current constitution/contracts, PRs37–43, current code/tests and the [current-state evidence register](ACCESSLOBBY-CURRENT-STATE-AUDIT.md#evidence-register). Historical source repetition, an engine's optional capability and UI example data do not prove an accepted live AccessLobby feature.

## Broader capability matrix

Status is for the stated bounded workstream, not blanket production readiness. DONE rows deliberately describe implemented or accepted foundations; their production dimension remains UNVERIFIED. PARTIAL includes implemented/CI-qualified but unaccepted new releases. Priorities distinguish MVP-critical, beyond-original/current-release, post-MVP, later product and unresolved architecture.

| Capability/workstream | Intended final role | Current state | Evidence | Remaining | Priority |
|---|---|---|---|---|---|
| B01 Human identity | One opaque stable person independent of contacts/providers | DONE — bounded human spine | Migration001; concurrent CI; owner stable-ID results | Full lifecycle separately below | MVP-critical |
| B02 Identity links | Verified issuer/subject mappings to one human | PARTIAL | Unique mapping CI; no email merging | Multiple-provider linking, pairwise-safe internal resolution, conflicts/recovery | Post-MVP near-term |
| B03 Contact methods | Verified changeable email/phone independent of human ID | DEFERRED | Keycloak contacts are not an AccessLobby contact lifecycle | Contact ownership, verification, change and notification model | Post-MVP near-term |
| B04 Merge/closure | Audited duplicate resolution, suspension, closure and retention | DEFERRED | Active/suspended states exist; no merge/closure workflow | Proof, reversibility, downstream links and privacy retention | Post-MVP near-term |
| B05 Password authentication | Replaceable IAM credential engine | DONE — bounded engine path | Keycloak and owner existing-user login | Credential security/production configuration still requires qualification | MVP-critical |
| B06 Registration/recovery | User-friendly join and recoverable account | PARTIAL | Feature gates/reconciler/UI/CI; public registration form200 | Actual verified signup/reset delivery and pilot protected recovery drill | MVP-critical for claims; pilot alternative allowed |
| B07 Verified email | Proven mailbox, no duplicate or implicit person linking | PARTIAL | Configuration/engine path; no completed email acceptance | SMTP, verification receipt/callback and contact change safety | Post-MVP near-term unless publicly enabled |
| B08 MFA/passkeys | Strong authentication options | DEFERRED | IAM supports options; no accepted configured product flow here | Policy, enrollment/recovery/step-up and live tests | Post-MVP near-term |
| B09 Sessions/sign-out | Current app vs shared current-browser session | PARTIAL | SID revocation and both choices CI; earlier re-entry report | Two-app live propagation/expiry/no-link/outage matrix | MVP-critical |
| B10 Devices/security center | See devices/sessions/history; revoke appropriately | DEFERRED | Mock images only; no complete product API | Device model, live security events and all-device controls | Later product |
| B11 Step-up | Risk/operation appropriate reauthentication | DEFERRED | No product step-up policy enforced | Acr/amr/scopes, privileged operations and recovery | Later product |
| B12 Revocation | Human/session/membership/app rights cease within stated bounds | PARTIAL | SID DB, membership recheck, registry suspension and grant expiry | Live qualification; offline peers/durable retry/latency guarantees | MVP-critical bounded online path |
| B13 Flat organizations | Shared self-asserted entity, person remains actor | PARTIAL | Migration003; owner creation/multi-org report | Remaining live lifecycle cases and production | Already beyond original MVP |
| B14 Membership roles | Owner/admin/member administer membership | PARTIAL | Code/CI; owner role/last-owner/transfer report | Role policy provisional; full edge acceptance | Already beyond original MVP |
| B15 Invitations | Targeted join/accept/decline/revoke/expiry | PARTIAL | Existing-person ID7-day flow; owner accept report | Decline/revoke/expiry live; verified-contact and pre-registration invites | Post-MVP near-term |
| B16 Acting contexts | Personal/org selection with active membership | PARTIAL | Web + peer projection/recheck; owner context removal PASS | No signed delegation or context-aware domain authority contract | Already beyond original MVP |
| B17 Hierarchy | Departments/branches/subsidiaries/workspaces with scoped authority | OWNER DECISION REQUIRED | Source classes/catalogue, no schema | Canonical owner, cardinalities, inheritance and tenant boundary | Unresolved architecture |
| B18 Controllers/delegated admin | Verified legal/operational authority | OWNER DECISION REQUIRED | Owner/admin are self-asserted membership roles | Authority evidence, expiry, recovery, step-up and audit | Unresolved architecture |
| B19 Organizational recovery | Recover lost owner/controller safely | OWNER DECISION REQUIRED | Last-owner guard is not recovery | Ownership proof, review and disputes | Unresolved architecture |
| B20 Registry/discovery | Logical apps with owner, visibility and lifecycle | PARTIAL | Migration004, /apps, mine/visible endpoints CI | Live #44; full catalogue/search and ownership lifecycle | Already beyond original MVP |
| B21 Admission/grants | Broad app entry distinct from peer permissions | PARTIAL | Open/restricted per-person grants/expiry/revoke CI | Live #44; invitations/seats/delegation/entitlements policy | Already beyond original MVP |
| B22 First-party onboarding | Request, DNS control proof, reviewed client activation/readback | PARTIAL | PR #42; private helper disposable IAM and DB CI | Pinned rollout/live DNS/IAM review/retry/readback | Current release-critical |
| B23 App suspension | Deny in registry then disable exact IAM client | PARTIAL | Private retry/readback CI; failure leaves registry denied | Live IAM outage/suspension and peer unchecked-session limits | Current release-critical |
| B24 Provisioning automation | Scalable queued review/reconciliation lifecycle | DEFERRED | Private operator-triggered helper exists | Queue/background reconciliation, updates/versioning/retirement governance | Post-MVP near-term |
| B25 External publisher activation | Reviewed untrusted third-party onboarding | BLOCKED | Intentionally closed; universal ID/claims contract not safe for this path | Approve and implement external profile before activation | Post-MVP near-term |
| B26 Seats/bulk access | Organization or delegated assignment at customer scale | OWNER DECISION REQUIRED | Current grants are person/application; no seats/bulk | Subject/scope/authority and first restricted-entry model | Unresolved architecture |
| B27 Entitlements/licenses | Access projection from specialist eligibility/commerce owner | DEFERRED | No billing/commerce engine in AccessLobby | Ownership contract, event projection and reconciliation | Later product |
| B28 External identifiers | Pairwise/app-scoped identifier with stable internal person | OWNER DECISION REQUIRED | Decision proposal; current (issuer,sub) lookup would duplicate pairwise human | Sector and migration model, token/userinfo/API isolation | Unresolved architecture |
| B29 External claims/consent | Minimal scopes, purpose/retention and withdrawal | OWNER DECISION REQUIRED | No accepted external consent ledger | Default claims, scope review, consent ownership and revocation | Unresolved architecture |
| B30 Developer/operator UX | App owners request/manage; operators review safely | PARTIAL | First-party /apps UI, private CLI and IAM operator interface | Live qualification; review UI, lifecycle updates, external developer experience | Post-MVP near-term |
| B31 Service/workload/device/AI principals | Distinct non-human credentials and lifecycle | DEFERRED | Source actor matrix; no dedicated schemas/credential flows | Principal taxonomy, rotation, purpose, revocation and audit | Later product |
| B32 On-behalf-of delegation | Original actor/effective subject with bounded lineage | OWNER DECISION REQUIRED | Context display does not authenticate delegation | Authority chain, scope, expiry, token exchange and revocation | Unresolved architecture |
| B33 Pilot realm boundary | One first-party realm per isolated environment; ordinary apps clients | DONE — provisional bounded boundary | ADR002/008, planner and no-create-realm provisioning | Exceptional trust-domain/global policy separately unresolved | MVP-critical |
| B34 DigiVerse/TransVerse trust domains | Federation and issuer isolation where justified | OWNER DECISION REQUIRED | Source conflicts/Q-001/Q-027; no final global topology | Trust-domain criteria and explicit identity/consumer migration | Unresolved architecture |
| B35 Enterprise/private SSO/SAML/SCIM | Standards-based federation and provisioning | DEFERRED | IAM capability alone is not accepted product integration | Connectors, account linking, provisioning and trust qualification | Later product |
| B36 Privacy/connected apps | User sees/revokes meaningful data sharing | DEFERRED | App request/grants are not OAuth consent/data-sharing center | Product consent/history and claim/data boundaries | Post-MVP near-term |
| B37 Verification/ZeroTrust boundary | Consume verification without becoming all KYC/KYB/risk engines | OWNER DECISION REQUIRED | Narrow ownership model plus historical broad owner expectations | Ratify canonical owner, evidence references/consent and UX | Unresolved architecture |
| B38 Identity/account experience | Clear identity, account context and genuine live data | PARTIAL | Wave1/routing/Copy ID; owner signed-in PASS | Remaining browser/lifecycle acceptance and later security/privacy center | MVP-critical current surface |
| B39 Mobile/accessibility/low bandwidth | Usable accessible responsive product | PARTIAL | Responsive styles, preview screenshots, CI auth layouts | Explicit viewport overflow/focus/touch assertions; low-bandwidth qualification | MVP-critical baseline; later depth |
| B40 Search/insights/analytics UX | Source-requested discovery/insight surfaces with correct owner | OWNER DECISION REQUIRED | Later owner UI request plus older AccessLobby/AccessPoint search | Canonical scope/backend owner, actual data and phased acceptance | Unresolved architecture |
| B41 Generic reference consumer | Reusable independently deployed OIDC/link/local-policy proof | PARTIAL | Separate staging peer; account/grant/context owner report; CI | Complete link/logout/conformance; durable production peer state | MVP-critical |
| B42 POII adoption | POII uses generic identity; owns its domain permissions | DEFERRED | No available implemented consumer/adoption evidence; #8 | POII implementation and reversible adapter acceptance | Later ecosystem adoption |
| B43 DonLoft adoption | DonLoft maps identity; owns file/domain ACL | DEFERRED | No implemented adoption evidence; #9 | DonLoft implementation and bounded migration acceptance | Later ecosystem adoption |
| B44 WordPress/WooCommerce/CETECH/POS | Reusable adapters; local roles, guest/transition policy | DEFERRED | Source POS IdentityPort and WordPress policies, no adapters | Adapter code, legacy proof, MFA/admin policy and peer tests | Later ecosystem adoption |
| B45 CI/immutable delivery | Reviewed tests/builds and source-bound five-image publish | DONE — bounded delivery foundation | Green PostgreSQL/IAM/theme/container/proxy workflows; manifests | Review enforcement and actual promotion separate gates | MVP-critical |
| B46 Public isolated staging | Independent HTTPS staging with protected IAM gateway | DONE — bounded deployed baseline | Fresh23/23 public checks @936aae1; owner nine-service inventory | New onboarding deployment is a separate open gate | MVP-critical |
| B47 Monitoring/upgrade process | Alerts, useful logs and controlled qualified upgrades | PARTIAL | Health/request logs and pinned versions/runbooks | Transient diagnosis, alert/response evidence, recurring upgrade procedure | MVP-critical |
| B48 Backups/recovery/rollback | Secure schedules, isolated restores, measurable recovery, rollback | PARTIAL | Owner manual DB restore PASS; configured backup/lifecycle; runbooks | Scheduled/full-scope/RPO-RTO/control-plane/rollback qualification | MVP-critical |
| B49 Production | Distinct production release with real controlled users/consumer | NOT STARTED | Prepared compose is not a deployment; no production accepted | Finish gates and exact Go/No-Go promotion | MVP-critical |
| B50 HA/DR | Failure isolation, capacity, documented recovery objectives | DEFERRED | Single staging baseline; no HA/DR qualified architecture | Production objectives, topology/capacity/failover/DR drills | Later product |

**Reproducible workstream counts (50 rows):** 5 DONE; 19 PARTIAL; 14 DEFERRED; 10 OWNER DECISION REQUIRED; 1 BLOCKED; 1 NOT STARTED. These are scope/disposition counts, not an engineering percentage or production completion score. A larger final workstream such as “identity lifecycle” cannot be called DONE merely because its first table exists. No heuristic percentage is assigned.

## Five independent evidence dimensions

These rows refer to the workstream IDs above. **Y** means its bounded design or implementation is established, or the relevant evidence is present; **P** means only part is established; **N** means no qualifying implementation/evidence was found; **—** means no applicable automated qualification of that future/operator work was identified. CI qualifies the existing implementation, not every future feature in the workstream. Staging Y/P retains the public or OWNER-REPORTED evidence and exact `936aae1` revision limits from the current-state report. New onboarding rows remain N for live acceptance. Production is unverified throughout.

| Workstream | Designed | Implemented | CI-qualified | Staging-verified | Production-verified |
|---|---:|---:|---:|---:|---:|
| B01 Human identity spine | Y | Y | Y | Y | N |
| B02 Identity links | P | P | Y | P | N |
| B03 Contact methods | P | N | — | N | N |
| B04 Merge/closure | P | P | Y | N | N |
| B05 Password engine path | Y | Y | Y | Y | N |
| B06 Registration/recovery | P | P | Y | P | N |
| B07 Verified email | P | P | P | N | N |
| B08 MFA/passkeys | P | N | — | N | N |
| B09 Sessions/sign-out | Y | Y | Y | P | N |
| B10 Devices/security center | P | N | — | N | N |
| B11 Step-up | P | N | — | N | N |
| B12 Revocation | P | P | Y | P | N |
| B13 Flat organizations | P | Y | Y | P | N |
| B14 Membership roles | P | Y | Y | P | N |
| B15 Invitations | P | P | Y | P | N |
| B16 Acting contexts | P | Y | Y | P | N |
| B17 Hierarchy | P | N | — | N | N |
| B18 Controllers/delegated admin | P | N | — | N | N |
| B19 Organizational recovery | P | N | — | N | N |
| B20 Registry/discovery | P | P | Y | N | N |
| B21 Admission/grants | P | P | Y | N | N |
| B22 First-party onboarding | P | Y | Y | N | N |
| B23 App suspension | P | Y | Y | N | N |
| B24 Provisioning automation | P | P | Y | N | N |
| B25 External publisher activation | P | N | — | N | N |
| B26 Seats/bulk access | P | N | — | N | N |
| B27 Entitlements/licenses | P | N | — | N | N |
| B28 External identifiers | P | N | — | N | N |
| B29 External claims/consent | P | N | — | N | N |
| B30 Developer/operator UX | P | P | Y | N | N |
| B31 Non-human principals | P | N | — | N | N |
| B32 On-behalf-of delegation | P | N | — | N | N |
| B33 Pilot realm boundary | P | Y | Y | Y | N |
| B34 DigiVerse/TransVerse trust domains | P | N | — | N | N |
| B35 Enterprise/private SSO/SAML/SCIM | P | N | — | N | N |
| B36 Privacy/connected apps | P | N | — | N | N |
| B37 Verification/ZeroTrust boundary | P | N | — | N | N |
| B38 Identity/account experience | P | Y | Y | P | N |
| B39 Mobile/accessibility/low bandwidth | P | P | P | P | N |
| B40 Search/insights/analytics UX | P | N | — | N | N |
| B41 Generic reference consumer | Y | Y | Y | P | N |
| B42 POII adoption | P | N | — | N | N |
| B43 DonLoft adoption | P | N | — | N | N |
| B44 WordPress/WooCommerce/CETECH/POS | P | N | — | N | N |
| B45 CI/immutable delivery foundation | Y | Y | Y | P | N |
| B46 Public isolated staging baseline | Y | Y | Y | Y | N |
| B47 Monitoring/upgrade process | P | P | P | P | N |
| B48 Backups/recovery/rollback | P | P | — | P | N |
| B49 Production | P | N | — | N | N |
| B50 HA/DR | P | N | — | N | N |

Partial foundations in a DEFERRED workstream do not make its deferred objective complete. For example, suspension exists without merge/closure, and an operator-triggered provisioner exists without a background provisioning lifecycle. A provisional policy can be implemented and tested while its broader design still needs ratification.

## Account/entity architecture reconciliation

A role, context, relationship or peer-local persona is not another global login. Natural people authenticate as themselves; organizations do not own human passwords. Owner/admin/member are provisional AccessLobby membership powers, not legal proof or peer transaction roles.

| Entity/participant | Intended identity/authority | Designed | Implemented | Tested evidence | Disposition/remaining |
|---|---|---|---|---|---|
| Natural person | One durable opaque human ID | SOURCE-CONFIRMED | Yes | CI; owner stable IDs | DONE bounded spine; wider lifecycle deferred |
| Personal context | Same human acting personally | SOURCE-CONFIRMED | Yes | Owner baseline | DONE bounded context; not a separate account record |
| Organization | Shared entity, human remains actor | SOURCE-CONFIRMED; flat policy provisional | Yes | CI + owner create | PARTIAL; self-asserted, not verified legal entity |
| Organization owner | Membership administration and last-owner guard | MVP-PROVISIONAL | Yes | CI + owner guard/transfer | PARTIAL acceptance; not legal controller |
| Administrator | Limited membership administrator | MVP-PROVISIONAL | Yes | CI + owner roles | PARTIAL; no universal peer admin |
| Member | Participating human | MVP-PROVISIONAL | Yes | CI + owner invitations/removal | PARTIAL; no automatic app grant |
| Multi-organization human | Same ID with distinct memberships/roles | SOURCE-CONFIRMED | Yes | Owner two-org/stable-ID pass | Implemented beyond original MVP |
| Invited existing person | Targeted ID invitation/response | MVP-PROVISIONAL | Yes | CI; accept owner-PASS | Decline/revoke/expiry live unverified |
| Invited pre-registration person | Verified contact reservation then bind human | Concept only | No | UNVERIFIED | DEFERRED; no email guessing |
| Peer-local customer/account | Local record linked after proof to human | SOURCE-CONFIRMED | Demo/reference only | CI + owner local-account/grant pass | PARTIAL; in-memory fixture; real peers persist independently |
| Staff/representative/seller/app personas | Human plus local employment/domain role | SOURCE-CONFIRMED boundary | Generic human/member only | No complete peer-specific qualification | NOT REQUIRED FOR MVP as separate global roles |
| App owner/publisher | Human owns first-party request; reviewed publisher | Provisional first-party slice | Yes | CI; not staging new slice | PARTIAL #44; external publisher policy blocked |
| Guest/anonymous visitor | Peer-local guest state, elects verified link later | Concept/policy boundary | No AccessLobby guest principal | UNVERIFIED | DEFERRED adapter work; guest checkout remains peer concern |
| Controller/legal authority | Verified legal/operational relationship | Open | No | UNVERIFIED | OWNER DECISION REQUIRED |
| Billing/security/delegated administrator | Scoped human authority with expiry/audit | Proposal | No distinct authority model | UNVERIFIED | OWNER DECISION REQUIRED; not alias for owner |
| Department/branch/subsidiary/workspace | Distinct structural/tenant relationship | Source expectation, policy open | No hierarchy schema | UNVERIFIED | OWNER DECISION REQUIRED |
| Service/workload/connector/bot | Dedicated machine principal/credentials | Source actor class | No AccessLobby actor lifecycle | UNVERIFIED | DEFERRED; private IAM provisioning token is operational, not this product |
| Device identity | Managed device principal/purpose | Concept | No | UNVERIFIED | DEFERRED; cookie/browser is not a device identity |
| AI/agent identity | Non-human purpose/owner/credential/audit | Concept | No | UNVERIFIED | DEFERRED; not a human with a bot name |
| Delegated/on-behalf-of actor | Original actor plus effective authority/lineage | Open contract | No | UNVERIFIED | OWNER DECISION REQUIRED; selected org is not delegation |
| Household/family/informal group | Human relationships with consent/safeguarding | Source concept only | No | UNVERIFIED | OWNER DECISION REQUIRED; do not label a household a verified business |
| Discovered external organization/facility | Peer record/provenance then explicit claim | Source concept only | No claim flow | UNVERIFIED | DEFERRED; discovery is not authentication |

The first-party acting-context cookie is person-bound and rechecked, but not a signed authorization/delegation claim. A peer may display selected membership and recheck it before an operation while still applying its own local authority. App admission is another separate check.

## Realm/trust-domain status

| Category | Current truth | Evidence |
|---|---|---|
| DECIDED, source-supported boundary | Human/person, organization and application are different things; none is automatically a new issuer | Identity/ownership sources and direct/native checks |
| MVP-PROVISIONAL implemented | One first-party realm per isolated environment; ordinary app gets an OIDC client in that realm | ADR002/008, planner, renderer, private provisioner; tests verify no realm creation |
| IMPLEMENTED | Nonmutating topology planner; reviewed exact client creation/readback and suspension | PR #42 and CI; live new-client rollout pending |
| PROVISIONAL | Person-owned first-party app review/grants, limited role policy, transitional legacy allowlist | Current first-party contract and ADRs |
| STILL OPEN | Almighty DigiVerse/World TransVerse topology, enterprise/private/federated trust domains, pairwise linking and exceptional realm criteria | CONFLICT-006/Q-001/Q-027; external proposal |
| NOT IMPLEMENTED | Autonomous exceptional-realm infrastructure reconciler after approval | No such mutation path in ordinary app/person/org flow |

An **environment** isolates deployments/data/secrets; a **realm** defines an IAM issuer/security domain; an **organization** is a shared product entity; an **application** is a logical product; an **OIDC client** is its technical registration in an environment/trust domain. **Trust domain** is a policy boundary, not a synonym for “each organization” or “each app.” Production may create its own baseline realm once; an exceptional additional issuer needs an approved architecture and migration plan.

## Current vs historical scope matrix

| Capability | Historical state | Current owner/status | Evidence |
|---|---|---|---|
| Durable human ID/auth/SSO | Repeated owner intent | AccessLobby canonical human/API; Keycloak replaceable engine | DEC-003/008; current persons/subject links |
| Credentials/login mechanics | Keycloak or suitable open-source engine | Keycloak implemented; AccessLobby product policies/UX/contracts outside engine | Constitution/ADRs |
| Shared organizations/memberships | Person-first, multi-org intended | AccessLobby flat provisional model implemented; hierarchy/legal authority open | DEC-004; PR #37–40 |
| Broad app entry/discoverability | Invite/default access requested | First-party registry/open/restricted grants implementedCI; live acceptance pending | DEC-009, PR #42/#44 |
| All peer domain permissions | Some earlier broad role/access phrasing | Each peer owns resource/business rights; no giant central permission database | DEC-005; direct SRC-0026§11; local reference denial |
| Billing/payment/commerce | Older broad platform examples | Specialist financial/commerce owner; future access-entitlement projection only | Narrower ownership sources; no AccessLobby billing implementation |
| Verification/KYC/KYB/risk | Original owner requested checks/consent through AccessLobby | Narrower model points to specialist verification/ZeroTrust boundary; precise canonical ownership ratification still needed | Historical SRC-0032, scope/conflict registers; no live verification/risk engine |
| Universal/federated search | Earlier owner assigned frontend to AccessLobby/AccessPoint with dedicated backend | Canonical broad search ownership unresolved; app discovery can remain local AccessLobby responsibility | Historical SRC-0032; later owner UI search request; no search backend here |
| Insights/SEO/analytics surfaces | Later owner UI requests and assistant elaboration | Valid requested UX direction, not ratified engine/data ownership or MVP requirement | UI chat/images; no live analytics backend |
| AccessPoint super-app orchestration | Earlier ecosystem overview | AccessPoint/peer responsibility; AccessLobby remains independently usable identity/access product | Historical ecosystem sources, DEC-001 |
| App-local account migration/guest checkout | Independent apps and detachability | Peer adapters own proof, persistence, history and migration; reference demo only | DEC-006/007, ADR005 |
| Source “first POII, then DonLoft” | Earliest execution dependency | Generic consumer supersedes dependency; actual adoption retained deferred | Owner correction; MVP-0; #8/#9 |
| Realm per app/org/person | Question/proposal, not frozen architecture | No routine realm creation; existing realm clients | ADR008/executable planner |
| External platform | Long-term owner objective | Retained; activation intentionally blocked until privacy/trust profile | DEC-001/010; external decision proposal |
| Mock trust score, verified badges, device/security/consent lists | UI sample content | Visual direction only; must not appear as genuine live data | UI fixture policy and current identity surface |

“Unresolved” preserves a real owner expectation awaiting ratification. It does not mean a repeated assistant proposal is current authority, nor that an old owner request can be silently erased by implementation convenience.

## Genuine owner decisions

1. **External identifiers and data:** pairwise sector per publisher or another approved model; minimal default claims; organization scopes; how internal human resolution survives token-sub changes without duplicate persons.
2. **Consent and trust:** product vs IAM consent ownership, purpose/retention/withdrawal and sensitive-scope review; external publisher assurance and incident recovery.
3. **Restricted admission:** first organization-seat/invitation/entitlement model, who administers it, delegated authority and revocation bounds. Current person grants/open entry can qualify the first-party pilot without settling every future model.
4. **Exceptional trust domains:** criteria for distinct issuer/keys/private enterprise SSO and migration; final DigiVerse/TransVerse topology.
5. **Organizations and other actors:** hierarchy/legal-controller/organizational recovery, non-human and delegation contracts, household safeguards.
6. **Product boundary ratification:** AccessLobby search/insights/verification UX versus canonical search/analytics/verification engines and AccessPoint/specialist responsibilities.

Review protection, migration execution, test completion, backups and production gates are engineering/operator work, not missing product decisions. Controlled pilot provisioning and current-browser sign-out choice are already authorized decisions; do not ask the owner to redecide them.

## Product progress in ordinary language

A real pilot person now has a stable AccessLobby identity and can use personal and organization accounts without creating a different login per organization. Organizations can invite existing AccessLobby people and manage provisional owner/admin/member roles. A connected sample app can recognize that person, keep its own customer record and independently deny or allow a protected page.

The next release contains a much better app-owner foundation: request an app, prove the hostname, obtain reviewed first-party activation, choose open or restricted entry and manage broad entry grants. The app still owns customer/staff permissions. A protected operator runs activation and suspension; ordinary owners never receive Keycloak realm admin access. This is implemented and tested in CI, not yet accepted live.

The wider vision remains substantial: public account recovery/verification, security center/MFA/passkeys, organization hierarchy/recovery, external consent/privacy, non-human actors/federation, real ecosystem adapters and production operations. These should follow an accepted production identity baseline, except explicit security or selected-release gates required to qualify it. No broader feature should displace the [MVP critical path](ACCESSLOBBY-CURRENT-STATE-AUDIT.md#next-work-critical-path).
