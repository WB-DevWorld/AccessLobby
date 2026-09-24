# ADR 001 — IAM and identity

SOURCE-CONFIRMED: AccessLobby is an independent identity product; Keycloak is a replaceable IAM engine. Durable person identity is independent of email and provider subject. Peer apps own resource permissions. MVP-PROVISIONAL: two small tables, `persons` and `iam_subject_links`; UUID internal person ID and `(issuer, sub)` uniqueness. Keycloak and AccessLobby use separate logical databases and credentials. Revisit when account linking/lifecycle semantics are decided; migrate through versioned API and explicit mappings, never email matching.
