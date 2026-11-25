# WordPress Cloudflare qualification

Relates to #59. Operational guidance for reviewed first-party test sites. Connector version, identity/linking policy and local authorization are unchanged.

## Current estate gate

Published operator commit cfd71f0d7a060f40dba1b56427a8420cea1ce10a qualifies CETECH training/staging links, quiet SSO and both signed shared-logout directions after durable IAM recreation. [Exact event/control observations](../qa/wordpress-two-site-2026-11-25/README.md). The earlier staging challenge was cleared; it does not remain a blanket blocker for those accepted flows. Alpha.9/hybrid/JIT off, roles/commerce/guest policy and image pins remain unchanged.

FLAIROC training is currently challenged in the main qualification Edge profile, Ray a6024847dd2b3175. The owner completes the check in that same Windows profile; a fresh local WordPress login/Connect flow follows. Keep its coming-soon policy and temporary signed-in-account exemption. No Cloudflare policy change or source-IP inference is justified by the successful CETECH results. Browser clearance remains separate from machine backchannel acceptance.

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

The accepted CETECH two-site flows do not need another run solely because FLAIROC is challenged. One final control-browser Orders request after the WordPress-initiated logout is not recorded in cfd71f0. Check it while the independent session remains valid; record its authenticated result or actual expiry. Preserve the main Edge FLAIROC tab for manual verification. The application-management owner's browser is not the qualification control.

After FLAIROC clearance, restart local login and the bounded explicit linking flow. Verify its existing local customer, role, order and count, then include it in the relevant quiet-SSO/logout cases. Record a warm pre-cleared profile separately from cold-browser challenge compatibility. Never export clearance cookies or ask the owner to post passwords.

Controlled Join/JIT can be prepared on an available CETECH test site while that one-site gate remains. Use a separate approved qualification identity/browser and a working verification channel; preserve a settings/count baseline, validate the explicit safe default role, temporarily enable JIT on that one non-production site, and prove validated creation, exactly-one reuse and collision refusal. Restore JIT off, retain evidence and preserve guest checkout/commerce. If browser/mail access blocks it, record that distinct blocker and continue other independent work. Use the existing connector setup/admin/security contracts; no new identity policy is invented here.

No new image, plugin, IAM rollout or zone-wide Cloudflare change is required to continue these tests. Enforced mode stays off pending trusted recovery. Preserve production, local IDs/roles/data and the first-party/external boundary. Update the estate ledger with exact source, timestamps/audits and qualification limits; keep #59 open.
