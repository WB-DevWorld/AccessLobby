# External publisher boundary

This package currently consumes the reviewed first-party contract. Arbitrary external activation is closed. It does not label a first-party WordPress ZIP as universal external support, and it does not let WordPress administer Keycloak.

The existing `docs/external-app-contract-decision.md` identifies two concrete hazards: `/v1/me` and first-party tokens can expose universal identifiers, and changing Keycloak token `sub` without an internal link strategy causes `PostgresIdentityStore` to create another person. Changing only a response field does not fix either hazard. Token/userinfo/session identifiers and membership endpoints require a joint privacy review.

The next isolated external increment must establish a versioned app-scoped identity/entry contract and separate API audience; preserve the internal durable person; restrict token, userinfo and API claims; scope OIDC subjects/session identifiers per unrelated publisher/site; record opt-in claims/consent and withdrawal; verify publisher/site/domain and exact routes; implement suspension/revocation and transfer/retention policy; and exercise an independent external-like pilot. Two unrelated clients must receive no correlatable global identity while resolving internally to the same person. Negative cross-client tests are mandatory.

Safe provisional pilot choices to evaluate: distinct site/client sector, minimal sign-in claims, email/profile only by explicit scope approval, no organization projection by default, no shared sector across unrelated publishers, no public IAM administration and no production activation before joint token/internal-person tests. These are implementation proposals, not a claim of completed consent/legal policy or external onboarding.

The first-party identity adapter boundary can later receive a versioned external adapter. Do not reuse its universal identity API for external clients and do not fall back from a failed external privacy path to first-party claims. No external server migration/API or consent ledger was implemented in this checkpoint.
