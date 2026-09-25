# AccessLobby consumer contract v0.1 (MVP-PROVISIONAL)

## Discovery and client

Any compatible human-facing application can register as an OIDC client. Each environment publishes its explicit AccessLobby-controlled OIDC issuer at `OIDC_ISSUER` and its discovery at `${OIDC_ISSUER}/.well-known/openid-configuration`. Keycloak operates the issuer in MVP-0; the application integrates by protocol and AccessLobby's versioned identity API, never Keycloak's database or administration API. Consumer configuration pins the full issuer and unique client ID; redirect URIs are exact HTTPS callback URLs (localhost HTTP only for development). Use Authorization Code + PKCE S256 and `state`, with `nonce` for ID tokens. Allowed base scopes: `openid profile email`. Do not infer identity from email.

Register clients through the repeatable [consumer onboarding process](consumer-onboarding.md), adding exact redirect and logout URIs, an audience mapper for `accesslobby-api`, and the client ID to the API allowlist. Do not put secrets in Git. Public clients require PKCE; confidential server clients additionally authenticate at token exchange. This v0.1 profile covers interactive human sign-in; machine, SAML and enterprise federation profiles are deferred.

## Validation and resolution

Validate signed tokens against discovery JWKS (refresh keys on rotation), `iss`, signature/algorithm, `exp`/`nbf`, intended audience and client/authorized party. The AccessLobby API accepts RS256 access tokens with `aud=accesslobby-api` and allowlisted `azp`. `sub` is the issuer's mutable-provider boundary identifier, **not** the durable AccessLobby person ID. Never parse an unverified JWT for authorization.

Call `GET /v1/me` with `Authorization: Bearer <access token>` from the authenticated consumer backend, optional `x-request-id`. A `200` response is `{ "contract":"accesslobby.identity.v0.1", "person": {"id":"opaque UUID", "status":"active"}, "requestId":"..." }`. `401` means absent/invalid token, `403` suspended person, `503` backend unavailable. The endpoint only resolves the token's own subject. The first valid subject creates a person; subsequent calls return the same ID. A consumer stores `(issuer, sub, person.id, local user/profile id)` with an explicit auditable mapping. No automatic email linking.

Each application establishes its own secure session and performs its own app entry and resource authorization. Authentication alone never grants any application's resource access. A failed identity resolution fails new login closed; existing application sessions follow that application's documented expiry policy. During an AccessLobby outage, new login fails safely; out-of-band administrative recovery must not depend on this service.

## Session and logout limits

MVP web session is an encrypted HttpOnly SameSite=Lax cookie capped at one hour/token lifetime, no refresh token. Local logout clears it and attempts OIDC RP-initiated logout. Peers clear their own sessions on logout. Token/session invalidation is **not** guaranteed to propagate instantly to every peer; keep peer sessions short and create stronger revocation work. Version the response compatibly; adding optional fields is nonbreaking, changing person ID meaning or token audience requires a new contract and explicit migration.
