# Product boundaries

AccessLobby owns durable human identity and the sign-in product contract. Keycloak currently owns credentials, challenge, OIDC and IAM sessions. Peer apps own domain/resource permissions and local mappings. No peer reads another peer's operational database. Email and provider `sub` are never durable person IDs. Membership is distinct from application admission, which is distinct from resource authorization. These principles are SOURCE-CONFIRMED; exact realm, claims, organization and revocation models remain open.
