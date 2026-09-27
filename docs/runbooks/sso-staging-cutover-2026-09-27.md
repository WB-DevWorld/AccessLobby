# SSO staging qualification — 2026-09-27

This is the evidence and operator handoff for the SSO implementation merged in PR #18, the UI foundation merged in PR #17, and the web-binding repair merged in PR #21. It is staging evidence, not production approval or named peer adoption. The AccessLobby staging panel is available only through the owner's private operator access; public checks cannot reveal its configured image digests, SMTP settings, migration state or Keycloak client configuration.

## Source and published artifacts

The staging API returned `68e2181dc012f903c8cb4e5b45750752bc9dd891` from both `/health/live` and `/health/ready` on 2026-09-27. That SHA is GitHub `main` and contains the SSO and UI commits. Main CI run [36354694001](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36354694001) and guarded image publisher run [36354794939](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36354794939) succeeded. The publisher recorded these immutable image references for **that source revision**:

| Dokploy variable | Published image reference |
|---|---|
| `API_IMAGE` | `ghcr.io/wb-devworld/accesslobby-api@sha256:2f022b2abe74b9dbb856bc06bee4885492dbfd9bc48935ca55d32a02c39d1e09` |
| `WEB_IMAGE` | `ghcr.io/wb-devworld/accesslobby-web@sha256:b1c38b0d7c460e6f70c208cbc640a48d01b0c3f21aa4b453b94501b5c9132df8` |
| `IAM_GATEWAY_IMAGE` | `ghcr.io/wb-devworld/accesslobby-iam-gateway@sha256:a2a654b2eaa40665123469704d43e8cf3a43d2299efc19846e195b0d3665d313` |
| Separate consumer `CONSUMER_IMAGE` | `ghcr.io/wb-devworld/accesslobby-reference-consumer@sha256:f2db4e79583911566166bc6b275c7c412a8301f6bea7a956f11b0db8d097e56d` |

The API version proves the running API source revision, but does **not** prove which digest the separate consumer or even the other three services currently use. Compare the protected Dokploy configuration and running containers with these references before recording a complete artifact match. Do not copy secrets or raw exports into Git or chat.

## Public checks completed after the web repair

| Check | Observed result |
|---|---|
| AccessLobby web `/` | `200` |
| API `/health/live`, `/health/ready` | `200`, `68e2181dc012f903c8cb4e5b45750752bc9dd891`; readiness `ready` |
| API `/v1/me` without a token | `401` |
| OIDC discovery and JWKS | `200`; exact staging issuer; two keys |
| Separate consumer `/`, `/private` without a session, invalid `/callback` | `200`, `401`, `400` respectively |
| Unregistered reference-consumer redirect at the issuer | `400` |
| Consumer `/login` | `303` to the staging issuer, `client_id=reference-consumer`, exact HTTPS `/callback` |
| Consumer `/register` | **`404` — staging blocker** |

The merged reference consumer implements `GET /register` and sends `prompt=create`. The public `404` means the deployed consumer path does not match that implementation. The live consumer has not yet passed the new-user entry check; its running image/version and routing must be inspected. Earlier browser qualification of the identity spine and reference consumer does not establish the new SSO join/link/logout behavior at this deployed revision. The owner's post-repair desktop/mobile screenshots and authenticated identity checks support the web UI and durable identity path, but do not replace the two-app acceptance matrix.

## Complete staging acceptance

1. Preserve the protected Dokploy environment, current exact image digests and realm/client exports for rollback. Inspect the running API, web, IAM gateway and separate consumer digests. Bring the consumer to the qualified digest above with the existing separate Compose service, after reviewing its Compose preview and DNS/TLS. Its sessions and account links are in memory and disappear on restart. Check `/register` now redirects to the issuer with `prompt=create`; keep `/`, `/private` and invalid callback checks passing.
2. Through the restricted operator channel, confirm migration `002_session_revocation` completed and verify the existing realm has working SMTP, registration enabled, email verification required, password reset enabled and duplicate emails disabled. The realm template import is create-only. Confirm the registered `accesslobby-web` backchannel URL points to `https://api.accesslobby.realjanelove.com/v1/backchannel-logout` and the consumer backchannel URL points to its `/backchannel-logout`; session ID is required. Check `ALLOWED_CLIENT_IDS` includes `accesslobby-web,reference-consumer` without removing other approved clients. Do not expose Keycloak administration publicly.
3. In a controlled staging browser, create a **new** user from the consumer, receive and complete email verification, return to the consumer and resolve the durable person ID. Use the protected legacy fixture to prove an **existing** peer account and AccessLobby sign-in before linking; retain its local ID. Repeat sign-in and verify the same durable person ID. Open both web and consumer in one browser and confirm the shared SSO session. Keep consumer `/private` at `403` for a signed-in person without a local grant.
4. Test **This app only** in each app: its local session ends, the other app remains signed in, and re-entry through the issuer works. Test **All connected apps** from each app: both participating app sessions become unusable, including when logout starts in the consumer. Verify a forged, replayed or wrong-audience logout token does not clear another session. This is the current browser session, not all devices; temporarily offline peers may retain local sessions until expiry.
5. Review web, API, IAM gateway, Keycloak and consumer logs and basic monitoring. Verify current scheduled control-plane and both database backups, and record the staging rollback rehearsal or its explicit outstanding state. Record source SHA, actual running digests, client registration representation hash and test outcomes without credentials, tokens, cookies or person IDs. Assemble a separate production Go/No-Go package; production needs its own issuer, databases, secrets and release decision.

Stop promotion if `/register` stays `404`, verification email fails, identity resolution fails, or either participating app remains usable after a successful all-apps logout. Preserve the current working identity spine while diagnosing the consumer. POII and DonLoft remain separate adoption milestones with persistent local mappings, actual account-proof flows and tested logout handlers.
