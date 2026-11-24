# External publisher boundary

Alpha.6 is the consolidated first-party release candidate. WordPress consumes the reviewed first-party AccessLobby contract; external publishers cannot activate or receive its universal identity data.

The closed consent/app-identity preview is preserved at PR61 commit3131df44bb7f6bb006a2dac6bcbac29591f288e9, described by ADR011/012. It is intentionally excluded from this release's runtime and migration list. No external profile/consent tables are created on a fresh database, no consent UI/CLI is exposed, and `/v1/preview` remains404 even if an obsolete preview environment flag is present. Existing preview data is not deleted when applying the first-party additive migrations.

The negative token-wide privacy tests remain: native pairwise subjects alone did not isolate cross-client session identifiers. Two unrelated sites must receive app-specific identifiers across tokens/userinfo/API/session surfaces while the internal durable Person remains singular. No email-based merge or fallback to universal identifiers is allowed.

Stage B still requires privacy-safe external token/API/session issuance, domain/publisher verification and safe provisioning, scopes/consent/retention/transfer policies, suspension/revocation and an independent external-like WordPress pilot. The preserved preview is a development foundation, not a working external OIDC service. WordPress never receives IAM administration privilege.
