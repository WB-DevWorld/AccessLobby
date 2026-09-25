# Live environment facts — 2026-09-25 UTC

## Verified in connected tools

- `WB-DevWorld/AccessLobby` is public. PR #1 passed final-head CI and merged as `354a100ca0535d19ff1cbef97b6ab00197f1a848`. The first API/web image publication from that commit predates the IAM gateway; staging uses the later matching artifacts below.
- Main `99c91488f28a4cf87b90dfdabf8e668fd6b70a3c` includes the IAM gateway. The owner supplied a Dokploy deployment log showing successful pulls of the matching API `sha256:9c2021ecb6a20dd7a6d0a7c30708e4f56324ce00cfe71b883bafa5013d98df1e`, web `sha256:d39fc09eec19be0a478001463783f52a4ceea188756730f79c27927b01d74a1a`, and gateway `sha256:53e2f4b535c5a3fb282c064951f35a7804740b49bc1ee7e4060979fe0f7db489`. The deployment started all services. These are staging artifacts, not evidence of a production deployment.
- A prior owner-session GitHub UI inspection verified an active `Protect main` ruleset targeting `main`, requiring a PR and the `verify`/`iam-smoke` checks, with no force pushes or deletion. Confirm required checks on each new PR head.
- The connected GitHub inventory did not include a POII or DonLoft implementation. They remain later adopters of the independent AccessLobby contract.
- The agent has no SSH key or access to the owner's host. Host and OVHcloud observations below are based on owner terminal output or screenshots, not an agent session.

## Owner-reported host and access

- Hetzner CCX23, Ubuntu 24.04.5 x86_64 after reboot, running kernel 6.8.0-142-generic, 4 vCPU, approximately 15 GiB RAM and 75 GiB root filesystem; UTC synchronized.
- The owner reported a Hetzner Cloud Firewall applied to one server, proved a new SSH connection, and obtained a failed public TCP connection to port 3000. Individual firewall rule sources/ports were not inspected by the agent. Ubuntu UFW had been inactive.
- Docker 28.5.0, Compose v5.5.1 and Dokploy v0.30.7 were installed. The owner created a Dokploy admin account through an SSH tunnel at `http://localhost:13000`. A post-reboot snapshot taken five seconds after container start showed Dokploy health starting and PostgreSQL/Traefik running; later use of the panel demonstrates availability, but the service replica status was not rechecked in output.
- Cloudflare DNS lookups against resolver 1.1.1.1 returned the owner's host IPv4 for `accesslobby.realjanelove.com`, `iam.accesslobby.realjanelove.com` and `api.accesslobby.realjanelove.com`. The owner subsequently reached all three routes over HTTPS.
- The owner verified the generated Dokploy Compose preview: only web, API and IAM gateway joined the shared proxy network, with databases, migration and Keycloak confined to private networks. A SHA-checked realm import was saved in persistent Dokploy files. Registry access succeeded and the deployment log showed healthy PostgreSQL containers, a completed migration and started IAM, API and web. No reference consumer has been deployed.
- Owner PowerShell checks: API live 200; ready 200 with version `99c9148`; realm discovery issuer matched and JWKS returned two keys; `/v1/me` returned 401 without or with a malformed token; gateway root, admin, master realm, metrics, health and root discovery returned 404; forged forwarding headers did not change issuer or endpoint origins; an unregistered callback returned 400. The owner completed browser sign-in, repeat sign-in with the same person ID, and logout/return to the web home. Browser evidence is owner-reported; the agent did not operate the browser.

## Owner-reported backup evidence

- OVHcloud Object Storage bucket `devbackups` is in Roubaix (`rbx`) at `https://s3.rbx.io.cloud.ovh.net/`. The owner reported Dokploy's destination test succeeded.
- OVHcloud screenshots show bucket versioning Enabled, default SSE-OMK encryption Enabled, and one `webserver-backup-2026-09-25T12-44-24-497…` object around 42.52 KB. The object demonstrates an uploaded backup; its contents and recoverability were not independently verified.
- Dokploy Web Server → Backups screenshot shows an active `dokploy` control-plane backup to `ovh-rbx-devbackups`, cron `0 3 * * *` on a UTC server, prefix `/`, and `Keep Latest: 30`. Bucket public access policy, first scheduled run and isolated restore remain unverified. This backup covers Dokploy's database and `/etc/dokploy`, not AccessLobby's future Keycloak or identity databases.
- The owner configured separate daily Keycloak (`15 3 * * *`) and identity (`30 3 * * *`) PostgreSQL backups, retention 30, to the S3 bucket. Manual runs on 2026-09-25 logged successful uploads. Both downloaded `.sql.gz` archives had nonzero sizes and passed `gzip -t`. The owner restored each archive into an isolated temporary PostgreSQL 17 container and compared IAM realm/user and identity rows/fingerprints with the live databases, obtaining `IAM_RESTORE_MATCH`, `IDENTITY_RESTORE_MATCH` and `ISOLATED_RESTORE_PASS`. The first scheduled runs and versioned lifecycle retention remain unverified.

## Remaining staging and release gates

- Deploy the reference consumer in a separate Compose service with its own client registration, HTTPS callback and logout; verify identity continuity, local resource denial and logout/re-entry. This PR prepares its image and runbook, but its live conformance run remains open.
- Confirm private bucket access policy, first scheduled backups and lifecycle behavior for versioned objects. Record a safe rollback rehearsal and staging monitoring observations before production review.
- Production remains a distinct issuer/domain, environment and release decision. POII and DonLoft adoption resumes when their implementations are available.
