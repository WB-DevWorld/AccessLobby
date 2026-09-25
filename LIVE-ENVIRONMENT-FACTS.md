# Live environment facts — 2026-09-25 UTC

## VERIFIED IN CONNECTED TOOLS

- `WB-DevWorld/AccessLobby` is public with draft PR #1 on `feat/mvp0-identity-spine`; the main branch has only the controlled bootstrap. PR #1 at `9e44ba7` passed CI run #10 before the Hetzner/Dokploy preparation changes. Their new CI run remains to be checked.
- The connected GitHub inventory did not include a POII or DonLoft implementation. Those peers are later adopters and do not block an independently usable AccessLobby issuer and API.
- The scratch workspace has no Docker daemon or SSH access to the owner's host. The owner's passphrase-protected SSH key is on their Windows machine; no credential was supplied to this workspace.

## OWNER-REPORTED HOST OBSERVATIONS (AGENT NOT ON SERVER)

- Hetzner CCX23, Ubuntu 24.04.4 x86_64, 4 vCPU, 15 GiB reported RAM, 75 GiB root filesystem (71 GiB available), synchronized UTC clock.
- Only SSH was reported listening on checked ports. Docker/Dokploy are absent; Ubuntu UFW is inactive; the Hetzner Console reports no Cloud Firewalls. The server may expose SSH to the public internet pending a provider firewall.
- `accesslobby.realjanelove.com` is offered for **development/staging**; its parent DNS zone is managed in Cloudflare. DNS records and TLS are not verified or configured.
- OVHcloud Roubaix was offered as a backup location. Whether this is an S3-compatible Object Storage bucket, and its endpoint, bucket, policy and credentials, remain unverified. No backups or restores have been performed.

## UNVERIFIED / OWNER INPUT FOR BOOTSTRAP

- Hetzner firewall creation and an operator-approved access method for host provisioning. Preserve working SSH while changing inbound rules; keep Dokploy port 3000 private.
- DNS records and exact HTTPS names for staging web, IAM issuer, API and generic consumer; a future **production** domain/issuer remains undecided.
- GHCR pull permissions, Dokploy installation/runtime, staging secrets, database state, realm import, proxy rules, admin restriction, monitoring, off-host bucket, backup/restore and rollback.
- GitHub main branch protection and registry publish permission after merge.

## RELEASE GATES

- Qualify the updated PR/CI, bootstrap the host securely, then test a separately deployed generic OIDC consumer. No staging or production deployment or live browser login is verified.
- POII and DonLoft adoption resumes when those implementations are available. Production promotion remains an owner decision after reviewable Go/No-Go evidence.
