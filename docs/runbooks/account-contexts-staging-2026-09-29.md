# Account contexts staging handoff — 2026-09-29

This is the immutable candidate for the first-party organization lifecycle (PR #37) and the read-only peer membership display (PR #38). It is **published, not deployed or accepted**. At 2026-09-29 10:47 UTC the public staging API still reported source `4debd6eaf154f82c82c20579c4fe08a89fb25c9e`. Keep the previous [branded IAM cutover record](auth-theme-staging-cutover-2026-09-28.md) and its manifest for comparison and rollback.

Source `2d35213d69170f3b0058ce590445517b18656d7e` passed [main CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36557269966) and [Keycloak theme qualification](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36557269970). The guarded [application publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36557445967) and [IAM publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36557464508) succeeded. The [release manifest](../../infra/releases/staging-2026-09-29-account-contexts.json) records this set:

| Dokploy value | Immutable reference |
|---|---|
| `GIT_SHA` | `2d35213d69170f3b0058ce590445517b18656d7e` |
| `IAM_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam@sha256:d5d84b326c43ba3d6a11e7494258e1329d3640598a4fb412bc22143931978626` |
| `IAM_GATEWAY_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:814a062fc9dca08778980fdd38722945143e18963e82bdbe5eeb7ed14526b049` |
| `API_IMAGE` | `ghcr.io/wb-devworld/accesslobby-api@sha256:a49d8baf8c1c708e74c93f6010cb7e9dbf88b754575d9fa2d967cb9e5c81b13c` |
| `WEB_IMAGE` | `ghcr.io/wb-devworld/accesslobby-web@sha256:d984655451919583f140b6e944b3265879d3b922f8d38b5c50a2f88be6eef2af` |
| Separate consumer `CONSUMER_IMAGE` | `ghcr.io/wb-devworld/accesslobby-reference-consumer@sha256:b26049960b16556539727aef9803eb24a833c0561f69d29582807fb526ae750b` |

## Operator sequence

1. In protected operator custody, record the actual current running images, database backup state and rollback path. Keep all environment exports, credentials, tokens, cookies, OIDC codes and person IDs out of the repository and shared reports. Confirm the staging issuer and both registered clients remain as intended.
2. Use `./compose.dokploy.yaml` from `main` for the existing AccessLobby staging Compose service. Set the five main-service values above together; both `iam` and `iam-config` consume `IAM_IMAGE`. Preserve current passwords, volumes, origins, client allowlist, registration/email/reset flags and private network topology. Review Dokploy's generated Compose preview for the domains and absence of database/Keycloak public targets. Migration 003 is additive; confirm `migrate` and `iam-config` complete successfully before checking API/web. Do not drop the new tables on rollback after real membership data is written.
3. In the separate consumer service, use `./compose.consumer.dokploy.yaml` from the same checkout and pin `CONSUMER_IMAGE` above. Preserve its origin, issuer, API URL, `reference-consumer` OIDC client and peer-local grant policy. With the grant fixture empty, organization selection must never make `/private` accessible.
4. Confirm actual running digest references through the private read-only inventory. This command does not request container environment variables; store its report in protected operator storage outside Git:

   ```sh
   python3 infra/scripts/inspect_staging_runtime.py \
     --main-project accesslobby-accesslobbystaging-beass9 \
     --consumer-project accesslobby-referenceconsumerstaging-yuxqwo \
     --manifest infra/releases/staging-2026-09-29-account-contexts.json \
     --output /var/tmp/accesslobby-account-contexts-runtime.json
   ```

5. Later, run the credential-free public preflight and the controlled [bulk staging acceptance matrix](bulk-staging-acceptance.md) as one account pass. Record categorical results and UTC times without account details. In particular, test owner transfer and last-owner protection, person-specific invitation acceptance, member removal, peer display context, the peer's separate local 403, and selected-context revocation/outage. A public API health SHA or a successful image pull does not establish those authenticated workflows.

   ```sh
   python3 infra/scripts/staging_preflight.py \
     --web-origin https://accesslobby.realjanelove.com \
     --api-origin https://api.accesslobby.realjanelove.com \
     --issuer https://iam.accesslobby.realjanelove.com/realms/accesslobby-first-party \
     --consumer-origin https://consumer.accesslobby.realjanelove.com \
     --expected-sha 2d35213d69170f3b0058ce590445517b18656d7e \
     --check-auth-pages --check-consumer-health --consumer-home-samples 5 \
     --output /var/tmp/accesslobby-account-contexts-public.json
   ```

The reference app retains its membership-check bearer only in server memory and does not refresh it. A selected organization becomes unavailable when that token expires; the person may explicitly return to personal context. The selected organization is a display choice, not a peer permission or a verified legal claim. Keep the backup/rollback, intermittent consumer availability and production gates in the earlier runbooks open until separately observed.
