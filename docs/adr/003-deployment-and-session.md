# ADR 003 — Deployment and session

MVP-PROVISIONAL: separate databases on a portable Docker Compose host behind a trusted TLS proxy; pinned image versions and digest promotion. The web BFF uses short encrypted server-issued cookies, code + PKCE, no refresh token; Keycloak renders credential UI. It clears local state and invokes OIDC logout, without promising instant peer revocation. Revisit upon real infrastructure discovery, cross-app logout requirements or scaled availability. Back up both databases and verify restore before production.
