# Operator staging rollout — 27 November 2026

The integrator retrieved [Cursor’s rollout evidence](https://github.com/WB-DevWorld/AccessLobby/commit/0d81d1f8a19a1dcaeb1bd7fc89552e8015d508e8), confirmed it on the remote qualification branch, and compared it with the qualified release manifest. This is a review of committed observations from the protected host. The integrator did not repeat live tests, inspect private dumps or change the deployment. [Structured observations](operator-followup.json) retain the source, image digests, counts and acceptance boundaries.

| Area | Accepted observation |
|---|---|
| Application runtime | API and web run release `29292fbe80a99804eaf069144f9103b935902293` at the exact qualified digests |
| Recovery rehearsal | Fresh custom-format identity and IAM dumps were restored into isolated PostgreSQL 17.11; schema and count comparisons matched; the temporary instance was removed |
| Migrations | Execution succeeded and versions `001–006` and `009–015` were read back; `007/008` are absent |
| Durable hosting configuration | Only `API_IMAGE`, `WEB_IMAGE` and `GIT_SHA` were corrected in Dokploy’s encrypted record to match the effective release pins |
| Preserved IAM and gateway | Existing image pins and container identities were retained |
| Public boundary | Web, API, discovery, JWKS and IAM gateway denials passed at 13:49:11 UTC |
| Anonymous administrative API | `GET /v1/admin/access` returned `401 unauthorized` |
| Administrative web document | `/admin` returned a `200` page shell; signed-in operator authorization remains untested |
| Human operator | No grant was made; the owner’s confirmed AccessLobby ID is still required |
| Private Keycloak browser | The companion was not started; a compatible protected certificate facility remains blocked; no certificate material was exported |

## Runtime and recovery

The operator’s API and web readbacks match the [immutable release manifest](../../releases/operator-console-staging-2026-11-25.json). The preserved IAM and gateway digests are recorded in the structured observations.

The isolated restore compared the original schema, versions `001–006`, and these inventories:

| Database | Matched counts |
|---|---|
| AccessLobby identity | 14 people, 5 applications, 2 organizations, 5 memberships and 9 receipts |
| IAM | 2 realms, 15 users and 20 clients |

The identity dump was 38,747 bytes and the IAM dump was 265,151 bytes. Neither was restored over a live database. The reported identity counts after rollout remain 14 people, 5 applications and 2 organizations. This rehearsal establishes the recorded database restore comparison; complete disaster recovery and scheduled-backup execution retain their separate evidence requirements.

## Dokploy configuration correction

The encrypted Dokploy record had lagged behind the effective runtime: it still contained source prefix `3d9220a140d6`, API digest prefix `c0e725da9b31` and web digest prefix `23dcf4b79da8`. These prefixes describe historical drift and cannot serve as rollback image references.

The operator used Dokploy’s encryption mechanism to update only `API_IMAGE`, `WEB_IMAGE` and `GIT_SHA`. IAM and gateway already matched, and other stored settings were preserved. Effective and stored release pins now agree.

SMTP remains `smtp.forwardemail.net:587`, with authentication and STARTTLS enabled, implicit SSL disabled and an existing password present. Realm-wide verification remains off, duplicate emails remain disallowed and access tokens retain their 300-second lifetime. Credentials and private encryption material are excluded from this evidence.

The three public domains use Let’s Encrypt. A compatible protected certificate-file facility for the private companion has not been established. No ACME store or certificate key was exported.

## Training user count

Training remains on plugin `0.1.0-alpha.9`, hybrid mode, JIT off and enforced mode off. Its three accepted mappings still belong to local users 45, 47 and 49. Order 50402 remains on-hold for customer 45, and guest checkout remains on.

The observed total is now **42 users**. Local customer 50 registered at 13:37:56 UTC, outside this deployment, and has no AccessLobby link. Preserve that account. The earlier 41-user Jane qualification remains a dated test result; the new total does not establish additional AccessLobby provisioning.

## Remaining acceptance

The API/web deployment, recorded restore rehearsal, migrations, durable pins and public boundary checks are accepted within this evidence’s scope. Full operator staging qualification remains pending:

- Confirm the intended real human’s AccessLobby ID and grant the required roles privately.
- Complete signed-in console access, capability, denial and audit checks.
- Establish the protected certificate facility and qualify the actual private Keycloak route.
- Complete the applicable live worker, controlled administrative mutation and consumer checks.

An anonymous API `401` and a web-shell `200` do not establish those remaining cases. Issues 59, 72, 74 and 76 stay open. The synthetic WordPress identity, an email match or a WordPress administrator name cannot identify the initial human operator.

[Earlier operator confirmation](https://github.com/WB-DevWorld/AccessLobby/commit/f88b36f09a750411744aede20ea0d5ae0a417862) establishes that Jane’s accepted registration used a targeted verification send. Fully unassisted public verification remains unqualified. This rollout does not change that policy or repeat the accepted mail and WordPress tests.
