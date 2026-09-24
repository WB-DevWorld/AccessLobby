# AccessLobby

AccessLobby is the independent identity product boundary for shared human sign-in. Keycloak provides IAM mechanics; AccessLobby owns a durable person ID and maps verified issuer/subject pairs to it. Applications validate OIDC and retain their own resource authorization.

Any compatible application can consume the same [OIDC and identity contract](docs/integration-contract-v0.1.md). Follow [consumer onboarding](docs/consumer-onboarding.md) to register a client and verify it. POII and DonLoft are intended adopters when available; their repositories are not dependencies of AccessLobby.

**Current state:** MVP-0 implementation in progress. No staging or production deployment is claimed. See [CURRENT-WORK.md](CURRENT-WORK.md) and [LIVE-ENVIRONMENT-FACTS.md](LIVE-ENVIRONMENT-FACTS.md).

## Local start

Requirements: Node 24, pnpm 11.19, Docker Compose, Python 3.

1. Copy `.env.example` to `.env`, fill four distinct strong passwords and a random `SESSION_SECRET`. Do not commit `.env`.
2. `set -a; source .env; set +a; python3 infra/scripts/render-realm.py`
3. `docker compose --env-file .env -f infra/compose.local.yaml up -d`
4. `pnpm install --frozen-lockfile`
5. `pnpm --filter @accesslobby/api migrate`
6. In separate terminals, `pnpm --filter @accesslobby/api dev` and `pnpm --filter @accesslobby/web dev`.
7. Provision a controlled pilot user in the local Keycloak realm. Visit `http://localhost:3000` and sign in.

The local import configures `accesslobby-web` with exact callback `http://localhost:3000/auth/callback` and PKCE S256. Local development uses Keycloak's `start-dev`; production uses `start` behind a trusted HTTPS proxy. An import creates a realm only when absent; changes to an existing realm require explicit reconciliation.

Run `pnpm typecheck`, `pnpm test`, `pnpm build`. See [Integration Contract](docs/integration-contract-v0.1.md) before writing a consumer.

## Release status

Production qualification requires a real peer and backup/restore evidence. The compose production file is a prepared deployment baseline, not evidence that hosting, DNS, secrets or a release exists. Promotion must use qualified image digests. See [deployment runbook](docs/runbooks/deployment.md).
