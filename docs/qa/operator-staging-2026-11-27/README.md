# Operator staging rollout — 27–28 November 2026

**Latest accepted rollout and visible reads — 28 November:** committed observations [d8ebd66](https://github.com/WB-DevWorld/AccessLobby/commit/d8ebd66a95d18903f3ff8caae405a4db6233b79c) and [65bedeb](https://github.com/WB-DevWorld/AccessLobby/commit/65bedeb65b945f456229a7d79aaab6c5b09b6bab) confirm source `713140ad93ba1ade406ec6af4cfffb052a817a9c` running at the exact API `d8147b06…` and web `5319c727…` digests in [the immutable release manifest](../../releases/operator-rendering-copy-staging-2026-11-27.json). Live/ready source, runtime images and effective/durable pins match. Only API and web were recreated; no migration or operator regrant ran. The normal **Update now** flow activated the matching published worker.

From **11:21:16 to 11:21:52 UTC**, the confirmed owner visibly used the console with that worker active and no waiting worker. All three capability sentences were visible with recorded 1152×26 boxes. A normal hard reload and People → Overview navigation passed. The recorded tables were visible:

| View | Records | Visible box |
|---|---|---|
| People | 14 active people | 1150×743 |
| Organizations | 2 organizations | 1150×190 |
| Organization members | 2 member rows | 1101×192 |
| Applications | 5 applications | 1150×649 |
| Operator history | 3 bootstrap grants | 1150×327 |

The realm explanation remained closed, with its summary and action consequence visible. No JavaScript or stylesheet request failed. The owner's identifier remains private. These observations accept the selected rollout and actual signed-in visible reads; they do not establish the remaining administrative mutation, private-worker, private Keycloak or production gates. **Full operator staging qualification remains false.** The private IAM companion has not started.

The pre-deployment tab was an account page rather than the previously stuck admin page. Its reveal queue was empty and a shell-frame timestamp was recorded. That observation cannot establish the exact cause of the earlier live rendering failure. The source-backed deferred-frame reproduction and the actual successful post-deployment reads remain distinct evidence.

The integrator reviewed committed protected-host/browser observations and reconciled them here without repeating live tests or changing the deployment. The dated original observations remain below; `renderingReleaseFollowup` in [the structured record](operator-followup.json) is the latest accepted observation.

## Dated rollout history — 27 November

[5f6008d](https://github.com/WB-DevWorld/AccessLobby/commit/5f6008d487f0f17a13a0edd17d8c2342e9e4874c) superseded the earlier signed-out blocker: the confirmed owner was signed in at 16:35:04 UTC, but at 16:37:04 UTC the normal worker-controlled admin hard reload still showed its 1032×708 loading region. The three capabilities and the 14 people/2 organizations/5 applications/3 bootstrap-audit rows were present in zero-size hidden elements. No script/style request failed and no later exception was captured after inspection started. Visibility/focus, initial reveal execution and the pending frame queue were not recorded. Visible acceptance was blocked at that checkpoint; the exact live cause was not established.

[ba39cd8](https://github.com/WB-DevWorld/AccessLobby/commit/ba39cd813f96d0bc1f297fb8e51180a05b83566b) had already recorded the qualified `c4206d9a` API/web digests, matching effective/durable pins, health source and normal home → Update now worker upgrade. The activated worker had no following waiting/installing worker, `/sw.js` was no-store and `/admin` was private/no-store. Anonymous administrative API access remained 401. That checkpoint's Edge profile was signed out, so signed-in visual acceptance awaited a fresh session. No migration or regrant ran; IAM, gateway, session secret, 300-second tokens and WordPress were preserved. A timed-out cache-name inspection was not evidence. These are retained historical results, superseded for current rollout/visible-read status by 28 November above.

For the initial 27 November deployment, the integrator retrieved [Cursor’s rollout evidence](https://github.com/WB-DevWorld/AccessLobby/commit/0d81d1f8a19a1dcaeb1bd7fc89552e8015d508e8), confirmed it on the remote qualification branch, and compared it with the qualified release manifest. This is a review of committed observations from the protected host. The integrator did not repeat live tests, inspect private dumps or change the deployment. [Structured observations](operator-followup.json) retain the source, image digests, counts and acceptance boundaries.

| Area | Initial 27 November observation |
|---|---|
| Application runtime | API and web run release `29292fbe80a99804eaf069144f9103b935902293` at the exact qualified digests |
| Recovery rehearsal | Fresh custom-format identity and IAM dumps were restored into isolated PostgreSQL 17.11; schema and count comparisons matched; the temporary instance was removed |
| Migrations | Execution succeeded and versions `001–006` and `009–015` were read back; `007/008` are absent |
| Durable hosting configuration | Only `API_IMAGE`, `WEB_IMAGE` and `GIT_SHA` were corrected in Dokploy’s encrypted record to match the effective release pins |
| Preserved IAM and gateway | Existing image pins and container identities were retained |
| Public boundary | Web, API, discovery, JWKS and IAM gateway denials passed at 13:49:11 UTC |
| Anonymous administrative API | `GET /v1/admin/access` returned `401 unauthorized` |
| Administrative web document | Initial anonymous `200` was only a shell; later signed-in HTML contained all three capabilities, but the overview was still loading at that checkpoint |
| Human operator | Later private confirmation and three active grants accepted under `OWNER-BOOTSTRAP-20261127`; signed-in directories and grant history rendered |
| Private Keycloak browser | The companion was not started; a compatible protected certificate facility remains blocked; no certificate material was exported |

## Runtime and recovery — 27 November

The operator’s API and web readbacks match the [immutable release manifest](../../releases/operator-console-staging-2026-11-25.json). The preserved IAM and gateway digests are recorded in the structured observations.

The isolated restore compared the original schema, versions `001–006`, and these inventories:

| Database | Matched counts |
|---|---|
| AccessLobby identity | 14 people, 5 applications, 2 organizations, 5 memberships and 9 receipts |
| IAM | 2 realms, 15 users and 20 clients |

The identity dump was 38,747 bytes and the IAM dump was 265,151 bytes. Neither was restored over a live database. The reported identity counts after rollout remain 14 people, 5 applications and 2 organizations. This rehearsal establishes the recorded database restore comparison; complete disaster recovery and scheduled-backup execution retain their separate evidence requirements.

## Dokploy configuration correction — 27 November

The encrypted Dokploy record had lagged behind the effective runtime: it still contained source prefix `3d9220a140d6`, API digest prefix `c0e725da9b31` and web digest prefix `23dcf4b79da8`. These prefixes describe historical drift and cannot serve as rollback image references.

The operator used Dokploy’s encryption mechanism to update only `API_IMAGE`, `WEB_IMAGE` and `GIT_SHA`. IAM and gateway already matched, and other stored settings were preserved. Effective and stored release pins now agree.

SMTP remains `smtp.forwardemail.net:587`, with authentication and STARTTLS enabled, implicit SSL disabled and an existing password present. Realm-wide verification remains off, duplicate emails remain disallowed and access tokens retain their 300-second lifetime. Credentials and private encryption material are excluded from this evidence.

The three public domains use Let’s Encrypt. A compatible protected certificate-file facility for the private companion has not been established. No ACME store or certificate key was exported.

## Training user count — 27 November observation

Training remains on plugin `0.1.0-alpha.9`, hybrid mode, JIT off and enforced mode off. Its three accepted mappings still belong to local users 45, 47 and 49. Order 50402 remains on-hold for customer 45, and guest checkout remains on.

At that observation, the total was **42 users**. Local customer 50 registered at 13:37:56 UTC, outside this deployment, and has no AccessLobby link. Preserve that account. The earlier 41-user Jane qualification remains a dated test result; the new total does not establish additional AccessLobby provisioning.

## Remaining acceptance

The selected `713140ad` API/web rollout, durable pins, activated matching worker and signed-in visible overview/directory/audit reads are accepted. The earlier restore rehearsal and migration readback remain accepted within their dated scope. Full operator staging qualification remains false because separate live gates remain:

- Complete applicable denial/revocation cases using separate controlled fixtures.
- Qualify the remaining controlled administrative mutations, private activation worker and consumer checks.
- Establish the protected certificate facility and qualify the actual private Keycloak route; the companion has not started.
- Complete the remaining operational and production-release gates under their own evidence requirements.

Do not repeat the accepted rollout, bootstrap, normal worker update or visible read flows merely to fill these unrelated gates. Issues 59, 72, 74 and 76 stay open for their remaining scope. The owner was confirmed privately; no synthetic identity, email match or WordPress administrator name was substituted.

[Earlier operator confirmation](https://github.com/WB-DevWorld/AccessLobby/commit/f88b36f09a750411744aede20ea0d5ae0a417862) establishes that Jane’s accepted registration used a targeted verification send. Fully unassisted public verification remains unqualified. This rollout does not change that policy or repeat the accepted mail and WordPress tests.

## Human access follow-up and visible overview defect — 27 November

Remote evidence [8aa3db2](https://github.com/WB-DevWorld/AccessLobby/commit/8aa3db23ec8e90594620b8ef9836079ec0c03d32) and [3c7834b](https://github.com/WB-DevWorld/AccessLobby/commit/3c7834b34be189714dc4b31a8dfa8172d3e7fbc5) supersedes the initial “owner ID pending” state. The confirmed active person initially had no operator roles. Private tooling granted `identity_operator`, `application_reviewer` and `application_operator` at 14:17:39.880148, 14:17:40.083729 and 14:17:40.273274 UTC respectively, all under `OWNER-BOOTSTRAP-20261127`. Readback found all three active. The person identifier remains private.

After the owner signed in, their account showed signed-in status. People visibly rendered 14 active identities; organizations rendered two active organizations with their membership counts; applications rendered the five registered applications. Audit rendered the three bootstrap grants attributed to private tooling. The `/admin` document contained all three expected capability sentences, but its visible overview remained “Checking operator access…” while a worker controlled that tab. This accepts the recorded directory/audit reads and grants, not the stuck overview.

The later reload bypassing the worker returned the sign-in page. No actual token-expiry timestamp was retained for that reload. With the unchanged 300-second token lifetime, this observation cannot distinguish expected expiry from a worker-related failure. It does not justify extending sessions, bypassing authorization or clearing browser storage.

The integrator reproduced and fixed a concrete optional-cache failure separately: rejected cache reads/writes prevented good JavaScript/CSS responses from reaching the browser, and a pending write delayed delivery. Healthy worker-controlled overview navigation already passed before the fix. The exact staging loading phenotype was **not** reproduced. [Local baseline/fix evidence and limits](../operator-worker-resilience-2026-11-27/README.md) record the distinction. The 28 November observation above completes visible-read requalification on the selected rendering release. It does not establish the exact cause of the earlier live failure or close the other operator gates.
