# Independent reference consumer

This runnable Node example implements the language-neutral [consumer contract](../../docs/integration-contract-v0.1.md) without importing AccessLobby source. It demonstrates joining from a peer, explicit existing-account linking, code + PKCE, issuer/JWKS/token checks, `/v1/me`, local or shared sign-out, signed backchannel session invalidation, and a local resource denial. Sessions and account links are **in memory**; it is not a production application or proof of named peer adoption.

Start the local stack, render/register `reference-consumer` with callback `http://localhost:4000/callback`, logout `http://localhost:4000/`, and backchannel logout `http://localhost:4000/backchannel-logout`; add its ID to API `ALLOWED_CLIENT_IDS`. Then run:

```sh
CONSUMER_ORIGIN=http://localhost:4000 \
OIDC_ISSUER=http://localhost:8080/realms/accesslobby-first-party \
OIDC_CLIENT_ID=reference-consumer \
ACCESSLOBBY_API_URL=http://localhost:3001 \
pnpm --filter @accesslobby/reference-consumer start
```

Visit `http://localhost:4000`. **Join as new** starts registration with `prompt=create` and creates a distinct peer-local ID after email verification and identity resolution. Returning users sign in through `/login`. For the simulated old account, set `LEGACY_TEST_USERNAME` and `LEGACY_TEST_PASSWORD_SCRYPT` (format `salt:base64url(scrypt(password,salt,32))`) outside Git. Sign into the old peer account, then choose **Connect your existing account**. The callback must prove both the live old account session and a valid AccessLobby identity before binding the old local ID. This fixture has a single sample old account and is not a reusable password system.

`/private` returns 403 until the AccessLobby person ID is explicitly placed in `GRANTED_PERSON_IDS` and the example is restarted. The grant fixture demonstrates application-owned authorization; a real consumer persists accounts, links, audit records and permissions with uniqueness constraints, rate limits its old login, and retains sessions across restarts. All in-memory state here disappears on restart. `PORT` controls the internal HTTP listener (default `4000`) independently of `CONSUMER_ORIGIN`, which must be the browser-visible origin. Register distinct exact HTTPS URIs and deploy it separately to test a real staging/production issuer. For the Dokploy staging deployment, follow the [reference consumer runbook](../../docs/runbooks/reference-consumer-staging.md).
