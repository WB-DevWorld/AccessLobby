# Changelog

## 0.1.0-alpha.9 — 2026-11-24

- Canonicalize trailing slashes in the WordPress configuration fingerprint. A request-phase `home_url` filter that only adds or removes that slash no longer ends a valid AccessLobby session.
- A different site or home host still changes the fingerprint. Sessions sealed before this change remain valid, including through an upgrade.

## 0.1.0-alpha.8 — 2026-11-24

- Treat Wordfence Login Security's own-account capabilities `wfls_show_login_security` and `wf2fa_activate_2fa_self` as non-elevating. Real subscriber and customer roles on the estate include them, and alpha.7 refused every settings save and SSO start because of that.
- Keep administration, shop, and content capabilities unsafe. A regression covers the self-service capabilities and still rejects `manage_options`.

## 0.1.0-alpha.7 — 2026-11-24

- Reject an empty or whitespace-only stored username after local insertion/registration hooks finish. Roll back the new user and identity mapping together.
- Preserve valid local username customization, repeat identity resolution and ordinary core-error behavior. Existing users, roles and commerce are not rewritten.
- Add real WordPress late-hook regressions inspired by Cursor's partial-Join probe and qualify the exact alpha.6 to alpha.7 ZIP upgrade.

## 0.1.0-alpha.6 — 2026-11-24

- Consolidate the hardened first-party connector with Cursor's representative nginx/PHP-FPM/hostname TLS fixture and isolated database/parallel-port tests.
- Keep the two authentication modes, explicit links, local commerce/roles, dedicated login pages and bounded session reconciliation.
- Exercise a real alpha.5 to alpha.6 ZIP update. Stage B external consent/profile APIs and migrations remain preserved in PR61 and are excluded from this first-party release.
- Build the HTTPS fixture API from the frozen repository lockfile, redact authentication queries and guard cleanup of disposable resources.

## 0.1.0-alpha.5 — 2026-11-24

- Let administrators select dedicated frontend login pages without editing a theme. Enforced mode starts SSO server-side, including with JavaScript disabled.
- Preserve validated return destinations, avoid redirecting public pages merely because they contain a login action, and expose a dedicated membership adapter filter.
- Keep local accounts, commerce, roles, guest policy and both logout choices unchanged. External consent review is a separately gated AccessLobby server feature; it does not activate external WordPress clients.

## 0.1.0-alpha.4 — 2026-11-23

- Negotiate optional opaque AccessLobby session receipts, seal them server-side and check fresh SSO sessions for durable shared logout, application admission and identity suspension.
- Record shared-browser logout before issuer redirection; preserve legacy bounded sessions during API/plugin rollout and emergency/machine authentication.
- Use a 30-second check interval and at most 90 seconds of already-authenticated outage grace; never extend existing session expiry.

## 0.1.0-alpha.3 — 2026-11-23

- Restrict enforced-mode frontend submit interception to supported forms with credential fields; an unrelated form class cannot initiate SSO.
- Add actual mounted-modal/mobile, shortcode/block/editor and bounded account disconnect/reconnect browser qualification. Exact passing revisions remain separately recorded.

## 0.1.0-alpha.2 — 2026-11-23

- Independent Codex comparison increment: real HTTPS IAM/API/two-WordPress fixtures, database/security tests, browser CI and HTTP protocol acceptance.
- Fail-closed durable audit, atomic unlink, post-hook safe JIT checks and rollback cache cleanup; custom-capability readiness and schema2 incident reference hashes.
- Successful dual-proof linking rotates the current local session and binds it to the issuer session immediately. Native profile form association avoids nested forms; dynamic account/connector surfaces send private no-store headers.
- Enforced cookie issuance is limited to validated SSO/host recovery; core/Woo local registration and forged checkout signup fail closed while guest purchasing and explicit Application Password API policy remain available.
- Use WooCommerce's public HPOS compatibility API; CI explicitly separates classic CPT and HPOS order storage before creating orders. Order access remains through WooCommerce CRUD.
- Real fixture coverage includes enforced mode/readiness, privileged linking, host recovery/replay, concurrent JIT/link/state operations, synthetic email verification, guest purchasing and data-preserving lifecycle. Exact passing revisions are reported separately.
- Exact qualification remains in the comparison evidence; no production/external activation.

## 0.1.0-alpha.1 — 2026-11-23

- Public Code/PKCE S256 client with pinned discovery, isolated maintained RS256/JWKS verifier, signed ID/access-token checks and first-party identity/application-entry APIs.
- Unique durable local mapping, explicit fresh dual-proof linking, safe opt-in JIT, retained unlink state and no claim-to-role elevation.
- Hybrid and readiness-gated enforced SSO; core/WooCommerce hooks, shortcode/block/helper API and generic modal form adapter.
- Logout choice, signed replay-protected sid-scoped backchannel session invalidation, bounded encrypted session/flow state and private auth responses.
- Host-enabled, exact-IP-restricted one-use emergency ticket; deliberate data-preserving deactivation/uninstall; standalone packaging, CI and qualification guides.

Alpha limitations and exact test evidence are recorded separately. No production, proprietary-theme or external-publisher certification is implied by this release.
