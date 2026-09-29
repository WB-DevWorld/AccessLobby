# AccessLobby UI implementation pack

Status: **active implementation authority for the UI stream**

Current tracking: #27 browser/reference acceptance, #6 live auth, #25 lifecycle and #29 IAM branding. Historical #16/#19 assignments are superseded/closed. See the [current-state audit](../ACCESSLOBBY-CURRENT-STATE-AUDIT.md).

## Purpose

This pack converts the approved AccessLobby direction and generated desktop/mobile visual concepts into a bounded implementation contract for the existing Next.js application.

It does not redefine AccessLobby architecture. It does not make every element shown in the visual concepts a live product capability.

## Original Wave1 starting point (historical)

The present implementation also includes contexts, organizations and first-party app-request/grant routes. The newer app slice remains staging-unaccepted. The original starting point below explains the foundation, not today's route inventory.


The current web application is intentionally thin:

- `/` provides the AccessLobby sign-in handoff.
- `/auth/login`, `/auth/callback` and `/auth/logout` implement the working OIDC flow.
- `/account` resolves the authenticated person through the AccessLobby API and currently displays the durable person ID and lifecycle/status.

The UI work must preserve those working paths while replacing the minimal presentation with a reusable responsive product shell.

## First implementation wave

1. Personal Account Overview
2. Identity Profile
3. Recovery & Trusted Contacts

These pages are grouped as **AccessLobby Identity — Wave 1**.

## Later visual concepts

The following concepts may inform the component architecture but are not part of the first production wave:

- Connected Apps
- App Permissions
- SSO App Launcher
- Trust Score / Trust Level
- Insights Overview
- SEO / AISEO Performance
- Analytics Explorer / Reports

They require separate product, ownership and data-contract review before production activation.

## Authority order

For the UI stream, use the following order:

1. Current owner instructions and the current issues listed above.
2. Repository constitution, source-of-truth, ownership and current-work files.
3. Existing authentication/API contracts and runtime behavior.
4. This UI implementation pack.
5. Generated UI images as visual references.
6. Agent inference.

Visual references never override working authentication, security boundaries, truthful data states or repository decisions.

## Delivery model

- Use a bounded branch/worktree from current main. The historical `feat/ui-foundation` assignment is complete/superseded; do not restart from an old branch.
- Keep the UI stream isolated from concurrent IAM/backend/operations changes.
- Open a reviewed PR before merging.
- Preserve the existing authentication contract.
- Require typecheck, tests, production build and responsive browser evidence.
- Deploy to staging before production promotion.

## Non-negotiable truth rule

The interface must never present illustrative values as real account facts. A polished unavailable state is better than a fabricated score, verification badge, document, session, contact, app connection or analytics metric.
