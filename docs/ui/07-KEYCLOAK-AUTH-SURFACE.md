# AccessLobby authentication surface

## Purpose

Keycloak remains the replaceable authentication engine. AccessLobby owns the public product presentation. The login theme therefore brands Keycloak-rendered login, registration, logout, error and future password-reset pages without moving credential handling into Next.js or NestJS.

## Required invariants

- Keep the issuer, realm ID, client IDs, redirect URIs, PKCE, cookies, sessions and token semantics unchanged.
- Never expose the technical realm name as the primary user-facing brand.
- Never expose Keycloak private IDs, tokens, cookies, session identifiers or secrets.
- Account registration, email verification and password reset remain controlled by their existing feature gates.
- The theme must be packaged in a pinned AccessLobby IAM image and promoted by immutable digest.
- The existing IAM gateway remains the only public route to the realm; the Keycloak container stays private.

## Theme scope

The initial theme covers:

- sign-in;
- registration;
- logout confirmation;
- authentication error and information pages;
- future forgot-password and reset-password pages when those capabilities are enabled.

The theme inherits Keycloak's supported templates and changes presentation and messages only. It does not fork Keycloak core.

## User-facing language

Use `AccessLobby`, not the technical realm name. Prefer clear action language such as `Sign in to AccessLobby`, `Create your AccessLobby account`, and `Sign out of AccessLobby`.

## Acceptance

Before staging acceptance:

- login, registration and logout visibly belong to AccessLobby;
- invalid credentials and invalid requests remain safe and understandable;
- existing login and registration flows still work;
- responsive checks cover 360, 390, 412, 768, 1366 and 1440 CSS-pixel widths;
- no page-level horizontal overflow is present;
- light and dark system preferences remain readable;
- the exact source SHA and IAM image digest are recorded.
