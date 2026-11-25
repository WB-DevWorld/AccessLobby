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

## Round 2 — implemented candidate, independently qualified before rollout

Branch `feat/operator-round-2` stacks on PR73; issue74 tracks the separate acceptance gate. Six agents handled three product features and supporting private-IAM/security/browser qualification. The integrator owns shared API routing, role models, contracts, ledger, full regression and delivery.

| Feature | Implemented behavior | Next live acceptance |
|---|---|---|
| Person controls | Detail, explicit identity-operator suspend/re-enable, audited versions, old token/receipt non-revival and operator/self safeguards | Qualified artifact/schema; privately granted intended operator; controlled real-person/API/peer effects |
| Owner request lifecycle | Edit/cancel/resubmit inactive requests, preserve IDs/history, invalidate proof/review/jobs, quota/idempotency | Real owner native forms/DNS/review, stale and unauthorized denial |
| Private activation jobs | Approved durable queue, progress/retry UI, fenced private worker, generation binding, exact DNS/IAM readback and atomic completion | Protected runner/credential issuance and cleanup, current schema, controlled real app/consumer acceptance |

[ADR016](adr/016-operator-controls-and-activation-jobs.md) and [round-two runbook](runbooks/operator-round-2.md) define the contract and recovery boundaries. Migrations011/012/013 follow009/010. Private Keycloak access has a GET-only readiness checker and [runbook](runbooks/private-iam-console.md), not a verified live browser route. Realm creation remains a separate environment/trust-domain decision; ordinary custom apps use clients in the existing realm.

Cursor's published result a83634f now records Forward Email587/STARTTLS delivery, genuine verification and training subscriber47 created/reused, users40, JIT restored off. FLAIROC customer122 and bounded cross-domain SSO/shared-logout isolation are accepted in the earlier published evidence. Email-collision refusal and truly new AccessLobby signup from WordPress remain independent pending qualification. The original handoff below is historical; do not repeat completed acceptance merely because it remains listed there.

Future rounds can select two or three bounded slices from verified recovery, stronger authentication enrollment, session/device inspection, organization recovery/delegation, active-app update/retirement, consent and external onboarding. Each needs its own invariants, compatibility and operator evidence; those names are not delivered features.

## Definition of Done and reporting

Every feature needs a bounded issue/acceptance statement, owned paths, implementation, meaningful positive/negative tests, review, passing CI for the exact head, immutable artifact identity, compatible migration/rollback plan, controlled staging and real authorized-user acceptance. Preserve identity IDs, explicit links, application-local authorization and IAM/identity database separation.

Use these statuses separately: implementation candidate; local tests; CI; published artifact; staging deployment; operator acceptance; production. Include a precise next gate for anything blocked. PRs declare `Closes #N` only for the complete issue definition; partial work uses `Relates to #N`. The integrator reconciles linked issues after merging. Production promotion remains its own release decision.

## Small addendum for Cursor's existing prompt

Append this to the current Cursor handoff without rewriting its mission:

> Continue the existing Forward Email SMTP/genuine verification, training Join/JIT/collision and FLAIROC customer-122 (`al-qual-person`) linking/SSO/logout work under issue #59. Parallel agents own the AccessLobby operator console. Reserve migrations 009/010, operator-role/review modules, `/v1/admin/*`, `/admin/*` and their tests for that lane; coordinate any shared-file change with the integrator. Preserve your existing branch and sanitized exact-revision evidence. Do not copy mail credentials or customer data into the console handoff. Console approval remains separate from private activation and must not weaken verified-email, dual-proof linking or external-privacy gates.
