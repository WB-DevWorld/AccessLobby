# Live environment facts — 2026-09-24 UTC

## VERIFIED

- `WB-DevWorld/AccessLobby` exists, public, default branch `main`. Main has bootstrap commit `966347b`; draft PR #1 contains the implementation. Connected GitHub app has admin/push access. No deployment verified.
- Connected GitHub repository list for `WB-DevWorld` contained AccessLobby, CETECH POS and delivery plugin; no POII or DonLoft implementation repository was found there. This does not prove those implementations do not exist elsewhere.
- Scratch runtime: Node 24.19, pnpm 11.19; Docker CLI unavailable. npm package registry reachable. PR head `247de927` passed GitHub CI run #9, including ephemeral Keycloak discovery/JWKS and generic client callback checks.

## UNVERIFIED

- AccessLobby domains, DNS, TLS, compute, Dokploy/OVH access, registry credentials, PostgreSQL service, Keycloak runtime, staging and production environments.
- POII and DonLoft implementation locations, authentication boundaries and deployment readiness.
- GitHub branch protection capability and registry publish permission.

## OWNER REQUIRED FOR EXTERNAL DEPLOYMENT

- Actual staging/production domains and trusted reverse proxy/host access.
- Environment-specific secret provisioning and backup destination.
- POII/DonLoft repo/environment location only when their later adoption work begins; their absence does not block the independent AccessLobby product deployment.
- Final production promotion approval after a reviewable Go/No-Go evidence set.
