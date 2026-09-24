# Live environment facts — 2026-09-24 UTC

## VERIFIED

- `WB-DevWorld/AccessLobby` exists, public, default branch `main`, size 0 at initial inspection, no verified commit or deployment at that time. Connected GitHub app has admin/push access.
- Connected GitHub repository list for `WB-DevWorld` contained AccessLobby, CETECH POS and delivery plugin; no POII or DonLoft implementation repository was found there. This does not prove those implementations do not exist elsewhere.
- Scratch runtime: Node 24.19, pnpm 11.19; Docker CLI unavailable. npm package registry reachable.

## UNVERIFIED

- AccessLobby domains, DNS, TLS, compute, Dokploy/OVH access, registry credentials, PostgreSQL service, Keycloak runtime, staging and production environments.
- POII and DonLoft implementation locations, authentication boundaries and deployment readiness.
- GitHub branch protection capability and CI result until verified through repository settings/workflow runs.

## OWNER REQUIRED FOR EXTERNAL DEPLOYMENT

- Actual staging/production domains and trusted reverse proxy/host access.
- Environment-specific secret provisioning and backup destination.
- POII/DonLoft repo/environment location only when their later adoption work begins; their absence does not block the independent AccessLobby product deployment.
- Final production promotion approval after a reviewable Go/No-Go evidence set.
