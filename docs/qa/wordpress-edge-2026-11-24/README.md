# WordPress edge observations — 2026-11-24

Relates to #59. These observations add narrow live HTTP evidence to operator c6c221b. They do not qualify a browser login or signed logout.

| Classification | Finding |
|---|---|
| SOURCE-CONFIRMED, operator c6c221b | Alpha.9 is installed on three sites. Training preserves its linked customer/session through a peer check; other browser journeys encounter Cloudflare. |
| CURRENT-REPO-FACT | The single-request preflight has 9 focused tests; all 54 infrastructure Python tests pass locally. Full CI is recorded in the associated PR. Plugin ZIP and image pins are unchanged. |
| SOURCE-CONFIRMED, live Work-executor requests | All three malformed-token POSTs return HTTP 400 invalid_logout, verified TLS, no-store and DYNAMIC without a challenge. |
| SOURCE-CONFIRMED, live Work-executor requests | Fresh credential-free GETs to all three wp-login.php paths return HTTP 403 with cf-mitigated=challenge. This is a different context from the operator's working training browser. |
| NEW-RECOMMENDATION | Identify the challenged browser's Ray ID and Service/rule in Events, then use human clearance or a narrow product-specific non-production exception. |
| OWNER-DECISION-REQUIRED, conditional | A whole-zone Bot Fight Mode change would affect production on the same domains; no such change was made or approved here. |
| DEFERRED | Actual IAM-delivered signed logout, live-session preservation after the invalid probes, two-site quiet SSO, Join/JIT, enforced recovery and external-publisher activation remain separate gates. |

## Live requests

[Malformed backchannel report](live-preflight.json), 19:18 UTC:

| Host | POST backchannel | Cache | Challenge |
|---|---|---|---|
| training.cetechbpa.com | 400 invalid_logout | no-store / DYNAMIC | None |
| staging.cetechbpa.com | 400 invalid_logout | no-store / DYNAMIC | None |
| training.flairoc.com | 400 invalid_logout | no-store / DYNAMIC | None |

[Header-only login-path report](login-path-header-probes.json), 19:21 UTC:

| Host | GET wp-login.php | Ray ID |
|---|---|---|
| training.cetechbpa.com | 403 / challenge | a5fac7840e6b3a0f-ORD |
| staging.cetechbpa.com | 403 / challenge | a5fac7a44f9a3a0f-ORD |
| training.flairoc.com | 403 / challenge | a5fac7bf784b23d3-ORD |

Only headers needed for classification were retained; no challenge solving, cookies, credentials, response bodies or callback values were read into reports. No security rule, DNS entry, registration, plugin package, user/link/commerce record or deployment was modified. The three invalid POSTs may add the normal rejected-backchannel audit events.

The issuer's source network, user agent and browser clearance are different test contexts. Successful malformed-token rejection is not evidence of signature validation or preservation of an existing session. Confirm those with the actual issuer and controlled browser sessions. The login-path probes support request-specific investigation, not a blanket policy relaxation.

Use the [Cloudflare qualification runbook](../../runbooks/wordpress-cloudflare-qualification.md) and continue the available training logout/re-entry slice.
