# MVP-0 freeze — 2026-09-24

Required for the independently deployable AccessLobby production baseline: controlled human login through Keycloak; AccessLobby-owned immutable person UUID with issuer/sub mapping; versioned authenticated identity response; OIDC code + PKCE; logout/re-entry; reproducible registration of an arbitrary compatible consumer; a reference consumer/conformance run showing that authentication does not grant its local resource access; CI, staging, production monitoring, backup/restore and rollback evidence. Production must serve real controlled users and be usable by a separately deployed OIDC client.

Real POII/DonLoft adoption is a subsequent milestone when their implementations become available. A reference consumer proves the reusable contract; it is not evidence that either product adopted AccessLobby. Do not require a named peer repository to deploy the AccessLobby product.

Source-confirmed: independent AccessLobby product, durable identity, replaceable Keycloak, peer independence and local domain authorization; POII/DonLoft are intended future consumers, not the definition of the platform contract.

Provisional: one first-party realm per isolated environment; person UUID field in v0.1 response; `accesslobby-api` token audience and explicit client allowlist; controlled pilot provisioning; short lived web cookie without refresh; initial deployment compose. See ADRs.

Deferred: organization hierarchy, grants/entitlements, federation, public signup/recovery, passkeys, machine identities, delegation, WordPress/POS migration and full global revocation.

Go/no-go: valid and invalid auth, stable subject mapping, no email linking, reference consumer local denial, arbitrary client registration, restart, migration, health, TLS, secrets, backup/restore, rollback, staging E2E and exact artifact promotion. If issuer integrity, mapping uniqueness, backup/restore or local authorization isolation fails, do not promote. Staging alone is not MVP completion. Report real peer adoption separately.
