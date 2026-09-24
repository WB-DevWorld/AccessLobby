# Ownership

| Truth | Owner |
|---|---|
| Credentials, OIDC sessions, `iss`/`sub` | IAM engine (currently Keycloak) |
| Durable person ID and issuer/subject link | AccessLobby PostgreSQL |
| Application-local profile, permission and resource checks | Each peer, including POII and DonLoft |
| POII disclosure/context policy | POII |
| DonLoft files, ACLs, quotas | DonLoft |

Cross-product relationships use versioned contracts and local references; no cross-database FKs.
