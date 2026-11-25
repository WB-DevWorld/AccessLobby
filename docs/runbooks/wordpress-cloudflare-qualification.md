# WordPress Cloudflare qualification

Relates to #59. Operational guidance for reviewed first-party test sites. Connector version, identity/linking policy and local authorization are unchanged.

## Current estate gate

Published cfd71f0 qualifies the bounded CETECH two-site quiet-SSO/signed-removal cases. Latest follow-up d3650bb confirms the old control expired before the reverse logout; its later unauthenticated Orders request is inconclusive for valid live isolation. Training Join correctly refuses verified_email_required with no local creation; JIT is restored off. [Verification/control diagnosis](wordpress-verified-join-qualification.md).

FLAIROC's latest observed page is coming-soon with an unidentified WordPress toolbar, not a customer form or an observed challenge. Use site-only logout for that local context, reach wp-login.php, and confirm synthetic customer122 before linking. Request manual verification only when a challenge is actually visible. Preserve coming-soon policy and the account exemption; the toolbar alone does not prove Administrator privileges. The older Ray a6024847dd2b3175 is historical, not the current page classification.

## Identify the actual challenge

1. For one blocked attempt, record UTC time, exact hostname, path, method, Cloudflare Ray ID, and the fixed WordPress action if relevant. Never retain the full callback query, authorization code, state, cookie, password, verification link or token.
2. A response header cf-mitigated=challenge identifies an interstitial Challenge Page. A cf-ray header or an ordinary403 alone does not identify the cause. An embedded Turnstile widget inside an otherwise rendered WordPress form is a different case.
3. In the owning zone's Security Analytics/Events, locate that Ray ID. Record Service/product, rule ID, action, observed source address, hostname and method. The browser's egress can differ from the Windows agent, SSH host and Keycloak container.
4. Determine whether the challenge is on WordPress, the IAM hostname, or the callback. Do not assume the WordPress zone is responsible solely because the journey started there.

Cloudflare's current official [challenge-response documentation](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/) identifies the response header. Its [supported-browser guidance](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) says automated browsers are unsupported for solving production challenges.

First try a normal visible supported browser and hand the challenge to the owner. Keep its profile/IP and authenticated sessions intact. Do not export clearance cookies or install stealth/challenge-solving tools. After clearance, restart Connect AccessLobby from a valid local WordPress session; an intercepted callback or five-minute linking flow may already be expired or consumed.

## Narrow site-owner policy correction

Preserve the existing rule/settings and record rollback before a change. If site-owner policy access is available, use the identified feature's supported exception mechanism:

| Blocking feature | Narrow response |
|---|---|
| Custom challenge rule | Exclude the exact reviewed test-browser IP, confirmed non-production hostname and required path from that one challenge expression. Other custom rules still run. |
| Specific Managed Rule | Use an exception for that rule ID and the smallest confirmed request scope. |
| Super Bot Fight Mode | Use a custom Skip rule selecting only that product for the reviewed request scope. |
| Standard Bot Fight Mode | Custom Skip rules cannot bypass it. Keep zone settings unchanged while preparing the owner decision; disabling it affects the whole domain, including production hosts sharing that zone. |
| Rate limit or browser/security setting | Inspect its own event and configuration; do not assume a generic WAF Skip will fix it. Keep login throttling unless a separate evidenced policy change is approved. |

Illustrative scope for a confirmed WordPress-login challenge, not a deploy-ready rule:

~~~
(ip.src eq 198.51.100.10
 and http.host eq "staging.cetechbpa.com"
 and http.request.uri.path eq "/wp-login.php"
 and http.request.method in {"GET" "POST"})
~~~

The address is documentation-only. Substitute the actual browser source observed in Events, use the actual challenged host/path, and apply it to the identified feature only. Give a temporary test exception a recorded removal deadline. Do not allowlist Cloudflare edge IPs, all of a production zone, all wp-admin/wp-json traffic, or all remaining security rules. A DNS-edit token is not WAF policy authorization. If policy access is missing, prepare the exact rule ID, proposed change, scope and rollback for the owner; continue training tests independently.

Cloudflare's [security-feature interoperability guide](https://developers.cloudflare.com/waf/feature-interoperability/) distinguishes standard Bot Fight Mode from skippable SBFM. The product-specific [SBFM guide](https://developers.cloudflare.com/bots/get-started/super-bot-fight-mode/) confirms custom-rule exceptions. Consult actual product and current plan; no subscription change is authorized by this runbook.

## Machine backchannel preflight

Human clearance does not establish a usable server-to-server endpoint. The IAM sender cannot solve an HTML challenge. Evaluate the exact registered POST backchannel separately, from the actual delivery host/network where possible. Its authority remains the plugin's signed JWT validation; no nonce/password bypass is added.

The repository probe sends one deliberately malformed logout token, no credentials/cookies, with normal TLS validation. It does not follow redirects, retry a challenge or print bodies/Location/Set-Cookie headers:

~~~sh
python3 infra/scripts/wordpress_backchannel_preflight.py --endpoint https://training.cetechbpa.com/wp-json/accesslobby/v1/backchannel-logout
python3 infra/scripts/wordpress_backchannel_preflight.py --endpoint https://staging.cetechbpa.com/wp-json/accesslobby/v1/backchannel-logout
python3 infra/scripts/wordpress_backchannel_preflight.py --endpoint https://training.flairoc.com/wp-json/accesslobby/v1/backchannel-logout
~~~

Use Python instead of python3 on Windows if appropriate. Optional --output writes the categorical JSON report. Copy the exact endpoint from plugin settings; pretty and plain REST URLs, including installation subdirectories, are accepted. HTTPS and system certificate verification are mandatory.

Expected result: HTTP400 with JSON error=invalid_logout, no-store, and no cached response. This proves only rejection of that malformed request from that vantage. It does not prove signature validation, issuer delivery, successful logout, all-app propagation, browser login or every source IP/user-agent. A challenge result includes its safe Ray ID; an ordinary403 is not automatically attributed to Cloudflare.

An unexpected HTTP 2xx may be a maintenance page or intermediary response; it is not proof that a JWT was accepted. Treat it as an unresolved endpoint response and investigate privately.

If actual server delivery is challenged, scope the applicable product's exception to the exact registered POST route. Successful probes do not justify adding an unneeded bypass. Browser-IP exceptions do not cover the IAM sender. Preserve signature/issuer/audience/event/time/session/replay validation and appropriate rate limits. Verify an invalid request is rejected without changing a session, then perform actual issuer-delivered logout and targeted invalidation. Do not mark backchannel qualified from the preflight alone.

### Initial live observation

At 19:18 UTC on 2026-11-24, the ChatGPT Work executor probed all three approved endpoints once. Each returned HTTP 400 invalid_logout, verified TLS, no-store and CF cache DYNAMIC, without a challenge. [Categorical report](../qa/wordpress-edge-2026-11-24/live-preflight.json). These successful machine requests do not identify the browser-blocking rule or prove the IAM sender has the same treatment. No Cloudflare policy was changed.

At 19:21 UTC the same executor's credential-free GETs to all three wp-login.php paths returned HTTP 403 and cf-mitigated=challenge. [Header-only report and safe Ray IDs](../qa/wordpress-edge-2026-11-24/login-path-header-probes.json). Compare actual Service/rule and request context in Events before editing policy. The working training browser remains a separate observed context.

## Continue the available work

Keep accepted cfd71f0 signed target-removal cases. The one later control request has already been made and follows an expiry that predates the event. Do not repeat requests to that expired session or extend lifetimes. Any later bounded reverse-isolation test needs a fresh independent same-person control, prepared last and confirmed valid through the planned event/request window.

For FLAIROC, first establish the correct local session context. After genuine customer122 authentication, Connect AccessLobby starts a fresh bounded dual-proof flow. Do not connect an unidentified toolbar account. Keep actual cold/warm profile conditions, issuer events and endpoint observations separate. A challenge elsewhere or earlier is not evidence that the current homepage is challenged.

For training Join, preserve the verified-email guard and use the [private read-only email metadata procedure](wordpress-verified-join-qualification.md). Diagnose SMTP/action/account flags, then use the approved real verification channel and fresh tokens. Configuration presence does not prove delivery. Keep JIT off outside the controlled case, restore it afterward, and preserve local roles/commerce/guest policy.

No plugin rebuild, image promotion or new IAM network rollout is needed for these checks. Enforced mode remains off pending trusted recovery. Private metadata reports never contain credentials, raw callbacks or tokens. Keep #59 open; external privacy/onboarding and production remain separate gates.
