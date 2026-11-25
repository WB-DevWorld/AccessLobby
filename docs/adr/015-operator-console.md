# ADR 015 — AccessLobby operator console and independent application review

Status: implementation candidate, 2026-11-25. The owner has made a usable AccessLobby administrator console an immediate priority and authorized parallel delivery. Merge, CI, artifact publication, deployment, operator bootstrap and live acceptance are separate evidence stages.

## Decision

Add a protected first-party AccessLobby operator console at `/admin`, backed by the identity service and explicit database authority. Deliver three bounded capabilities in this round:

1. A protected console and privately managed platform roles.
2. Read-only people, organization and operator-audit directories.
3. Cross-owner application inspection and independent, configuration-bound first-party review, followed by the existing private activation process.

The console is a product interface for platform operators. The existing account, organization and app-owner interfaces continue to serve their own responsibilities. Organization ownership, application ownership, a token role, an email address and the first person to register confer no platform operator authority.

## Roles and bootstrap

| Role | Read console, directories, applications and operator audit | Record independent application review | Grant operator roles | Create IAM realms or change credentials |
|---|---|---|---|---|
| `support_reader` | Yes | No | No browser capability | No |
| `application_reviewer` | Yes | Yes, subject to review checks | No browser capability | No |
| Ordinary person or organization owner/admin | No | No | No | No |

The private `manage-operator` CLI grants or revokes either role for an explicitly selected existing durable person UUID. It requires protected database access and a recorded change reference. There is no public bootstrap endpoint, automatic first-user administrator, role-management screen or IAM role synchronization in this round.

API operator routes require the existing validated first-party `accesslobby-web` bearer, an active resolved person, a live session, and a current database role. Navigation visibility is a convenience, not authorization. The API rechecks authority for each request. Review and provisioning transactions also lock and recheck current reviewer authority. Revocation prevents subsequent authorized requests; it does not erase information already displayed in a browser.

## Directory and audit scope

The current identity database supplies durable person IDs, status and creation time. The People directory also reports active-organization and owned-application counts. It does not invent names, email addresses, phone numbers or private IAM profiles. People search uses a UUID or an ID prefix of at least four characters.

The Organizations directory supplies stored names, IDs, status, creation time and counts of active members and owners. Names remain self-asserted; this page does not certify legal ownership. Search accepts organization names or an exact ID.

The operator audit records private role changes, console review decisions and activation through the updated private provisioner, with references and times. A protected CLI action has no authenticated browser-person actor and is displayed accordingly. This feed is not a consolidated view of historical organization events, application events, WordPress audit tables or Keycloak security events. Those sources retain their existing ownership and investigation procedures.

Directories use bounded, cursor-paginated responses. The console does not expose raw provider subjects, tokens, browser-session identifiers, passwords, SMTP values or provisioning credentials. Private routes and API responses use no-store behavior and remain outside the PWA's offline authority.

## Review is distinct from activation

Application owners continue to request apps and verify their DNS TXT proof through `/apps/manage`. Operators can inspect applications belonging to other people at `/admin/applications`, including exact callback, logout and backchannel routes, entry policy, visibility, proof state and current review.

An `application_reviewer` may approve a first-party review or reject a request. The reviewer must be a different person from the owner. The owner must remain active, and the application must remain `requested/unreviewed`. Approval requires recorded proof for the public callback hostname. Review references contain 4–120 characters from letters, digits, `.`, `_`, `:`, `/` and `-`; they identify protected review evidence and must contain no secrets or personal data.

Each decision records the reviewer, time, reference and a SHA-256 configuration hash. A database revision advances on covered owner, route, policy, platform or proof changes, even when a later edit restores earlier values. A stale page cannot approve a different configuration. An identical retry is idempotent; a contradictory decision for the same configuration is refused. A new review requires a genuinely current revision, for example after the owner re-verifies its existing DNS proof. Historical decisions remain recorded.

The private provisioner now requires the latest matching approved review, its reference, an active independent reviewer and that reviewer's current role. It still rechecks live DNS and exact IAM client settings before activating the registry. `--plan` remains non-mutating and does not require approval. There is no bypass flag and no new browser activation endpoint. A rejected review does not retire or delete the application; it prevents activation for that reviewed configuration.

An approved review is displayed as **Approved · awaiting private activation**. It does not prove successful DNS recheck, client provisioning, application integration or rollout acceptance. Existing active clients are not retroactively disabled by this change.

## IAM boundary and realms

AccessLobby's `/admin` is on the AccessLobby web origin. Keycloak's `/admin` is a different interface on the IAM origin; its public path remains blocked. This round neither exposes Keycloak administration nor creates realms. IAM administration credentials never enter public web/API service configuration or browser forms.

[ADR 002](002-realm-and-contract.md) and [ADR 008](008-realm-boundaries-and-automation.md) continue to govern realm boundaries: applications register clients in the existing environment's `accesslobby-first-party` realm. A separate environment or explicitly reviewed trust domain can require another realm and issuer. Realm creation is not a side effect of app or organization registration.

Keycloak's console has realm selection and **Create realm** controls for sufficiently privileged IAM operators, and **Clients** controls inside a selected realm. A client created manually there does not establish AccessLobby registration, publisher approval or application entry. Use AccessLobby's registry and private provisioner for this profile.

No verified private Keycloak browser URL is established by this candidate. A separate private-access increment must verify the actual host and operator route, Keycloak hostname/proxy settings, TLS, administrative authentication and redirects/assets, while preserving public denials and existing issuer/client contracts. An untested localhost tunnel is not a completed console-access solution.

## Schema and delivery

Migration `009_platform_operators.sql` adds explicit roles and operator audit. Migration `010_application_reviews.sql` adds review records and configuration revision tracking. Numbers 007/008 remain reserved for the preserved external-preview line; this work does not activate that line or external publishers.

The [operator runbook](../runbooks/operator-console.md) defines deployment and bootstrap acceptance. The [delivery rounds](../OPERATOR-DELIVERY-ROUNDS.md) separate the console lane from Cursor's verified-mail and WordPress qualification lane. This document records the candidate decision; exact test and runtime evidence belongs in `CURRENT-WORK.md` and the PR.
