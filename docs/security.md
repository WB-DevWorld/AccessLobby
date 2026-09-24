# MVP security notes

Validation: OIDC discovery issuer and JWKS origin, signed RS256 access tokens, exact issuer, API audience and allowed authorized party; browser code + PKCE, state, ID token signature/audience/nonce; exact callbacks and encrypted HttpOnly cookies. No password handling in Next or peer; no email linking; no unauthenticated identity lookup. Web sessions expire without refresh and logout cannot guarantee instant invalidation of all peer sessions.

Production requires HTTPS, trusted proxy headers, admin isolation, secrets out of Git/logs, restricted database network, rate/brute-force controls, monitored auth failures and backup/restore proof. The local development realm is deliberately not a production security configuration. A security review must check cookie size and Keycloak token contents with a real pilot account before promotion.
