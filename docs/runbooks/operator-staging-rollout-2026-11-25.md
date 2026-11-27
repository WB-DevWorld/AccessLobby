# Operator console staging rollout — 2026-11-25 UTC

**Deployment stage completed, 2026-11-27:** Cursor0d81d1f records source29292fbe API/web promotion, isolated restore comparison, migrations001–006/009–015, durable Dokploy pin correction and public/anonymous boundary checks. [Accepted evidence](../qa/operator-staging-2026-11-27/README.md). The later8aa3db2/3c7834b evidence confirms the real human and three active grants plus visible signed-in directory/audit reads; do not bootstrap again. The overview visibly remains on its loading state and needs worker-aware follow-up, independently of the private IAM certificate/access stage. Preserve the42users/3mappings observation, including unlinked local customer50. Retain the procedure below as the original rollout/recovery reference; accepted stages do not require repetition to refresh this summary.


The owner authorized integrating PR73 → PR75 → PR78 and proceeding to protected staging deployment/bootstrap. These merges are complete:78a3fb9ad7b6470d9eff90bfd5f443b34bcec14f,8d7fd911eb9916beb557de2cb67f7c7e4e268291,29292fbe80a99804eaf069144f9103b935902293. Every merge preserves its qualified head tree. The final source is29292fbe80a99804eaf069144f9103b935902293/tree656e12fb7064d71b3e8d228e01c9484e489421d1. [PR78](https://github.com/WB-DevWorld/AccessLobby/pull/78) passed15checks, including genuine private Keycloak admin login; main-merge CI/publication has its own verdict.

## Protected inputs

Use Cursor's existing authorized host route when the owner selects it. This ChatGPT workspace has no SSH agent/config/default private key or signed-in hosting-panel session; it cannot assume Cursor's Windows profile shares authentication with the separate cloud browser. Never request passwords, tokens, SMTP credentials or private keys in chat.

Privately establish the actual AccessLobby Compose project, generated Compose file(s), working directory, protected environment file, container IDs, current rollback pins and database inventory. Inspect selected Compose labels; do not print full container environments or protected files. The owner has multiple Dokploy installations, so identify this deployment by its actual canonical origins and service labels. Historical paths/names are discovery clues only.

Identify the intended existing human by an owner-confirmed durable AccessLobby UUID copied from that person's trusted signed-in account, then validate the existing active person through the protected identity store. Do not bootstrap the synthetic shared WordPress qualification identity, WordPress administrator77, an email match or the first registered person. Keep the operator UUID in protected execution evidence rather than this public release document.

## Preserve the accepted baseline

Training remains41users/3active mappings/hybrid/JIToff/enforcedoff with45/47/49, order50402/on-hold/owner45 and guest checkout on. Cursor6e4cb0f collision/new-registration evidence remains accepted. Staging/FLAIROC, plugin alpha.9, IAM SMTP587/STARTTLS, genuine verified-account states,300second tokens, duplicate-email policy and accepted logout delivery stay intact.

Promote only the qualified API and web image digests. Preserve current IAM, gateway, databases, reference consumer, volumes, issuer/audiences/allowlist, session secret and all other protected configuration. Broad Dokploy/Compose deployment can rerun iam-config and rewrite registration/verification/reset settings from environment defaults; use the bounded no-dependencies procedure below. Snapshot live realm flags separately from environment declarations without changing either. A new image being published is not authority to replace unrelated runtime pins.

## Recovery before migration

Record source/digests, schema and nonsecret inventories. Create fresh protected identity and IAM database backups using the established operator facility. Verify a restore in uniquely owned isolated PostgreSQL17.11 resources and compare relevant inventories. Archive listing alone does not establish restore success. Preserve encryption/realm/configuration recovery scope separately; never restore into the live databases as a test. Record timing and retained private backup references, without publishing credentials or SQL/customer data.

The API's complete manifest is001–006 and009–015.007/008 remain reserved. Migration015 backfills receipt handles and builds indexes; allow a short maintenance interval and ordinary database disk space. Migration013 renews eligible old pending unstamped approvals once while preserving active apps. The migrator executes the complete manifest in a single transaction. No down migration or casual old-image rollback is supplied: old APIs lack the new cutoff/generation enforcement after administrative operations. Prefer a compatible forward fix or a coordinated tested recovery that accounts for changes after cutover.

## Bounded API/web promotion

These are command shapes after privately discovering the actual inputs. Preserve the original generated configuration and environment privately. Fetch the exact qualified release source in an isolated checkout, keeping existing working trees and secret files intact. Pull the exact approved API/web digests before using --pull never. Update only API_IMAGE,WEB_IMAGE,GIT_SHA for this rollout in the actual effective deployment configuration and its durable Dokploy configuration, preserving its labels/routes/secret values. Do not assume editing an arbitrary checked-out YAML changes Dokploy's generated configuration.

```sh
docker compose -p "$AL_PROJECT" --env-file "$AL_ENV" \
  -f "$AL_GENERATED_COMPOSE" run --rm --no-deps -T migrate

docker exec "$AL_IDENTITY_DB_ID" psql -X \
  -U accesslobby -d accesslobby -Atc \
  'SELECT version FROM schema_migrations ORDER BY version'

docker compose -p "$AL_PROJECT" --env-file "$AL_ENV" \
  -f "$AL_GENERATED_COMPOSE" up -d --no-deps --pull never api
```

Require successful migration exit plus explicit001–006/009–015 readback before new API traffic. /health/ready checks database connectivity only; it does not certify schema. Verify API source29292fbe80a99804eaf069144f9103b935902293, live/ready, actual migrations and ordinary/unauthenticated boundaries. Then run the same bounded up command for web. Preserve SESSION_SECRET so unexpired web sessions remain readable. Verify actual runtime image readback, domains/proxy labels, compatible API/web, current issuer/keys and public IAM administration denial. Capture protected configuration drift/rollback status; do not silently leave Dokploy set to old pins that its next deployment would restore.

Run the existing credential-free staging_preflight.py with approved canonical web/API/issuer and expected source29292fbe80a99804eaf069144f9103b935902293. Supply actual current preserved IAM/gateway/consumer pins plus new API/web in the private five-image runtime manifest for inspect_staging_runtime.py. Keep missing historical iam-config completion records as explicit findings; do not rerun realm configuration to manufacture success. Record migration execution proof separately when a removed one-off migration container cannot supply long-lived inventory.

## Initial operator setup and acceptance

Before the grant, confirm the intended person's ordinary signed-in /admin access is denied. From the actual qualified API container's /app/apps/api working directory with its existing protected DATABASE_URL, grant only needed roles:

```text
node dist/manage-operator.js PERSON_UUID grant identity_operator STAGING-BOOTSTRAP-20261125
node dist/manage-operator.js PERSON_UUID grant application_reviewer STAGING-BOOTSTRAP-20261125
node dist/manage-operator.js PERSON_UUID grant application_operator STAGING-BOOTSTRAP-20261125
```

Those three include read access. A support-only person receives support_reader instead. Each role is independent and auditable. The protected CLI can revoke every role held if needed; no web role-grant endpoint exists. Retain independent protected host recovery. Role revocation/regrant changes generation bindings, so do not casually use an existing workflow reviewer as a test fixture.

Sign in as the confirmed human and open https://accesslobby.realjanelove.com/admin. Verify exact current capabilities, people/detail/recorded associations, organizations/members/invitations/history, existing app configuration/status and operator audit. Prove unauthenticated API401 and ordinary first-party403; exercise revoked-role denial only with an explicitly planned controlled account/route. Use separate approved fixtures for person/app/session mutations; preserve accepted WordPress identities/clients and customer records. Independent review remains required even when one human holds several operator roles. Record safe IDs/references/statuses/audits and separate PASS/FAIL/BLOCKED/NOTRUN; real client activation and consumer acceptance are distinct from an admin page loading.

## Private Keycloak route

Follow private-iam-console.md using the actual existing internal iam-edge and original trusted protected certificate/key files, exact canonical IAM origin and verified existing master administrator. Start only the separate companion. Preserve IAM/gateway networks/configuration and public admin/master404. Current source does not establish actual host PEM paths, SSH tunnel or master credentials.

The renderer checks actual trust/SAN/expiry/key match/permissions and rejects symlinks. Resolve approved paths privately to original files; never copy key material to Git/chat/workspace, dump environment/ACMEJSON or disable certificate validation. If only ACMEJSON is available, report that the current companion needs a compatible protected certificate facility; do not improvise a secret export. Confirm renewal ownership: atomic certificate replacement may require recreating only this companion after revalidation.

Require actual127.0.0.1 effective publication, own exclusive ingress bridge, unchanged IAM networks, read-only mounts, exact capabilities and Traefik opt-out. Use the exact-authority SSH/CONNECT transport in a dedicated administrator browser profile. Complete genuine existing master-admin login, visible Manage realms/Create realm and first-party Clients controls, logout, and separate normal-public issuer/JWKS200 plus admin/master/health/metrics404 before/after. Creating a realm or modifying accepted clients is outside this access qualification; routine apps retain the registry/proof/independent-review/private-worker workflow.

## Final evidence

Record exact deployment source/digests, database backup/isolated restore, migration readback, operator access/denial/audit, private TLS/admin/public-boundary observations, final runtime inventory and rollback/remaining blockers. Keep59/72/74/76 open for their remaining acceptance gates. No production, enforced WordPress migration or arbitrary external-publisher activation is included. A partial host/certificate/operator prerequisite never becomes an assumed PASS; continue independent authorized work.
