# Parallel delivery rounds

Owner direction, 2026-11-25: make the AccessLobby administrator console an immediate priority, allow agents and Cursor to work simultaneously, and organize each round around two or three complete features.

A round is bounded by demonstrable behavior, not a fixed number of agents or a promise that dependencies will be available. Count a feature complete only when its stated implementation, CI, qualified artifact, controlled staging and real operator acceptance gates are met. Report a tested candidate honestly while deployment or live acceptance remains open. Do not close an umbrella release/qualification issue because one slice merged.

## Round 1 — operator console candidate

| Feature | Delivered behavior in the candidate | Completion evidence required |
|---|---|---|
| Protected operator access | `/admin`, live database role gate, protected CLI grant/revoke, role-aware navigation | Ordinary/organization/peer denial; role grant and revoke through protected route; current operator acceptance |
| Read-only investigation | Bounded People and Organizations directories plus operator audit | Real data/search/paging; privacy and no-store checks; usable keyboard/mobile states; no invented profile fields |
| Independent first-party app review | Cross-owner application inspection, immutable decision/reference/configuration revision, private provisioner enforcement | Reader/self-review/stale/contradictory denial; exactly-one review/audit behavior; private current approval + fresh DNS/IAM readback; separate real consumer qualification |

The third feature completes review and private activation handoff. It does not claim an automatic activation worker or browser IAM administration. Those are separately scoped work. Existing active app registrations remain usable; external activation remains closed.

Schema additions use 009/010; 007/008 remain reserved for the preserved external-preview development line. No real operator has been bootstrapped, SMTP changed, plugin replaced or deployment promoted merely by implementing the candidate. Exact local, CI, artifact and runtime results belong in the PR and `CURRENT-WORK.md`.

## Concurrent ownership

| Lane | Owns | Handoff |
|---|---|---|
| Operator API agent | Explicit role store, protected CLI and directory/audit service tests | API contract and denial behavior |
| Application-review agent | Review schema/store, configuration binding, private provisioner enforcement and tests | Review invariants and activation prerequisites |
| Operator UI agent | Protected console routes, loading/error states, review form and browser checks | Accessible working pages using real API contracts |
| Integrator | Shared API entry point, migration manifest, navigation wiring, contracts, ledger, full regression, PR and release evidence | One reviewed source/artifact set |
| Cursor/operator lane | Existing Forward Email account SMTP, genuine delivery/verification, controlled WordPress Join/JIT and estate qualification | Sanitized exact-revision operator evidence under issue #59 |

Agents work in distinct files or isolated branches/worktrees. One integrator owns shared files and migration ordering. Do not overwrite another lane's branch, infer its local changes are published, or borrow its passing CI result for a different head. Review integration failures before rerunning unchanged green suites. Keep credentials, mailbox contents, customer data and raw tokens out of handoffs.

Cursor's confirmed concurrent work is:

1. Use the existing **Forward Email** account for protected SMTP setup and a genuine verification-email journey; verify a fresh authenticated email claim.
2. Qualify training's controlled Join/JIT, exactly-one account/link reuse and collision refusal while preserving its existing customers and commerce.
3. Link FLAIROC's existing customer 122 with `al-qual-person` through dual proof, then qualify cross-domain SSO/logout and the remaining issue #59 cases.

The console lane does not change SMTP, mail policy, WordPress plugin bytes, estate customer links, JIT or enforcement settings. Cursor retains its existing branch/workflow and records exact source, configuration and categorical results. Feature completion still depends on genuine outcomes; sending an instruction is not acceptance.

## Proposed next round — choose two or three bounded features

| Candidate | A complete useful increment | Dependencies and limits |
|---|---|---|
| Reviewed private activation worker | Durable approved job, private least-privilege worker, retries, status and exact DNS/IAM verification | No IAM credentials on public web/API; replay/stale-review/partial-failure tests; controlled app acceptance |
| Person suspend/re-enable | Audited operator action with explicit permission, confirmation and documented API/session effects | Define safeguards, existing memberships/grants and bounded peer effects; does not claim to erase all unchecked local sessions |
| Verified private IAM console route | Working operator browser path for realm/credential operations with hostname/proxy/TLS checks | Protected host access and real login; public admin remains denied; preserve issuer and consumer compatibility |

Scope these before coding and select only work that can be accepted with the available operator access. Realm creation automation is a further trust-domain lifecycle feature if needed; exposing Keycloak's console alone does not establish multi-realm AccessLobby support.

Later rounds can take two or three complete slices from credential recovery, stronger authentication enrollment, session/device inspection and revocation, organization recovery/delegation, app update/retirement, privacy consent and external publisher onboarding. Each requires its own actual behavior and acceptance criteria. Do not combine them into a broad unfinished dashboard or present roadmap buttons as working features.

## Definition of Done and reporting

Every feature needs a bounded issue/acceptance statement, owned paths, implementation, meaningful positive/negative tests, review, passing CI for the exact head, immutable artifact identity, compatible migration/rollback plan, controlled staging and real authorized-user acceptance. Preserve identity IDs, explicit links, application-local authorization and IAM/identity database separation.

Use these statuses separately: implementation candidate; local tests; CI; published artifact; staging deployment; operator acceptance; production. Include a precise next gate for anything blocked. PRs declare `Closes #N` only for the complete issue definition; partial work uses `Relates to #N`. The integrator reconciles linked issues after merging. Production promotion remains its own release decision.

## Small addendum for Cursor's existing prompt

Append this to the current Cursor handoff without rewriting its mission:

> Continue the existing Forward Email SMTP/genuine verification, training Join/JIT/collision and FLAIROC customer-122 (`al-qual-person`) linking/SSO/logout work under issue #59. Parallel agents own the AccessLobby operator console. Reserve migrations 009/010, operator-role/review modules, `/v1/admin/*`, `/admin/*` and their tests for that lane; coordinate any shared-file change with the integrator. Preserve your existing branch and sanitized exact-revision evidence. Do not copy mail credentials or customer data into the console handoff. Console approval remains separate from private activation and must not weaken verified-email, dual-proof linking or external-privacy gates.
