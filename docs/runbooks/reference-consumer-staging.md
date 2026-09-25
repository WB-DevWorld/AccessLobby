# Separate reference consumer in staging

This example is an independent OIDC client and deployment. It uses its own session and local resource policy. It is a conformance fixture, not a production peer application. Keep `GRANTED_PERSON_IDS` empty for the denial test; sessions and grants are in memory and disappear on restart.

## Prepare the exact client and image

1. After this change merges, wait for successful main CI and the guarded image publisher. Record the main commit and the **reference consumer** `ghcr.io/wb-devworld/accesslobby-reference-consumer@sha256:...` reference from that publisher. Do not use an unqualified tag.
2. Create DNS and a valid HTTPS certificate for a fourth staging origin, for example `https://consumer.accesslobby.realjanelove.com`. Verify the exact origin before client registration. This origin belongs to the consumer service and is distinct from the AccessLobby web origin.
3. Render the reviewed client representation for the existing staging realm:

   ```sh
   python3 infra/scripts/render-client.py \
     --client-id reference-consumer \
     --redirect-uri https://consumer.accesslobby.realjanelove.com/callback \
     --logout-uri https://consumer.accesslobby.realjanelove.com/ \
     --output /root/reference-consumer-staging.json
   ```

   Run this with the repository checkout on the operator host. Keep the generated environment configuration in protected operator storage, not Git. Inspect the JSON for `publicClient`, code flow, PKCE S256, exact callback/logout URLs and the `accesslobby-api` audience mapper. Through the restricted Keycloak container CLI, confirm `reference-consumer` does not already exist and create it once in `accesslobby-first-party`. The initial realm import is create-only and will not register later clients. Do not expose the Keycloak admin route publicly.
4. In the existing AccessLobby staging Compose service, set `ALLOWED_CLIENT_IDS=accesslobby-web,reference-consumer` while preserving any other authorized IDs. Redeploy that service and confirm `/health/ready` returns 200 and the existing web login still works. This allowlist permits token resolution; it grants no consumer resource access.

## Deploy in a separate Dokploy Compose service

1. Create a **new** staging Docker Compose service from the same repository, branch `main`, Compose Path `./compose.consumer.dokploy.yaml`, with autodeploy off. Configure GHCR read access as for the AccessLobby service. Set `CONSUMER_IMAGE` to the qualified digest, `CONSUMER_ORIGIN` to the exact HTTPS consumer origin, `OIDC_ISSUER` to the exact staging realm issuer, and `ACCESSLOBBY_API_URL` to the public HTTPS staging API origin. The Compose file fixes `OIDC_CLIENT_ID=reference-consumer`, `PORT=4000` and defaults `GRANTED_PERSON_IDS` to empty.
2. Add the HTTPS domain to the **consumer** service on container port `4000`, path `/`, with no strip path. Review the generated Compose preview: only the consumer may receive this domain, and there must be no published host port. The consumer connects to OIDC and the API through their public HTTPS endpoints; it needs no database network or credentials. Deploy after the certificate is available.
3. Check `/` returns 200, `/private` returns 401 before sign-in, and `/callback?state=invalid&code=invalid` returns 400. Verify that `/login` redirects to the staging issuer with `client_id=reference-consumer` and the exact consumer callback. A browser sign-in with the controlled pilot should resolve the same AccessLobby person ID as the web client. After sign-in, `/private` must return 403 while grants are empty. Sign out, confirm the consumer session clears, and sign in again. Test an unregistered callback separately; Keycloak should reject it with 400.
4. Record the commit, consumer image digest, client registration representation hash, API health/version, browser result, 401/403/400 checks and logout/re-entry outcome without tokens, session cookies or personal identifiers. If any check fails, stop promotion and inspect the consumer and issuer logs through private operator access. The reference consumer does not establish POII or DonLoft adoption.

Removing the new consumer service leaves the AccessLobby staging application available. If reverting registration, remove its API allowlist entry and Keycloak client through the restricted admin path after ending the pilot; keep the existing `accesslobby-web` registration.
