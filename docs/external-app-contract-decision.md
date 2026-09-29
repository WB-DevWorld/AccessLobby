# External application contract: decision proposal

Status: **PROPOSAL — owner decision required; no external activation** (2026-09-29).

## Why this is a separate gate

Source Pack DEC-001/010 expects AccessLobby to serve external applications, while DEC-003/005/009 keeps durable identity, broad app entry and peer resource authorization distinct. Q-001/005/011/015/019/027 leave the exact external trust, consent, claims and realm contract open. PR #42 deliberately activates only reviewed first-party clients. Today `/v1/me` returns the universal AccessLobby person ID, `/v1/my-organizations` returns organization IDs/names, and `PostgresIdentityStore` keys the person link by `(issuer, token.sub)`. The current access token and ID token may expose stable provider claims to the client. Simply changing the API response to a pseudonym would not make external sign-in private.

## Recommended provisional external profile

| Concern | Proposed rule before an external client can activate |
|---|---|
| Realm | Reuse a reviewed issuer/trust domain only after token and identity isolation are demonstrated. An app request or customer signup does not create a realm. A separate realm is an exceptional trust-domain decision, not a scaling unit. |
| Subject | Give each external publisher an OIDC pairwise `sub` by an approved sector policy. Never expose the internal `person.id` in the ID token, access token, userinfo or external API. Ensure the same human maps to their existing AccessLobby person internally when token `sub` differs. |
| Claims | Begin with minimal sign-in claims. Treat email, profile, organization identity/memberships and persistent API access as separate, explicit scopes with purpose and retention review. Do not expose the first-party membership projection to external clients by default. |
| API | Introduce an external versioned self-scoped identity/entry response returning an app-scoped opaque identifier. Separate its audience and authorization from the first-party `/v1/me` and management routes. A client may never select another person or application ID to query. |
| Consent | Record what publisher, data categories and scope the human approved, when and for which version; show a clear grant/withdrawal path. Clarify whether the product's consent record or the IAM engine drives the prompt before implementing either. Revocation must block future data/API access and state the limits for data already copied by a peer. |
| Admission at scale | Allow reviewed `authenticated_open` apps to admit active sign-ins without a per-person Docker variable or grant row. An app still creates its own local user and applies its own customer/staff roles, subscriptions and resource rules. `grant_required` remains a separate restricted-entry policy; organization seats and bulk entitlements need their own contract. |
| Registration | Keep domain proof, publisher verification, exact callback/logout URLs, scopes, review/audit and private client provisioning. Automation can process these steps after policy gates are explicit; it must not confer IAM admin rights on every app owner. |

OpenID Connect defines pairwise subject identifiers by sector and requires values not reversible by a relying party. Keycloak documents a pairwise subject mapper, but its access-token `sub` mapping and the current AccessLobby `(issuer, sub)` lookup must be tested together before use. In particular, mapping a different token `sub` for an external client without changing AccessLobby resolution would create a second `persons` row for the same human. [OIDC Core §8](https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes), [Keycloak subject mapper](https://www.keycloak.org/docs/latest/server_admin/#pairwise-subject-identifier-mapper), [Keycloak token change notes](https://www.keycloak.org/docs/latest/upgrading/#_sub_claim_is_added_to_access_token_via_protocol_mapper).

## Decisions to record before implementation

1. Should the first external release use distinct pairwise sectors per publisher, or is there an approved reason to share a sector across related apps? How are publisher/domain changes handled without breaking an existing user's local link?
2. Which claims may an external app receive by default? Is email optional, and do organization IDs/names require a separate approval?
3. What are the exact consent, retention, withdrawal and incident/recovery requirements? Who owns the product consent record and who can approve sensitive scopes?
4. Which restricted-entry models are required first: person invitation, organization seats, purchased entitlement, or some combination? Who is authorized to administer each?
5. Are any publishers required to have a different issuer/keys for legal or operational isolation? If so, define the trust-domain criteria and an explicit migration path, rather than a realm-per-app rule.

After these answers, implement and test token claim isolation, durable internal-person resolution, the external self-scoped API, consent ledger, negative cross-client tests, client lifecycle and a real third-party pilot. Existing first-party clients and IDs must keep their current v0.1 meaning throughout the migration.
