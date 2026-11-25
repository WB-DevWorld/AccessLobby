# Private Keycloak browser-console package

Prepared 2026-11-25. Round three supplies an executable optional private proxy, a workstation tunnel helper and disposable native acceptance. **The package is implemented; the actual staging browser route is not deployed or qualified by this document.** Local unit tests pass; native Docker/browser qualification has its own CI result. Coordinate protected installation after Cursor's Forward Email/WordPress handoff. This work changes no live service, realm SMTP, credential, issuer or production image pin.

Keycloak is where an authorized IAM operator finds **Manage realms → Create realm**, and, after selecting the existing first-party realm, **Clients → Create client**, client callbacks, scopes, credentials and sessions. The AccessLobby product console on the web origin handles its own people, organizations and reviewed application requests; its roles do not grant Keycloak authority. First-party applications normally become clients in the existing first-party realm. Availability of Create realm is not AccessLobby support for arbitrary multi-realm customers. Follow the reviewed AccessLobby app-provisioning workflow so Keycloak and the application registry remain consistent.

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

## Implemented optional companion with unchanged IAM hostname

`infra/private-iam/render.py` generates a separate Compose package; `infra/private-iam/connect-proxy.mjs` provides a single-authority workstation connection. Neither deploys or changes IAM automatically. This bounded package uses an **existing master-realm administrator** at `/admin/master/console/`. Realm-local first-party administrator authentication is not included: the private proxy allows master authentication only. Use a dedicated administrator browser profile; ordinary first-party user authentication stays in the normal public browser profile.

| Layer | Required candidate behavior |
|---|---|
| Dedicated private proxy | Generated `iam-admin-private`, on the exact inspected existing internal Compose `iam-edge`; publish only `127.0.0.1:9443:8443`, with no public domain label |
| Upstream | Existing `iam:8080`; fixed canonical Host, forwarded host, HTTPS and canonical external port; untrusted Forwarded/prefix headers removed; mismatched Host/SNI denied |
| Private allowed paths | Administrative console/API, master-realm authentication/discovery and required resources only; use normalized upstream URI forwarding as the current gateway does, and deny management and unrelated routes. The existing public `iam-gateway` stays unchanged |
| TLS identity | Existing canonical certificate/key, mounted read-only at protected paths; actual trust, hostname, validity and key match checked; no key copy or permission change |
| Workstation tunnel | SSH local loopback port to the host's private proxy; the local CONNECT helper forwards raw TLS only for the exact canonical IAM hostname and port |
| Browser | Dedicated profile with the helper as its HTTP proxy; canonical URL, TLS SNI, authentication redirects, assets and callbacks stay unchanged; unrelated authorities are refused |

The renderer refuses non-HTTPS/unsafe origins, credentials or queries in inputs, unpinned images, non-internal/non-Compose IAM networks, unsafe key permissions, untrusted/wrong-name/expired or mismatched certificates, privileged published ports, existing output directories and output inside the repository. It inspects the selected network, rather than accepting an operator-written network assertion. Use the already recorded canonical issuer and actual network discovered above. Verify that they describe the running `iam`; the renderer does not grant authority to choose another issuer.

Two certificate ownership modes avoid changing existing private-key access:

| Existing key owner | Generated process/capability mode |
|---|---|
| Nonroot UID, mode0600 | Same UID/GID, single NGINX process, all capabilities dropped |
| Root, mode0600 | Root NGINX master reads TLS; nginx workers UID/GID101; all capabilities dropped except SETUID/SETGID needed to drop worker identity |

Both use a read-only filesystem, no-new-privileges, bounded worker-owned temporary filesystems, no access logging and the isolated network. Root mode checks the pinned image's actual nginx account is101. Explicit temporary mount ownership avoids adding CHOWN. Actual image configuration/startup and both modes are native-fixture checks, not conclusions from YAML alone. Other key ownership/certificate facilities require protected operator review; never copy an existing private key into this repository to satisfy a test.

After the protected handoff, render into a **new absolute protected directory outside this repository**. The following are shapes with nonsecret placeholders, not commands already executed on staging:

```text
python3 infra/private-iam/render.py \
  --canonical-origin https://APPROVED_CANONICAL_IAM_HOST \
  --network ACTUAL_COMPOSE_IAM_EDGE_NETWORK \
  --proxy-image REVIEWED_NGINX_GATEWAY_IMAGE_AT_SHA256 \
  --certificate /PROTECTED_EXISTING_TLS/fullchain.pem \
  --private-key /PROTECTED_EXISTING_TLS/privkey.pem \
  --port 9443 \
  --output-directory /PROTECTED_NEW_DIRECTORY/accesslobby-private-console
```

Use `--ca-file /PROTECTED_APPROVED_CA_BUNDLE` only for an explicitly approved private CA. Publicly trusted certificates use normal system trust. Run through the authorized host account able to read those protected files; do not pass passwords. Generated `compose.json` contains certificate **paths**, not key material, and is0600 in a0700 directory. A root-run renderer must be operated through that same protected account. Review its nonsecret config and preflight result privately, then check the actual pinned image configuration before starting the new service:

```text
docker compose -p accesslobby-private-console \
  -f /PROTECTED_NEW_DIRECTORY/accesslobby-private-console/compose.json \
  run --rm --no-deps iam-admin-private -t
docker compose -p accesslobby-private-console \
  -f /PROTECTED_NEW_DIRECTORY/accesslobby-private-console/compose.json \
  up -d --no-build
```

Use this distinct Compose project/file; do not merge it into or recreate the main IAM stack. Confirm the actual host publication is127.0.0.1 only, the sole service network is the inspected internal `iam-edge`, TLS mounts are read-only and no public proxy label was introduced. Keep certificate renewal/reload ownership explicit.

On the approved workstation:

```text
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:19443:127.0.0.1:9443 APPROVED_OPERATOR_HOST
node infra/private-iam/connect-proxy.mjs \
  --canonical-origin https://APPROVED_CANONICAL_IAM_HOST \
  --tunnel-port 19443 --listen-port 18888
```

Choose verified free workstation ports. The helper binds127.0.0.1, refuses ordinary HTTP proxy requests and CONNECT to any other hostname/port, performs no remote DNS resolution and never terminates/inspects TLS. Configure **only the dedicated admin browser profile** to use HTTP proxy127.0.0.1:18888. Open `https://APPROVED_CANONICAL_IAM_HOST/admin/master/console/` there. The browser still uses canonical443; the tunnel's19443 is transport only. A non443 existing canonical origin must retain its exact port throughout. No local privileged443 bind, global hosts-file change or TLS bypass is required. Import an approved private CA into that isolated profile's actual trust store when needed; do not accept browser certificate errors.

Keep private canonical hostname mapping limited to the dedicated admin workstation/profile. Other browsers and connected applications retain normal public DNS, the original issuer and the restricted public gateway. The private proxy's loopback port protects network reachability; possession of the existing authorized IAM credentials still protects administrative actions. Inspect both protections independently.

A different private admin hostname is another design option. It requires an explicit `KC_HOSTNAME_ADMIN`/master-authentication/client-redirect and trusted-proxy review, full callback testing, and potentially IAM recreation. A master frontend-URL override can affect private CLI authentication and admin API audiences. Do not apply that route opportunistically during SMTP work or declare `hostname-admin` alone sufficient. First-party issuer and existing peer clients must remain unchanged.

The repository's current inventory policy expects no host-published **IAM** port. A new companion's explicitly loopback-only port needs its own inventory record; it must never be mistaken for publishing `iam` or suppressing an unexpected public binding. The production Compose/public gateway and their existing policies remain unchanged.

## Disposable native acceptance

From the repository with Docker, OpenSSL, Playwright Chromium and `certutil` available (`libnss3-tools` on Ubuntu), run:

```text
python3 -m unittest discover -s infra/private-iam -p 'test_*.py'
node --test infra/private-iam/test_connect_proxy.mjs
node infra/scripts/private-iam-console-live-smoke.mjs
```

The native script expects locally built `accesslobby-iam:ci` and `accesslobby-iam-gateway:ci`, overrideable with `IAM_IMAGE` and `GATEWAY_IMAGE`. Passwordless sudo is used only for freshly generated synthetic root-owned fixture files/package operation and exact temporary cleanup. It creates uniquely named owned containers/networks, its own PostgreSQL17.11, a production-mode actual Keycloak, a synthetic first-party realm and short-lived CA/certificate. It never uses the existing port8080 IAM, staging realm or SMTP. The public fixture wraps the actual gateway allowlist in TLS without modifying its source.

Acceptance checks actual NGINX configuration/startup in both key modes, worker UID in root mode, port/network/mount/capability readback, trusted loopback TLS, Host denial, real browser master login through advertised canonical authentication, served console assets, visible realm/client creation controls without creating either, and console logout. The separate public gateway has its own verified loopback-only publication; direct Host/SNI-preserving TLS probes reach that public gateway, independently of the private proxy/CONNECT helper, and retain exact first-party discovery/JWKS and404 for admin/master/health/metrics before and after. No extra curl image is pulled for probing. Browser trust comes from a synthetic CA imported into an isolated NSS home; certificate verification remains enabled. Owned container IDs/network labels and distinct Compose projects fence cleanup; private keys, credentials and browser state are deleted.

`artifacts/private-iam-console/report.json` contains safe categorical checks, precise failure phase, public response statuses, source and browser version. On failure it captures owned service running/exit/OOM state and fixed startup-log classifications (for example database authentication, DNS, certificate, permission or import failure); raw logs, environment, screenshots, keys, credentials, cookies and authenticated URLs never enter the report. A pass qualifies this disposable fixture only. A missing Docker/browser prerequisite or failure is recorded as failed, never reclassified as a native pass. Local execution here passed6Python and5Node cases, including genuine loopback HTTPS trust/hostname/Host/SNI checks, bounded metadata bodies and non-leaking diagnostics. The first native CI attempt stopped during the formerly bundled topology stage before login; owned resources were cleaned. Its discarded raw logs cannot establish the precise cause. The corrected finer-phase native test requires its own actual passing CI report.

## Read-only checker

The earlier credential-free checker accepts an exact approved private HTTPS origin, local loopback IP and pinned public issuer. It directly connects to the URL's canonical port, preserving Host/SNI/certificate checks. Consequently its invocation below applies only when an independently qualified mapping supplies that canonical port locally; it does **not** consume the new CONNECT helper or19443 tunnel directly. Do not point it at an invented private URL or assume it proves the browser package. The native fixture above tests the package itself. Public issuer and denial checks always use separate normal HTTPS connections.

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

Rollback closes the dedicated browser profile, stops the CONNECT helper and SSH tunnel, then removes only the separate companion:

```text
docker compose -p accesslobby-private-console \
  -f /PROTECTED_NEW_DIRECTORY/accesslobby-private-console/compose.json \
  down
```

Remove only its known generated directory through the protected account after evidence review. Preserve existing TLS files, external `iam-edge`, IAM, databases, volumes, images, public gateway and realm SMTP. Recheck original public issuer/JWKS and404 boundaries after cleanup. If a separate-hostname option was explicitly approved later, restore its exact recorded configuration before recreation/requalification. Do not delete realms, reimport the existing realm, reset credentials or redeploy unrelated services to close a browser-access test.

Until this protected authenticated gate completes, the valid status remains **private browser console NOT QUALIFIED**. Existing private CLI administration remains the current operator route.
