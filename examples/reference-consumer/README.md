# Independent reference consumer

This runnable Node example implements the language-neutral [consumer contract](../../docs/integration-contract-v0.1.md) without importing AccessLobby source. It proves code + PKCE, issuer/JWKS/token checks, `/v1/me`, a local session, and a local resource denial. It uses an in-memory session/grant fixture and is **not** a production application or proof of named peer adoption.

Start the local stack, render/register `reference-consumer` with callback `http://localhost:4000/callback` and logout `http://localhost:4000/`, and add its ID to API `ALLOWED_CLIENT_IDS`. Then run:

```sh
CONSUMER_ORIGIN=http://localhost:4000 \
OIDC_ISSUER=http://localhost:8080/realms/accesslobby-first-party \
OIDC_CLIENT_ID=reference-consumer \
ACCESSLOBBY_API_URL=http://localhost:3001 \
pnpm --filter @accesslobby/reference-consumer start
```

Visit `http://localhost:4000`. A valid sign-in resolves an AccessLobby person ID. `/private` returns 403 until that ID is explicitly placed in `GRANTED_PERSON_IDS` and the example is restarted. The grant fixture demonstrates application-owned authorization; a real consumer uses its own persisted permissions. The process loses sessions on restart. Register distinct exact HTTPS URIs and deploy it separately to test a real staging/production issuer.
