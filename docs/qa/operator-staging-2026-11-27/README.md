# Operator staging rollout — 27 November 2026

**Latest visible check:** [5f6008d](https://github.com/WB-DevWorld/AccessLobby/commit/5f6008d487f0f17a13a0edd17d8c2342e9e4874c) supersedes the signed-out blocker below. The confirmed owner was signed in at16:35:04UTC, but at16:37:04UTC the normal worker-controlled admin hard reload still showed its1032×708loading region. All three capability sentences and the14people/2organizations/5applications/3bootstrap-audit rows existed in zero-size hidden elements. No script or stylesheet request failed, no later console exception was captured after inspection began, and the page had not returned to sign-in. Visible acceptance remains blocked. Window visibility/focus, initial reveal execution and its pending frame queue were not recorded; the exact browser cause is not established.

**Latest rollout:** [ba39cd8](https://github.com/WB-DevWorld/AccessLobby/commit/ba39cd813f96d0bc1f297fb8e51180a05b83566b) records the qualified `c4206d9a` API/web digests running, matching effective/durable pins, health source and the normal home → Update now worker upgrade. The worker is activated, a following update has no waiting/installing worker, `/sw.js` is no-store and `/admin` is private/no-store. Anonymous administrative API access remains401. The Edge profile is signed out: visible signed-in overview/capability/navigation/audit acceptance awaits a fresh owner session with this worker retained. No migration or role regrant occurred; IAM, gateway, session secret,300second tokens and WordPress remain preserved. A cache-name inspection timed out and is not treated as proof. The structured `workerReleaseFollowup` retains this source-attributed observation; earlier rollout sections below remain dated history.

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
| Administrative web document | Initial anonymous `200` was only a shell; later signed-in HTML contains all three capabilities, but the visible overview remains on its loading state |
| Human operator | Later private confirmation and three active grants accepted under `OWNER-BOOTSTRAP-20261127`; signed-in directories and grant history rendered |
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

- Complete visible overview acceptance with an active worker and a fresh session; the human identity, three grants and visible directory/audit reads are already established.
- Complete the remaining applicable live denial/revocation and administrative workflow checks with separate controlled fixtures.
- Establish the protected certificate facility and qualify the actual private Keycloak route.
- Complete the applicable live worker, controlled administrative mutation and consumer checks.

An anonymous API `401` and a web-shell `200` do not establish those remaining cases. Issues 59, 72, 74 and 76 stay open. The actual human was confirmed privately; the synthetic WordPress identity, an email match or a WordPress administrator name was not substituted.

[Earlier operator confirmation](https://github.com/WB-DevWorld/AccessLobby/commit/f88b36f09a750411744aede20ea0d5ae0a417862) establishes that Jane’s accepted registration used a targeted verification send. Fully unassisted public verification remains unqualified. This rollout does not change that policy or repeat the accepted mail and WordPress tests.

## Human access follow-up and visible overview defect

Remote evidence [8aa3db2](https://github.com/WB-DevWorld/AccessLobby/commit/8aa3db23ec8e90594620b8ef9836079ec0c03d32) and [3c7834b](https://github.com/WB-DevWorld/AccessLobby/commit/3c7834b34be189714dc4b31a8dfa8172d3e7fbc5) supersedes the initial “owner ID pending” state. The confirmed active person initially had no operator roles. Private tooling granted `identity_operator`, `application_reviewer` and `application_operator` at 14:17:39.880148, 14:17:40.083729 and 14:17:40.273274 UTC respectively, all under `OWNER-BOOTSTRAP-20261127`. Readback found all three active. The person identifier remains private.

After the owner signed in, their account showed signed-in status. People visibly rendered 14 active identities; organizations rendered two active organizations with their membership counts; applications rendered the five registered applications. Audit rendered the three bootstrap grants attributed to private tooling. The `/admin` document contained all three expected capability sentences, but its visible overview remained “Checking operator access…” while a worker controlled that tab. This accepts the recorded directory/audit reads and grants, not the stuck overview.

The later reload bypassing the worker returned the sign-in page. No actual token-expiry timestamp was retained for that reload. With the unchanged 300-second token lifetime, this observation cannot distinguish expected expiry from a worker-related failure. It does not justify extending sessions, bypassing authorization or clearing browser storage.

The integrator reproduced and fixed a concrete optional-cache failure separately: rejected cache reads/writes prevented good JavaScript/CSS responses from reaching the browser, and a pending write delayed delivery. Healthy worker-controlled overview navigation already passed before the fix. The exact staging loading phenotype was **not** reproduced. [Local baseline/fix evidence and limits](../operator-worker-resilience-2026-11-27/README.md) record the distinction. Actual staging requalification remains required.
