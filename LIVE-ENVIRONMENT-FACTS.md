# Live environment facts — 2026-09-25 UTC

## Verified in connected tools

- `WB-DevWorld/AccessLobby` is public. PR #1 passed final-head CI, merged as `354a100ca0535d19ff1cbef97b6ab00197f1a848`. Main CI run `36147843722` and guarded publisher `36148016779` passed. API `sha256:25f5fd5f2933a4fc2f894abed8b5de77b4e86ca88f32edf754928bbc0e32c640` and web `sha256:2c214beada605284ae87bd8b22f0ba8913655a122cf977195f8578248f672d60` were published. These predate the IAM gateway change; staging must use the next matched set of digests.
- A prior owner-session GitHub UI inspection verified an active `Protect main` ruleset targeting `main`, requiring a PR and the `verify`/`iam-smoke` checks, with no force pushes or deletion. Recheck its operation when PR #1 becomes ready for merge.
- The connected GitHub inventory did not include a POII or DonLoft implementation. They remain later adopters of the independent AccessLobby contract.
- The agent has no SSH key or access to the owner's host. Host and OVHcloud observations below are based on owner terminal output or screenshots, not an agent session.

## Owner-reported host and access

- Hetzner CCX23, Ubuntu 24.04.5 x86_64 after reboot, running kernel 6.8.0-142-generic, 4 vCPU, approximately 15 GiB RAM and 75 GiB root filesystem; UTC synchronized.
- The owner reported a Hetzner Cloud Firewall applied to one server, proved a new SSH connection, and obtained a failed public TCP connection to port 3000. Individual firewall rule sources/ports were not inspected by the agent. Ubuntu UFW had been inactive.
- Docker 28.5.0, Compose v5.5.1 and Dokploy v0.30.7 were installed. The owner created a Dokploy admin account through an SSH tunnel at `http://localhost:13000`. A post-reboot snapshot taken five seconds after container start showed Dokploy health starting and PostgreSQL/Traefik running; later use of the panel demonstrates availability, but the service replica status was not rechecked in output.
- Cloudflare DNS lookups against resolver 1.1.1.1 returned the owner's host IPv4 for `accesslobby.realjanelove.com`, `iam.accesslobby.realjanelove.com` and `api.accesslobby.realjanelove.com`. No application TLS, route or issuer is deployed.
- Dokploy screenshots confirm an `AccessLobby / staging` project/environment and an `accesslobby-staging` Docker Compose service shell. Its Git tab showed the public repository, `main`, `./compose.dokploy.yaml` and Autodeploy off; persistence after Save was not verified. The removal of a project-shared `NODE_ENV=staging` variable is also unverified. A later Advanced-tab screenshot shows Dokploy v0.30.7 marking Isolated Deployment deprecated. The owner turned it off and clicked Reload services; Networks then listed the six services in current main with all Detach switches off and empty network selections. No deployment has occurred.

## Owner-reported backup evidence

- OVHcloud Object Storage bucket `devbackups` is in Roubaix (`rbx`) at `https://s3.rbx.io.cloud.ovh.net/`. The owner reported Dokploy's destination test succeeded.
- OVHcloud screenshots show bucket versioning Enabled, default SSE-OMK encryption Enabled, and one `webserver-backup-2026-09-25T12-44-24-497…` object around 42.52 KB. The object demonstrates an uploaded backup; its contents and recoverability were not independently verified.
- Dokploy Web Server → Backups screenshot shows an active `dokploy` control-plane backup to `ovh-rbx-devbackups`, cron `0 3 * * *` on a UTC server, prefix `/`, and `Keep Latest: 30`. Bucket public access policy, first scheduled run and isolated restore remain unverified. This backup covers Dokploy's database and `/etc/dokploy`, not AccessLobby's future Keycloak or identity databases.

## Remaining staging and release gates

- Confirm bucket access policy and qualify the IAM gateway PR head; merge after review and record its three matching GHCR image digests from successful main-branch CI.
- Verify the saved Dokploy Git/Compose settings with deprecated Isolated Deployment off. After the new main is loaded, confirm the generated network preview: only the IAM gateway, API and web may join `dokploy-network`. Prepare protected staging secrets, a persistent rendered realm, HTTPS routes to gateway/API/web and proxy-header handling before application deployment. Do not expose the Dokploy panel or database ports publicly.
- After deployment, back up Keycloak and AccessLobby PostgreSQL independently, test an isolated restore, run real browser and generic consumer conformance flows, and record rollback evidence. No AccessLobby staging or production deployment or live browser login has occurred.
- Production remains a distinct issuer/domain, environment and release decision. POII and DonLoft adoption resumes when their implementations are available.
