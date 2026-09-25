# Onboard any compatible human-facing application

This v0.1 process is application and language independent. The application is an OIDC relying party; AccessLobby owns the issuer configuration and durable identity API. The current IAM engine is Keycloak. No peer repository, shared database, private IAM API or AccessLobby source import is required. POII and DonLoft can use the same process when available.

## Operator registration

1. Assign a unique lowercase client ID for this application and environment. Choose exact HTTPS callback and post-logout URLs on the application's own origin (localhost HTTP only for development). Record the AccessLobby environment's exact `OIDC_ISSUER`, API base URL and approved client ID. Do not reuse staging registrations in production.
2. Render a public interactive client representation, for example:

   ```sh
   python3 infra/scripts/render-client.py \
     --client-id sample-portal \
     --redirect-uri https://portal.example.test/auth/callback \
     --logout-uri https://portal.example.test/ \
     --output /tmp/sample-portal-client.json
   ```

   Review the JSON; it allows code flow with PKCE S256, exact redirect/logout, and `accesslobby-api` audience. This public-client profile works for a backend-for-frontend or native application with appropriate platform redirect handling. Treat native redirect rules separately before production. No secret is generated. Do not commit environment-specific URLs if confidential.
3. In the target environment, an operator applies the reviewed client to the existing realm through the restricted Keycloak administration channel. Example inside the IAM container after authenticating `kcadm.sh` with operator credentials supplied out of band: `kcadm.sh create clients -r accesslobby-first-party -f /path/to/sample-portal-client.json`. Confirm it is created exactly once; for later edits export/diff/update rather than re-importing the realm. Do not use a browser-only manual change as the sole record. Persist the reviewed client representation in the environment's protected deployment configuration.
4. Add `sample-portal` to that environment's API `ALLOWED_CLIENT_IDS`, preserve existing entries, deploy the API configuration and verify readiness. The API refuses clients absent from this list. This is an operator grant, not a grant of any application resource.

The current generator handles public interactive clients only. A confidential server client may be registered with Keycloak, but its client secret and token-exchange method require a separately reviewed configuration stored outside Git. This v0.1 profile does not yet define SAML, machine tokens, federation or organization claims.

## Consumer implementation

1. Pin the exact issuer and unique client ID. Fetch OIDC discovery at `${OIDC_ISSUER}/.well-known/openid-configuration`; reject mismatched issuer or unexpected endpoint origins. Use authorization code + PKCE S256, unpredictable `state`, and `nonce` for ID token validation. Send only exact registered callback URLs. Keep token exchange on a trusted backend when one exists.
2. Verify ID token signature, issuer, audience/client, expiration, and nonce with discovery JWKS. Validate access-token signature, issuer, expiry, `aud=accesslobby-api` and `azp=<registered client>` before using its claims. Refresh cached keys on rotation. The AccessLobby API independently repeats its access-token checks.
3. Call `GET /v1/me` with that access token from the application backend. A successful response gives `person.id`, the opaque AccessLobby-owned durable human identifier. `sub` is scoped to issuer; email is a mutable attribute. Store a local mapping from `(issuer, sub, person.id)` to a local principal. For an existing user, require explicit auditable linking; never match an account by email alone.
4. Establish a short secure application session and run the application's own entry/resource authorization. Demonstrate that an authenticated person without local permission receives a denial. On AccessLobby failure, fail new login closed; define how existing sessions expire. Clear the application's session and invoke the issuer end-session endpoint on logout, then verify re-entry. Instant global session revocation is not claimed.

## Independent conformance evidence

Run the [consumer contract](integration-contract-v0.1.md) against a separate registered sample application or a controlled pilot application. Record a valid login, stable `person.id` on repeat login and email change, new subject isolation, tampered/expired/wrong issuer/wrong audience token rejection, wrong `state`/`nonce`, exact callback rejection, logout/re-entry and local resource denial. Record the commit, issuer, client ID, API version and result without tokens or personal data. A reference consumer establishes interoperability; it does not prove that a named production peer has adopted AccessLobby.
