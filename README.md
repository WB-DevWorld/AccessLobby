# AccessLobby

AccessLobby is the independent identity product boundary for shared human sign-in. Keycloak provides IAM mechanics; AccessLobby owns a durable person ID and maps verified issuer/subject pairs to it. Applications validate OIDC and retain their own resource authorization.

Any compatible application can consume the same [OIDC and identity contract](docs/integration-contract-v0.1.md). Follow [consumer onboarding](docs/consumer-onboarding.md) to register a client and verify it. POII and DonLoft are intended adopters when available; their repositories are not dependencies of AccessLobby.

**Current state (2026-09-29):** controlled staging identity and organization workflows work at the account-routing baseline. First-party app onboarding is merged, CI-qualified and published, but its candidate is not observed deployed. Production and named-peer adoption are not claimed. See the [current-state audit](docs/ACCESSLOBBY-CURRENT-STATE-AUDIT.md), [MVP reconciliation](docs/ACCESSLOBBY-MVP-RECONCILIATION.md), [broader roadmap](docs/ACCESSLOBBY-BROADER-ROADMAP-STATUS.md), [execution ledger](CURRENT-WORK.md) and [runtime evidence](LIVE-ENVIRONMENT-FACTS.md).

## Local start

Requirements: Node 24, pnpm 11.19, Docker Compose, Python 3.

1. Copy `.env.example` to `.env`, fill four distinct strong passwords and a random `SESSION_SECRET`. Do not commit `.env`.
2. `set -a; source .env; set +a; python3 infra/scripts/render-realm.py`
3. `docker compose --env-file .env -f infra/compose.local.yaml up -d`
4. `pnpm install --frozen-lockfile`
5. `pnpm --filter @accesslobby/api migrate`
6. In separate terminals, `pnpm --filter @accesslobby/api dev` and `pnpm --filter @accesslobby/web dev`.
7. Configure a working Keycloak SMTP server before testing email verification or recovery. Visit `http://localhost:3000` to create an account or sign in. For an existing realm, apply the reviewed updates in [consumer onboarding](docs/consumer-onboarding.md); startup import does not update it.

The local import configures `accesslobby-web` with exact callback `http://localhost:3000/auth/callback` and PKCE S256. Local development uses Keycloak's `start-dev`; production uses `start` behind a trusted HTTPS proxy. An import creates a realm only when absent; changes to an existing realm require explicit reconciliation.

Run `pnpm typecheck`, `pnpm test`, `pnpm build`. See [Integration Contract](docs/integration-contract-v0.1.md) before writing a consumer.

## Release status

Production qualification requires a separately deployed compatible consumer and qualified monitoring, backup/restore and rollback evidence. POII/DonLoft adoption is a separate later milestone. The compose production file is a prepared deployment baseline, not evidence that hosting, DNS, secrets or a release exists. Promotion must use qualified image digests. See [deployment runbook](docs/runbooks/deployment.md).
