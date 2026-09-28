# AccessLobby staging bulk acceptance matrix

Use this matrix after the owner schedules controlled account testing. It is a **prepared test sequence**, not a record of passed cases. Run it on the qualified staging image set in [the cutover runbook](auth-theme-staging-cutover-2026-09-28.md). Keep credentials, verification links, cookies, tokens, OIDC codes, email addresses and person IDs out of shared reports. Record only PASS, FAIL, BLOCKED or NOT RUN, UTC time, image-source SHA, relevant image digests and a short sanitized observation.

## Before opening a browser

1. Run the read-only private runtime inventory and the credential-free repeated public probe in [the prepared evidence pass](auth-theme-staging-cutover-2026-09-28.md#prepared-bulk-evidence-pass). Check both one-shot jobs, network isolation and the five image references. Investigate any mismatch before testing accounts.
2. In protected operator access, confirm the existing realm's `registrationAllowed`, `verifyEmail`, `resetPasswordAllowed` and `loginTheme`; confirm the web and consumer clients' exact callbacks and backchannel URLs. Check that a recent scheduled backup exists for each database and the Dokploy control plane. A backup object's presence alone is not an isolated restore result.
3. Prepare a controlled existing AccessLobby user, a separate new-user inbox, and a legacy reference-app account **only if that optional fixture is configured**. Keep the account details in private test custody. If SMTP or `verifyEmail` is not enabled and demonstrated, mark verified-email acceptance BLOCKED rather than claiming it from the registration form.

## One-session browser sequence

| ID | Action | Expected result / boundary |
|---|---|---|
| W1 | Open AccessLobby login; enter a wrong password for the controlled user | Friendly error, no session, no technical realm heading or credential leak. |
| W2 | Sign in correctly; open `/account` and `/identity` | Same real AccessLobby ID and status in both; Copy ID returns that ID; no fabricated profile data. |
| W3 | Sign out of **this app only**, then sign in again | Local web session ends; issuer SSO may make re-entry quick; same AccessLobby ID returns. |
| C1 | Start consumer sign-in with the same user | A separate local account-choice state appears if no link exists; AccessLobby identity alone does not grant local resource access. |
| C2 | Create a consumer-local account from the pending state | The app shows a separate local account ID and the same AccessLobby ID; `/private` denies with 403 until an explicit local grant. |
| C3 | Repeat consumer sign-in | Existing local link resolves; no duplicate local account or email-based merge. |
| L1 | With a distinct controlled legacy app account, prove its old sign-in and choose Connect AccessLobby | The link requires both live sessions and preserves the existing local ID. Skip as BLOCKED if the legacy fixture is unavailable. |
| L2 | Attempt a conflicting link under controlled test accounts | The app rejects the conflict without changing either mapping. Do not use real customer accounts. |
| N1 | Start new-user registration from AccessLobby, then from the consumer | Both entry paths open the branded registration form only when the feature gate is enabled. |
| N2 | Complete controlled registration and required email verification, then the callback | A usable account and identity appear only after the realm's configured verification step; the consumer can create its own local account. Mark email verification BLOCKED if SMTP/realm settings do not support it. |
| S1 | Sign out of the consumer **app only** | Consumer session ends; the AccessLobby browser SSO session may remain. |
| S2 | Sign out of AccessLobby and supported apps from the web, then repeat from the consumer | The issuer session ends; participating clients clear matching local sessions through verified backchannel logout. A temporarily unavailable app may keep a local session until expiry; record actual behavior. |
| E1 | Open malformed sign-in/callback requests without credentials | Branded, plain-language error; callback rejects missing/wrong state and code without creating a session. |

For W2, C2, L1 and N2, record only whether IDs were stable, distinct or preserved; never copy the IDs into a public issue. Recheck `/v1/me` token rejection, suspended identity and concurrent first-login mapping through the existing API integration qualification rather than using a browser token in a shared report.

## Layout and operational pass

At 360×800, 390×844, 412×924, 768×1024, 1366×768 and 1440×900, check the public home, login, registration, invalid request, signed-in account/identity, recovery planned state and consumer account-choice/linked state. Assert `scrollWidth <= clientWidth` on each page, visible keyboard focus, usable touch targets and light/dark readability. A static screenshot is not an overflow assertion.

Correlate any repeated consumer 502/timeout with private Traefik and consumer logs at the same UTC time. Verify scheduled backup execution and monitoring, then rehearse an application rollback in a separate safe window with the theme/realm setting coupled to the IAM image as described in the cutover runbook. Do not restore the live Dokploy panel as a trial. Close staging issues only after their specific rows pass; production still needs a separate Go/No-Go and owner release decision.
