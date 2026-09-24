# MVP-0 freeze — 2026-09-24

Required: controlled human login through Keycloak; AccessLobby-owned immutable person UUID with issuer/sub mapping; versioned authenticated identity response; OIDC code + PKCE web flow; logout/re-entry; one real peer retaining local authorization; CI, staging, production monitoring, backup/restore and rollback evidence.

Source-confirmed: independent AccessLobby product, durable identity, replaceable Keycloak, peer independence and local domain authorization; POII/DonLoft are intended consumers.

Provisional: one first-party realm per isolated environment; person UUID field in v0.1 response; `accesslobby-api` token audience and explicit client allowlist; controlled pilot provisioning; short lived web cookie without refresh; initial deployment compose. See ADRs.

Deferred: organization hierarchy, grants/entitlements, federation, public signup/recovery, passkeys, machine identities, delegation, WordPress/POS migration and full global revocation.

Go/no-go: valid and invalid auth, stable subject mapping, no email linking, peer local deny, restart, migration, health, TLS, secrets, backup/restore, rollback, staging E2E and exact artifact promotion. If issuer integrity, mapping uniqueness, backup/restore or peer authorization fails, do not promote. Staging alone is not MVP completion.
