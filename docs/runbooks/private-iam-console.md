# Private Keycloak browser-console readiness

Prepared 2026-11-25. This runbook and its checker do not establish a deployed private console, authenticated IAM administration or permission to change the running realm. Coordinate any eventual IAM/proxy work after Cursor's active Forward Email configuration and WordPress qualification handoff. No live service, SMTP setting, credential or image pin was changed to prepare this material.

## Current repository facts

| Component | Current configuration and consequence |
|---|---|
| `iam` in `compose.dokploy.yaml` | Pinned `IAM_IMAGE`, `KC_HOSTNAME=${IAM_PUBLIC_ORIGIN}`, `KC_HTTP_ENABLED=true`, `KC_PROXY_HEADERS=xforwarded`; only container HTTP 8080 is exposed, with no host publication |
| IAM networks | Private `backend` and `iam-edge`, plus dedicated `iam-egress` for outbound delivery; IAM is not a Dokploy public domain target |
| `iam-gateway` | The public domain target on container port 8080; permits only `/realms/accesslobby-first-party/` and `/resources/`; unmatched paths return 404 |
| Public master/admin | `/admin/*` and `/realms/master/*` remain denied by the gateway |
| Admin hostname | No `KC_HOSTNAME_ADMIN` is configured in this Compose baseline |
| Engine source | `infra/keycloak/Dockerfile` pins Keycloak 26.7.4; runtime identity must still be read from the actual pinned deployment before use |

AccessLobby's product `/admin` on the web origin is a different interface from Keycloak's `/admin` on the IAM origin. An AccessLobby operator grant does not grant IAM realm administration. Keycloak's existing authorized IAM administrator account remains required.

The [official hostname guide](https://www.keycloak.org/server/hostname) explains that hostname settings determine generated addresses, rather than listener bindings. `hostname-admin` alone does not restrict the Admin REST API; the reverse proxy must enforce the boundary. The [official proxy guide](https://www.keycloak.org/server/reverseproxy) separates application HTTP/TLS ports from management port 9000 and requires trustworthy forwarded headers. The [Admin Console guide](https://www.keycloak.org/docs/latest/server_admin/index.html#using-the-admin-console) describes its administrator prerequisite and realm controls. Confirm actual 26.7.4 behavior through the protected fixture/browser route; current documentation alone is not a deployment result.

## Why a plain port-forward is insufficient

Forwarding an arbitrary localhost port directly to IAM HTTP 8080 can make the first HTML document reachable while its generated authentication, callback or asset addresses point elsewhere. In this deployment, a master-realm redirect to the normal public IAM origin reaches the gateway's deliberate 404. Loading a spinner or one console page does not prove that administrative login works.

The complete browser path must agree on origin, port, TLS trust, generated admin and master-realm authentication addresses, exact `security-admin-console` redirects and assets. A separate `hostname-admin` can still leave the master authentication origin on the public hostname. Inspect both `authServerUrl` and `authUrl` in the unauthenticated console environment and the master discovery document; do not silently broaden redirects or expose public master paths to repair it.

## Protected preflight before choosing a route

Use the already-established protected host/operator channel. Discover the actual Compose project and service container IDs; do not guess a historic container name. Preserve current source, image digests, networks, volumes and protected environment. Capture only selected non-secret hostname/proxy settings, not a raw `docker inspect` or environment dump.

1. Coordinate a quiet handoff with Cursor before any IAM recreation, hostname or proxy change. Cursor may be modifying realm SMTP through the private operator route.
2. Record the actual image digest, `KC_HOSTNAME`, any admin hostname, proxy-header mode and actual network attachments. Keep the current public issuer fixed at the exact approved `/realms/accesslobby-first-party` address.
3. Verify current backups and the existing recovery/rollback baseline. A console realm export is not a database backup. Preserve the active IAM database and volumes.
4. Inspect host listeners and Docker port publications. No route may add a wildcard host binding for the private admin proxy, expose `iam:8080`, publish management 9000, or attach IAM to the shared Dokploy proxy network.
5. Confirm a trusted certificate and its actual SANs, the protected certificate-file access route and renewal ownership. Do not export a private key into a workspace or Git. A self-signed certificate is not accepted by disabling verification; an explicitly approved private CA must be installed in the operator's trust store.
6. Confirm which existing IAM administrator can use the console and which realm privileges it holds. Do not reset the account, rotate credentials, use the first AccessLobby registrant or assign master administration to WordPress clients.
7. Record public first-party discovery/keys and public admin/master/health/metrics denial before any candidate route. Rerun those observations after the candidate is introduced and after its rollback.

Do not print host IPs, credentials, full inspection data, cookies, authorization codes, private keys or complete authenticated browser URLs into evidence.

## Minimal candidate with unchanged IAM hostname

This is a candidate for protected fixture/operator qualification, not an already deployed route. It avoids changing the running IAM hostname or realm while Cursor's mail work is active.

| Layer | Required candidate behavior |
|---|---|
| Dedicated private proxy | A proposed `iam-admin-private` service, separate and pinned, on `iam-edge`, using its own reviewed TLS configuration; publish only `127.0.0.1:9443:8443` on the host, with no Dokploy public domain label |
| Upstream | Proxy to the existing `iam:8080`; overwrite Host and X-Forwarded-Host with the existing canonical IAM hostname, scheme HTTPS and canonical external port 443; remove untrusted Forwarded/prefix headers |
| Private allowed paths | Administrative console/API, master-realm authentication/discovery and required resources only; use normalized upstream URI forwarding as the current gateway does, and deny management and unrelated routes. The existing public `iam-gateway` stays unchanged |
| TLS identity | Existing canonical IAM certificate or separately approved matching certificate, mounted read-only from the protected certificate route; certificate verification and renewal remain intact |
| Workstation tunnel | Loopback-only SSH forwarding to that host-private proxy; canonical hostname and external port must remain consistent for the browser's complete flow |
| Browser | A dedicated administrator profile and a reviewed private name-resolution/proxy mapping, so every canonical IAM request in that profile traverses the tunnel rather than public DNS |

For a canonical origin on port 443, a possible forwarding shape is:

```text
ssh -N -L 127.0.0.1:443:127.0.0.1:9443 APPROVED_OPERATOR_HOST
```

This is a shape to review after the actual SSH identity/host and listener are known. It is not an executed command or an instruction to replace a current listener. Binding local 443 may need workstation privileges and may already be occupied. If it is unavailable, do not substitute a random browser port while assuming generated canonical redirects will follow it. The operator must choose and qualify an alternative.

Keep private canonical hostname mapping limited to the dedicated admin workstation/profile. Other browsers and connected applications retain normal public DNS, the original issuer and the restricted public gateway. The private proxy's loopback port protects network reachability; possession of the existing authorized IAM credentials still protects administrative actions. Inspect both protections independently.

A different private admin hostname is another design option. It requires an explicit `KC_HOSTNAME_ADMIN`/master-authentication/client-redirect and trusted-proxy review, full callback testing, and potentially IAM recreation. A master frontend-URL override can affect private CLI authentication and admin API audiences. Do not apply that route opportunistically during SMTP work or declare `hostname-admin` alone sufficient. First-party issuer and existing peer clients must remain unchanged.

The repository's current runtime inventory policy expects no host-published IAM port. A candidate **new private proxy service** needs explicit inventory-policy review; it must never be mistaken for publishing `iam` itself or suppressing an unexpected public binding. No Compose or inventory exception is introduced by this runbook.

## Read-only checker

The prepared checker accepts an exact approved private HTTPS origin, the local tunnel IP and the pinned public first-party issuer. The private origin may contain a DNS name: TCP is forcibly connected to the supplied loopback IP, while the URL's Host header, SNI and certificate hostname verification are preserved. A public/private remote IP is rejected as the private connection target. Public issuer and denial checks use a separate normal HTTPS connection.

```text
python3 infra/scripts/private-iam-console-check.py \
  --private-origin https://APPROVED_CANONICAL_IAM_HOST \
  --connect-loopback 127.0.0.1 \
  --public-issuer https://APPROVED_PUBLIC_IAM_HOST/realms/accesslobby-first-party \
  --output artifacts/private-iam-console/readiness.json
```

For an approved private CA, use `--ca-file APPROVED_CA_BUNDLE`. It supplies trust; hostname and certificate validation remain enabled. Inputs contain no credential, cookie, token or authentication query. The checker has no credential parameter, follows no authentication flow and executes no JavaScript or form submission.

The checker assesses:

- Exact public issuer metadata and same-realm endpoint origins.
- Continued 404 responses for the public admin root, master console/realm, health and metrics paths.
- The loopback-pinned private master console document, expected `security-admin-console` environment and private admin/authentication references.
- Private master discovery metadata, without requesting its login/authentication endpoint.
- At most four referenced JS/CSS assets on the private origin, with verified TLS and bounded bodies.

An OIDC redirect to public master is classified without following or logging its transient query. Arbitrary origins, unsafe references, insecure schemes, excessive bodies, untrusted TLS and unexpected environment data fail closed. Output contains categorical checks/statuses rather than target addresses, response bodies, cookies, usernames or exception strings. It always reports `authenticatedConsoleQualified:false` and `loginAttempted:false`. An overall deadline and bounded per-request timeout prevent indefinite probing.

`passed:true` means these credential-free routing prerequisites passed. It does not prove the host listener is private from every network, browser name resolution, every lazy-loaded asset, IAM permissions, successful login, writes or recovery. Those remain protected acceptance steps. A blank/changed console environment fails as unconfirmed rather than inventing compatibility with an unknown Keycloak build.

## Authenticated acceptance and rollback gate

After the protected candidate and checker pass, an authorized human must verify the real browser login, realm selection, expected realm-creation/client controls and sign-out in that dedicated profile. Use read-only views first; do not create a realm, mutate a client or send verification mail merely to prove the menu is present. Check every auth redirect, console API and required asset stays on its intended approved route with trusted TLS. Keep secrets and session material out of screenshots and evidence.

Repeat first-party discovery/JWKS, actual consumer sign-in/logout and the public denials. Verify that SMTP configuration and delivery are unchanged by the private access work, and that the existing private metadata/provisioning helpers still work. Record exact source, image digests, hostname/proxy settings categorically, listener/network evidence, UTC time, browser version, acceptance result and remaining limits.

Rollback removes only the newly qualified private proxy/tunnel/profile mapping and its dedicated configuration. Preserve IAM, databases, volumes, image pins, public gateway and realm SMTP. If a separate-hostname option was explicitly approved later, its exact recorded configuration must be restored before recreation and requalification. Do not delete realms, reimport the existing realm, reset credentials or redeploy unrelated services to close a browser-access test.

Until this protected authenticated gate completes, the valid status remains **private browser console NOT QUALIFIED**. Existing private CLI administration remains the current operator route.
