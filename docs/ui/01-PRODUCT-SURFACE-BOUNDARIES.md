# Product surface boundaries

## Confirmed foundation

AccessLobby is the common identity, authentication and SSO product boundary. Keycloak is the current replaceable IAM engine. AccessLobby owns the durable provider-independent person identity and the integration contract; connected applications keep their domain/resource authorization.

The UI must preserve the distinction between:

- identity;
- authentication;
- organization membership;
- application entry/access;
- entitlement;
- consent;
- verification/assurance;
- domain/resource authorization.

These concepts may be related in the interface but must not be collapsed into one permission or one status.

## AccessLobby Identity — production-first surface

### Personal Account Overview

May present:

- authenticated/signed-out state;
- durable AccessLobby person ID;
- person lifecycle/status;
- safe navigation to identity and account controls;
- truthful service-unavailable/session-expired states;
- real session/account facts when backed by current APIs.

Must not invent:

- profile completeness percentages;
- verified contact methods;
- government documents;
- trust scores;
- MFA/passkey status;
- connected apps;
- recent security events;
- recovery readiness.

### Identity Profile

The page structure may anticipate personal information, contacts, address, identity claims and trusted contacts, but only authoritative data may be shown as real.

Until supporting contracts exist:

- show the real person ID and lifecycle/status;
- use honest `Not available yet`, `Not configured`, or equivalent states;
- hide sections that would create a misleading claim;
- allow fixture-backed component development only outside production behavior.

### Recovery & Trusted Contacts

This is a planned product surface, not a statement that recovery contacts, backup codes, passkeys or device recovery are implemented.

The initial route must be one of:

- feature-flagged;
- clearly marked as unavailable;
- backed by an explicit development-only fixture adapter.

It must not collect or persist recovery data until the backend contract, security model and lifecycle rules are approved.

## Apps & Access / SSO

Connected Apps and App Permissions align with AccessLobby's identity/access integration role, but the exact app-entry grant, consent and permission ownership is not fully frozen. Build reusable UI primitives now; activate product routes only after a versioned contract exists.

The SSO App Launcher is provisional. Historical AccessPoint/launcher ownership and the division between app discovery and broader navigation remain unresolved. Do not make the launcher the permanent ecosystem shell through frontend code alone.

## Verification & Trust

AccessLobby may display verification or assurance assertions supplied by an authoritative owner. It must not become the KYC/KYB, evidence, fraud or risk engine merely because a visual concept contains a trust score.

A future trust page must identify assertion source, issue time, status and expiry where applicable. The frontend must not calculate a permanent score such as `780/1000` without an approved backend model.

## Insights, SEO, AISEO & Analytics

The visual concepts are retained as product exploration. Production ownership, tenant/data scope, telemetry source, retention, privacy and authorization are not sufficiently frozen for implementation as live products.

They may be used for:

- component planning;
- route prototypes behind non-production flags;
- data-contract discovery;
- future issue decomposition.

They must not be represented as currently available AccessLobby capabilities.

## External peer ownership

The frontend must not imply that AccessLobby owns:

- peer files, orders, knowledge, products or resources;
- peer-local roles or resource permissions;
- ZeroTrust Verify evidence/risk truth;
- MindMesh AI model routing or AI intelligence truth;
- DonLoft file/storage truth;
- commercial billing truth unless separately approved.
