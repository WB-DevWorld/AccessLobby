# Real WordPress quiet SSO and signed shared logout — 2026-11-25

Status: **QUALIFIED for the bounded flows below**. Overall WordPress estate: **PARTIALLY QUALIFIED**. Relates to #59. This is first-party non-production acceptance; external publishers, enforced mode and production are not qualified by it.

## Source and revisions

Current follow-up: published [d3650bb2f621fe0d4c05c576b0ceb578fa603cc1](https://github.com/WB-DevWorld/AccessLobby/commit/d3650bb2f621fe0d4c05c576b0ceb578fa603cc1) was retrieved. [Categorical follow-up](join-and-control-followup.json) shows the old control had already expired before the WordPress logout, so its later unauthenticated Orders request is inconclusive for live-control isolation. It does not invalidate the accepted signed receiver/removal cases. Training Join correctly refuses an unverified email without local creation, then JIT is restored off. Successful real-site JIT remains blocked on genuine email verification. FLAIROC's observed page is now coming-soon with an admin toolbar; customer122 is not authenticated and no link was attempted. [Safe verification and session-selection procedure](../../runbooks/wordpress-verified-join-qualification.md).

SOURCE-CONFIRMED operator evidence: [cfd71f0d7a060f40dba1b56427a8420cea1ce10a](https://github.com/WB-DevWorld/AccessLobby/commit/cfd71f0d7a060f40dba1b56427a8420cea1ce10a), CURRENT-WORK.md and the estate ledger. The reviewer retrieved this published commit; it did not access private hosts, credentials, browser sessions or raw tokens. This is verification of committed operator evidence, not another execution of the browser tests. [Categorical evidence](operator-evidence.json) omits session identifiers and credential paths.

CURRENT-REPO-FACT: main afca3f13bbd5639e151f7b32ea192d41e7a86b96 merges PR69's qualified diagnostics. The earlier operator commits061857b1508c2859f640591190c028a6e7bc5e83 and5e778d9f5eceae5d60aa6c9365947a1fe64bc026 are now published and retrievable. Their previously unavailable status is historical. Installed plugin:0.1.0-alpha.9, exact ZIP SHA2566521df67c33a34d8ccdebd8832d26f13355ea5ea66d67397cc645f4254df7d42. Runtime image-source GIT_SHA remains d875712ecb41e06d8905046e0f4bc93bb8e9e7a5; dedicated IAM network configuration came from423b9ac8. Image pins are unchanged by the operator record.

## Independent local accounts and site policy

| Installation / client | Local customer / role | Qualification order | Users | Guest checkout | Mode / JIT |
|---|---|---|---:|---|---|
| training.cetechbpa.com / cetech-training-wp |45 / customer, active dual_proof |50402, on-hold, same owner |39 |On |Hybrid / off |
| staging.cetechbpa.com / cetech-staging-wp |3212 / customer, active dual_proof |54346, on-hold, same owner |2921 |Off |Hybrid / off |

The same verified AccessLobby human maps to two different local WordPress user IDs. Staging's privileged synthetic user3213 remains unlinked. No JIT user, role elevation, account merge, guest-policy change or commerce ownership change is inferred. Last-recorded stacks remain in the [estate inventory](../wordpress-estate-2026-11-24/README.md); this review did not run a fresh software inventory.

## Browser and event evidence

The main Edge qualification profile participates in both sites. A second Edge profile ending al-qual-edge-b signs in as the same qualification person, independently. The application-management owner's browser is not the control. Both profiles are on one Windows computer; this is browser-session isolation, not a different physical-device test.

| Flow | Committed observation | Result |
|---|---|---|
| Staging explicit link |auth_started5 at1795624204; account_linked6/session_started7/callback_succeeded8 at1795624418. Customer3212/role/order54346/users2921 preserved. |QUALIFIED |
| Quiet staging-to-training sign-in |training auth_started87 at1795624582; session_started88/callback_succeeded89 at1795624598 (16:36:38UTC). No password entered. This is a fresh callback, not only viewing an existing account page. |QUALIFIED |
| Staging site-only logout / quiet return |logout9 at1795624695; start10 at1795624698; session11/callback12 at1795624700. Training remains signed in. |QUALIFIED |
| Fresh two-site baseline and independent control |main training90–92/staging13–15; control training callback95 at1795625611. Same human, separate session association. |QUALIFIED |
| AccessLobby-initiated shared logout |staging backchannel_accepted16 at1795625721 (16:55:21UTC), training96 at1795625724 (16:55:24UTC), before either site's next page. Both main-browser associations removed; control association retained. |QUALIFIED signed receiver acceptance / targeted removal |
| Independent browser after AccessLobby logout |fresh control Orders request shows50402, no password form and no session_reconciled_ended. |QUALIFIED browser isolation |
| New main-browser sessions |training97–99 and staging17–19. Staging challenge a602420dd9109342 clears before callback19. |QUALIFIED new baseline |
| WordPress-initiated shared logout |staging receipt20/request21/local22 at1795626644 (17:10:44UTC), own accepted23 at1795626648; training accepted100 at1795626651 (17:10:51UTC) before training is opened. Target training association removed. |QUALIFIED signed peer removal |
| Independent browser after WordPress logout |cfd71f0 retained the old row. Later d3650bb confirms expiry1795625911 is before logout1795626651; the one later Orders request is unauthenticated and writes no audit. |Expired-row preservation only; valid live-control isolation UNTESTED, no logout regression established |

No origin HTTP status is claimed for this two-site pass: the inspected generic nginx access log had no matching backchannel line. Signed receiver acceptance and pre-page session removal are the acceptance evidence. Earlier single-training POST200 observations are different tests and are not relabeled as this pass's HTTP results. Receipt markers are also distinct from signed backchannel events.

## Remaining work

The requested follow-up Orders observation is now recorded in d3650bb, with an already-expired control. Do not keep requesting the same expired session. A future bounded reverse-direction isolation check needs a freshly valid control whose actual expiry extends past the logout/request window; prepare it last and check promptly. Preserve the accepted signed-delivery cases and existing token lifetimes.

FLAIROC's a6024847dd2b3175 challenge is the earlier checkpoint. The new observed page is coming-soon with a WordPress admin toolbar. Clear the site's unidentified authenticated context with site-only logout and reach the real login form; manual verification is needed only if a challenge is actually shown. Confirm synthetic customer122 before linking. Keep coming-soon policy/account exemption and JIT off.

One site's challenge does not block work on an available site. Controlled Join/JIT can be prepared on CETECH training with a separate approved qualification identity/browser and a working verification channel: capture current settings/counts; use the plugin's Join entry and validated safe default role; enable JIT on that one non-production site only; prove no local account before identity/verification/admission succeeds, exactly one safe user/map afterward, repeat-login reuse and collision refusal; preserve roles/commerce/guest policy; restore JIT off and retain evidence. Use the existing [setup](../../../integrations/wordpress/docs/setup.md), [administrator](../../../integrations/wordpress/docs/administrator.md) and [security](../../../integrations/wordpress/docs/security.md) contracts. If browser/mail access blocks that test, record its own precise blocker and continue other independent checks.

Privileged linking, trusted emergency recovery/enforced mode, estate subdirectory qualification, physical-device checks, and relevant negative/outage/rollback cases remain separate. External activation and multisite remain unsupported. No production rollout or universal compatibility claim. Keep #59 open.
