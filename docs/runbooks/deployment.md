# Staging and production deployment

**Prepared procedure; not evidence of deployment.** Use separate hosts or strictly isolated environments, databases, credentials, issuer URLs, proxy routes and backup storage.

1. Verify DNS/TLS ownership, Docker host and trusted reverse proxy. The proxy terminates HTTPS, strips untrusted forwarded headers and sets its own `X-Forwarded-*`. Only loopback app ports are bound; no database port is published. Restrict Keycloak `/admin` and management port to operators. Verify issuer discovery returns the exact external HTTPS URL.
2. Create environment-specific secrets out of Git, including unique database passwords, bootstrap admin credentials, 32-byte web session key. Set `WEB_BASE_URL`, `IAM_PUBLIC_ORIGIN`, `OIDC_ISSUER`, `ALLOWED_CLIENT_IDS`, `GIT_SHA` and qualified `API_IMAGE`/`WEB_IMAGE` digests.
3. Render realm config for a **new** environment with `WEB_BASE_URL=... python3 infra/scripts/render-realm.py`. The import is create-only; for later client changes, export/diff and apply an approved Keycloak admin change. No secret or user data belongs in the template.
4. Build once from the tested SHA, publish images, record registry digests. Use those exact digests for staging and production. Run `docker compose --env-file <staging-env> -f infra/compose.production.yaml up -d`; run the API migration using the same versioned image with the staging database URL before routing login traffic. Do not send traffic to a non-migrated API.
5. Check OIDC discovery/JWKS issuer, `/health/live`, `/health/ready`, a controlled login, `/v1/me`, repeat login, logout/re-entry, bad token/issuer/audience rejection and peer local denial. Record SHA, image digests, versions, migration and logs without tokens. Execute backup and restore drill in an isolated environment.
6. Present Go/No-Go evidence for production approval. Promote the exact image digests, with production secrets/realm/callbacks, migrate then smoke. Observe errors and login failures. Roll back images to previous digests only if schema remains compatible; otherwise use the documented forward fix or a verified database restore with explicit data-loss assessment.

Do not claim CI/CD staging promotion until host and registry automation are connected. Do not route production traffic before the real peer pilot qualifies.
