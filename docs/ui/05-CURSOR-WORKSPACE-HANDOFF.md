# Cursor workspace handoff

Status: **historical Wave1 handoff; operating principles retained, current acceptance in #27**

Current acceptance tracking: #27, with live auth #6, lifecycle #25 and IAM branding #29. Historical #16/#19 are superseded/closed. Start new bounded work from current main; the old foundation branch/assignment below explains the historical workspace and must not replace current implementation.

## Where Cursor fits

Cursor is the interactive frontend implementation and refinement workspace after the repository has established the product boundaries, data-truth rules, responsive shell, and first working routes.

Cursor is not a separate source of truth and must not create a second AccessLobby frontend codebase. It works from the canonical `WB-DevWorld/AccessLobby` repository in an isolated Git worktree and sends all durable changes through normal branches, pull requests, CI, staging, and review.

## Recommended local workspace

From a machine with Git and Cursor installed:

```bash
git clone https://github.com/WB-DevWorld/AccessLobby.git
cd AccessLobby
git fetch origin
git worktree add ../AccessLobby-ui-cursor -b feat/ui-cursor-refinement origin/feat/ui-foundation
cursor ../AccessLobby-ui-cursor
```

If the repository is already cloned, omit the first two commands and create the worktree from that clone.

Do not make Cursor work directly on `main`.

## Read before editing

Cursor must read, in this order:

1. `AGENTS.md`
2. `PROJECT-CONSTITUTION.md`
3. `SOURCE-OF-TRUTH.md`
4. `OWNERSHIP.md`
5. `CURRENT-WORK.md`
6. `.cursor/rules/identity.mdc`
7. `.cursor/rules/frontend.mdc`
8. all files in `docs/ui/`
9. issue #27 and the current bounded UI pull request

The generated UI images are visual references. They do not override these files or the working authentication contracts.

## Cursor's first bounded assignment

Cursor should refine and verify the existing Identity Wave 1 implementation rather than recreate it.

Primary tasks:

- compare `/`, `/account`, `/identity`, and `/recovery` against the approved desktop/mobile visual direction;
- improve spacing, typography, hierarchy, card composition, navigation polish, dark-mode presentation, and responsive behavior;
- preserve truthful unavailable states where backend capabilities do not exist;
- verify mobile, tablet, laptop, and wide-desktop layouts;
- verify keyboard navigation, focus visibility, heading order, labels, touch targets, and reduced-motion behavior;
- remove horizontal page overflow;
- keep the current server-only identity adapter and OIDC routes intact;
- add or repair tests only where needed for the visual/refinement change;
- capture browser screenshots and a concise verification report.

## Files Cursor may normally edit

- `apps/web/app/page.tsx`
- `apps/web/app/account/page.tsx`
- `apps/web/app/identity/page.tsx`
- `apps/web/app/recovery/page.tsx`
- `apps/web/app/style.css`
- `apps/web/components/**`
- non-sensitive frontend tests
- `docs/ui/**` when recording verified behavior

## Files Cursor must not change without explicit review

- `apps/web/app/auth/**`
- `apps/web/lib/oidc.ts`
- API identity semantics
- migrations or database schemas
- Keycloak realm configuration
- root CI and deployment workflows
- shared lockfiles or global dependencies
- integration-contract semantics

A visual task must not silently become an authentication or backend redesign.

## Data truth rules

Cursor must not display illustrative values as real facts. In particular, it must not invent:

- names, dates of birth, addresses, phone numbers, emails, identity documents, or nationality;
- profile-completeness percentages;
- trust scores or trust levels;
- MFA, passkeys, biometrics, backup codes, devices, or sessions;
- recovery contacts or recovery readiness;
- connected applications, consent history, or permissions;
- search, SEO, AISEO, or analytics metrics.

When no approved source exists, keep the existing honest unavailable/planned state.

## Required verification

Before opening or updating a pull request, Cursor should run:

```bash
pnpm install --frozen-lockfile
pnpm --filter @accesslobby/web typecheck
pnpm --filter @accesslobby/web test
pnpm --filter @accesslobby/web build
```

Then run the web application and verify it in a real browser at representative widths, including approximately:

- 390 x 844 mobile;
- 768 x 1024 tablet;
- 1366 x 768 laptop;
- 1440 x 900 desktop.

Verify:

- page renders meaningful content;
- no framework error overlay;
- no console errors caused by the implementation;
- no page-level horizontal overflow;
- navigation remains usable;
- visible keyboard focus is present;
- signed-out and unavailable states remain truthful;
- `/auth/login`, callback behavior, `/account`, and logout are not regressed.

## Commit and PR discipline

Use small coherent commits. A typical Cursor refinement PR should contain only presentation, responsive, accessibility, and directly related test changes. It must reference issue #27 or the current bounded acceptance issue, state which routes and viewports were checked, and attach screenshot/browser evidence.

## Suggested Cursor agent prompt

```text
Read AGENTS.md, PROJECT-CONSTITUTION.md, SOURCE-OF-TRUTH.md, OWNERSHIP.md, CURRENT-WORK.md, .cursor/rules/identity.mdc, .cursor/rules/frontend.mdc, all docs/ui files, issue #27, and the current bounded UI pull request before editing.

Refine the existing AccessLobby Identity Wave 1 frontend; do not recreate it. Focus on high-fidelity desktop/mobile visual quality, responsive behavior, accessibility, and browser verification for /, /account, /identity, and /recovery. Preserve all existing OIDC routes, server-only session/token handling, the current /v1/me contract, durable person identity, and peer-local authorization boundaries. Never replace unavailable data with generated success data or values copied from UI images. Do not edit auth, backend, migrations, realm configuration, root CI, deployment workflows, or shared dependencies without explicit review.

Run web typecheck, tests, production build, and browser checks at mobile, tablet, laptop, and desktop widths. Capture screenshots and report exact results, defects found, files changed, commands run, and remaining limitations. Commit changes to the current feature branch and open or update a reviewed PR; never push directly to main.
```

## Parallel-agent boundary

While Cursor performs visual refinement, another agent may continue API, IAM, deployment, production qualification, or contract work in a different branch/worktree. Shared authentication files, root workflows, lockfiles, and contracts must be edited serially rather than concurrently.
