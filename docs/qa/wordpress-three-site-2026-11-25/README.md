# FLAIROC customer linking and cross-domain qualification

Status: **PARTIALLY QUALIFIED estate; the bounded FLAIROC flows below are accepted operator evidence.** This integrator reviewed the published commits and checked their chronology. Private host/browser flows were not repeated.

| Published source | Contribution |
|---|---|
| `abe267a94a8af395e6f3d77f62630713f78e96c2` | Private IAM metadata result and the then-blocked FLAIROC customer context |
| `58c323a7bf2bc1223ec0af3f39ef5316b5db3bab` | FLAIROC customer link, quiet SSO, both logout scopes and the valid independent control |
| `1e747287200d5846f8d65e4ad293cd23e179ef7f` | Parallel lane ownership and unchanged email-access blocker |

All three commits are on `feat/wordpress-estate-qualification`. Main at this review is `de71ec978d9c5dcc2eaa4e3076eb7a7da94ed223`. Reported runtime remains `d875712`, plugin `0.1.0-alpha.9`, hybrid, JIT off and enforced mode off. No image promotion is inferred from Git publication.

## Accepted new flows

| Flow | Evidence and result |
|---|---|
| Correct local account before linking | FLAIROC administrator 77 signed out of that site only: audit 4 at `1795634208`. Customer 122 then signed in locally. |
| Explicit customer link | `account_linked` 6 and `callback_succeeded` 8 at `1795634332`; active `dual_proof` to the original shared qualification person. Administrator 77 was not linked. |
| Quiet cross-domain entry | The same browser entered CETECH training as customer 45 without a password form: audits 105–107 at `1795634411`–`1795634414`. |
| Site-only logout isolation | FLAIROC audit 9 at `1795634496` left the existing training session authenticated. |
| FLAIROC-initiated shared logout | FLAIROC recorded its request at `1795634819`; signed acceptance 16 followed at `1795634840`. Training signed acceptance 116 at `1795634843` removed the targeted association before another training page opened. |
| Live independent control | Training's target expired at `1795634994`, so delivery preceded its expiry by 151 seconds. The independent control authenticated last, callback 115 at `1795634775`, expiring `1795635075`. At `1795634870` it still had 205 seconds; its fresh Orders request remained authenticated and showed order 50402, with no password form or `session_reconciled_ended`. |

This establishes a live independent-browser isolation observation for the FLAIROC-initiated direction. It preserves the previously accepted AccessLobby-initiated control result. It does not retroactively validate the expired control in the earlier staging-initiated run, prove every direction/device, or establish a simultaneous three-site logout matrix. The new signed delivery is supported by operator audit; no new origin HTTP status is claimed here.

## Preserved state

| Site | Preserved information |
|---|---|
| FLAIROC training | Customer 122, customer role, order 4043 on-hold and owned locally, 49 users, guest checkout off, coming-soon behavior and existing account exemption |
| CETECH training | Customer 45, customer role, order 50402 on-hold and owned locally, 39 users, guest checkout on |
| CETECH staging | Existing customer 3212 link and prior acceptance retained; last reported audit remains 23. No new staging browser flow was performed in this follow-up. |

The [estate summary](../wordpress-estate-2026-11-24/README.md) now corrects older zero-link/current-capability rows for FLAIROC. Older chronological observations retain their original dates and boundaries. [Categorical observations](operator-followup.json) retain the audit times and source references without credentials, tokens or session identifiers.

## Email access and remaining Join work

The domain already uses Forward Email MX and SPF. The four checked DKIM names were absent; the provider's actual selector remains unconfirmed. Do not infer that all DKIM is absent or change DNS from guesses.

Saved mailboxes are `official@cetechbpa.com` and `jane@cetechbpa.com`. Their saved credentials were left unread. The operator had no signed-in Forward Email session or usable protected alias SMTP credential. No SMTP setting was written, no message sent, no administrative verification override performed and no fresh verified Join started. JIT remains off.

The owner selects signing in to Forward Email in **Cursor's existing Edge qualification profile**. Completion of that sign-in has not yet been reported. Cursor should first confirm the session, correct account/domain/alias, outbound entitlement, approved receiving inbox and availability of the existing alias SMTP credential. A signed-in account does not by itself prove SMTP delivery or completed email verification. Keep existing credentials and delivery in place; do not create a replacement provider or rotate credentials to fill missing access.

After that prerequisite, the existing owner-authorized sequence remains: protected staging SMTP configuration with rollback, actual controlled delivery, genuine mailbox verification for the synthetic user, a fresh WordPress-originated flow with validated new claims, and bounded training JIT creation/reuse/collision qualification. Restore JIT off afterward. Do not repeat the already accepted FLAIROC flows without a concrete failure or changed baseline.

## Parallel boundaries

PR #73 retains migrations 009/010, operator/review modules, `/v1/admin/*` and `/admin/*`. Cursor retains Forward Email, genuine verification, Join/JIT and estate qualification under #59. Shared ledger and contract edits belong to the integrator. This increment changes evidence only.

Issue #59 stays open for genuine verified Join/JIT, privileged migration, recovery/enforced mode, remaining estate/outage/rollback and external privacy/production gates. Issue #72 retains operator-console staging/bootstrap acceptance. No console deployment, real operator role grant, new realm or production change occurred in this reconciliation.
