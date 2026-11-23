# Troubleshooting

- Metadata test fails: verify exact issuer/API HTTPS origins, discovery `issuer`, same-origin endpoints, S256/RS256 support and API readiness. Check outbound HTTP/TLS policy privately. Do not disable TLS validation.
- Login fails: verify exact client/callback/API audience/azp, active first-party registry row and app admission. Server-side state expires in five minutes and requires its HttpOnly same-browser cookie. Check trusted HTTPS and cache exclusions; do not clear all browser state as a repair.
- Existing email: expected linking-required result. Sign in locally in hybrid mode, Connect AccessLobby, finish fresh IAM authentication. Never enable automatic email linking.
- Mapping conflict: preserve both accounts and collect safe correlation/audit classes. Confirm local ID/issuer/durable identity privately. Use a reviewed host recovery/migration procedure; never overwrite the map in a generic admin form.
- Enforced mode refuses to save: link the current administrator, run a fresh metadata check, configure/rehearse emergency recovery, record backup/rollback/rehearsal references and acknowledge unlinked users/privileged accounts/session invalidation.
- Redirect loops/custom theme forms: use exact helpers/hooks, verify original destination path, modal visibility and signed-out/callback exclusions. Disable neither state validation nor local authorization to resolve a theme defect.
- Shared logout incomplete: distinguish issuer confirmation/cancellation, invalid registration, denied backchannel transport, invalid/replayed JWT and unavailable peer. Another device must remain unaffected. A local logout or a redirect alone is not proof of cross-site propagation.
- Outage: hybrid local login follows site policy; enforced login fails closed. Use the deliberate host recovery procedure. No outage should expose a normal local password screen.

Report plugin/WP/PHP/Woo/theme versions, mode, exact source/package hash, route class and safe correlation ID. Do not include tokens, authorization codes, cookies, tickets, secrets or raw private account records.
