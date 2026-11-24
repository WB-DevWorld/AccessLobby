# WordPress consolidation acceptance — 2026-11-24

> Historical alpha.6 evidence. Cursor's later partial-Join probe uncovered a late-hook malformed-account gap outside this earlier matrix. Use the [qualified alpha.7 record](late-hook/ACCEPTANCE.md) for new pilots; the old ZIP remains only the exact tested upgrade baseline.

Qualified implementation/release source: **b683fcf776de50bf8606ca772c38625633c19110** on feat/wordpress-consolidation, [PR62](https://github.com/WB-DevWorld/AccessLobby/pull/62). Evidence-only successors must retain the same packaged bytes and pass their required head checks. This record qualifies isolated fixtures and a first-party pilot candidate; the real estate MVP and universal external WordPress support remain incomplete.

## Current AccessLobby state

Main and the publicly observed API revision remain **3d9220a140d61df5effe633bc72cf5142c4a8371**. At 10:25 UTC, public web, API live/ready and OIDC discovery returned 200; API reported ready and that exact revision. [Read-only observation](staging-observation.json). Running staging image digests and private host configuration were not read here. No candidate deployment, main merge or production change occurred.

PR62 consolidates PR61/3131df44bb7f6bb006a2dac6bcbac29591f288e9 and selected Cursor PR60/6ad3ec96d3c18f06d993c8e72d941fc0d90dd8e1 changes. Cursor independently advanced to 04941d9f179c29739de25a3e8d5a277692bc28c2; its stronger host/browser TLS checks are incorporated too. Neither source branch was modified by this consolidation. PR60/61 remain separate drafts; issue59 stays open. [ADR013](../../adr/013-wordpress-first-party-consolidation.md) explains the selection and boundaries.

## Connector and package

AccessLobby SSO for WordPress **0.1.0-alpha.6** remains a standalone, independently versioned installable plugin under integrations/wordpress in the existing canonical AccessLobby repository. No duplicate connector repository was created.

The normal installable ZIP has **50 files / 91,112 bytes**, SHA256 **64eea67c7c71a8504d1dde3df1b3241f4d32b1185ae693479eb286e4f1be9fc5**. Linux and native Windows CI artifacts are byte-identical, and every archived file matches the qualified Git source. No tests, fixture exceptions, private configuration or TypeScript service are shipped inside it. [Package verification](package-verification.json).

PHP 8.3+ and WordPress 6.9+ are the declared floors. Actual bounded runtime versions appear below. PHP 8.5 passes protocol/static/coding/package checks but has no WordPress browser lane. Multisite/network activation is explicitly unsupported. WoodMart/B2BKing and proprietary extensions require actual estate qualification.

## Modes and account flows

Both **WordPress + AccessLobby** and **AccessLobby only** pass the full fixture matrix. Hybrid preserves local login and adds SSO. Enforced mode automatically starts supported interactive login, preserves a safe original destination, rejects ordinary password/cookie/registration bypass and requires migration readiness. Dedicated shortcode/block pages also redirect without JavaScript; unselected public pages containing login actions remain public. Machine authentication has explicit separate policy.

| Journey | Observed behavior |
|---|---|
| New person / Join / JIT | Real IAM registration and synthetic email verification precede local account creation. Opt-in JIT creates one unprivileged local account only after token, identity and app-entry validation. |
| Existing local account | Current local proof plus fresh AccessLobby proof stores an atomic durable mapping. Re-entry resolves the original local ID, role and data; matching email alone never links. |
| Existing unlinked or conflicting account | Fails closed to explicit linking. Email equality, a different person or a link race cannot acquire the local account or create a safe-merge shortcut. |
| Staff / administrator | Explicit privileged linking, local capabilities and auditable readiness; no organization/claim-to-administrator mapping or privileged JIT. |
| WooCommerce customer | Original synthetic customer/order ownership, addresses, role and business metadata survive link/unlink/relink/upgrade in CPT and HPOS. Actual estate subscriptions/downloads/extensions are not certified. |
| Guest | Actual anonymous purchasing survives enforced SSO where Woo enables guest checkout. Required-account checkout is a local business policy. |
| Disconnect / recovery | Fresh dual proof in hybrid mode; sessions rotate/revoke while local data remains. Enforced unlink is denied. Explicit host recovery and authorized rollback preserve accounts/orders/mappings. |

Security/database cases cover changed email/provider subject continuity, audit/schema/storage failures, post-hook role escalation, duplicate/racing links/JIT/state consumption, malformed callbacks/tokens and original local ownership. The short host-issued emergency ticket requires explicit configuration, an eligible existing administrator and exact allowed IP; consumption/replay and rollback are tested. It is not a public password fallback.

## Logout and actual shared SSO

Site-only logout ends only the current WordPress local session; IAM and peer applications remain active, with quiet re-entry. Shared-browser logout ends IAM SSO and corresponding participating WordPress/reference-app sessions. Another browser/device remains signed in; this is not sign out every device.

Signed backchannel validation rejects malformed/signature/issuer/audience/event/age/replay/unrelated-session inputs and targets matching WordPress sessions. Optional opaque receipts reconcile a missed peer on the next due check, normally 30 seconds, with at most 90 seconds of outage grace and no extension to session expiry. Legacy API/session compatibility remains bounded. Real browser checks prove independent root and /gh WordPress sessions plus both-direction SSO/logout with an independent reference application.

## Qualification matrix

Each full lane has two independent WordPress installations/clients. Site A is the root; Site B is a separate plain WordPress installation at /gh. All listed rows pass both modes, linking, JIT, logout, quiet SSO, security/database/lifecycle checks and exact alpha.5 → alpha.6 ZIP upgrade. This is **QUALIFIED (fixture)**, not an estate deployment.

| WordPress | PHP observed | Site A Woo / storage | Theme | Browser cases | Result |
|---|---|---|---|---:|---|
| 7.1.5 | 8.4.28 | 11.3.1 / CPT | Twenty Twenty-Five 1.5 | 72 | PASS |
| 7.1.5 | 8.3.37 | 11.3.1 / HPOS | Twenty Twenty-Five 1.5 | 72 | PASS |
| 6.9.12 | 8.3.37 | None | Twenty Twenty-Five 1.4 | 68 | PASS |
| 7.1.4 | 8.4.28 | 11.2.1 / CPT | Twenty Twenty-Five 1.5 | 72 | PASS |
| 7.1.1 | 8.4.28 | 11.1.1 / CPT | Kadence 1.5.2 | 72 | PASS |

The additional **representative HTTPS smoke** runs nginx 1.28/PHP-FPM 8.4.28, root Woo 11.3.1 and independent /gh WP 7.1.5. Docker-network, host and Chromium all verify the fixture CA and expected hostname; host/browser negotiate TLS 1.3. Cookies are Secure, HttpOnly and host/path scoped. Logout returns private/no-store. Both clients are created through real typed registration, origin verification, private provisioning and actual IAM readback. TXT lookup and owner review are explicitly synthetic; public domain ownership is not proved. The smoke has nine FLOW scenarios plus BROWSER_PASS; it does not replace or enlarge the 356-case full matrix.

| Actual site | Reported environment from Cursor's read-only inventory | This candidate's modes / login / linking / JIT / logout / SSO |
|---|---|---|
| training.cetechbpa.com | WP 7.1.4/PHP 8.4.24/Woo 11.2.1; active WoodMart child/parent 8.6.6, B2BKing 5.6.80, WP Rocket 3.24, Redis 3.0.0; guest yes | BLOCKED here / NOT RUN |
| staging.cetechbpa.com | WP 7.1.5/PHP 8.4.27/Woo 11.2.1; WoodMart child/parent 8.6.6, WP Rocket 3.24, Redis 3.0.0, Wordfence 9.1.1; guest no | BLOCKED here / NOT RUN |
| training.flairoc.com | WP 7.1.1/PHP 8.4.25/Woo 11.1.1; active Kadence 1.5.2; installed inactive WoodMart 8.6.1, WoodMart Core 1.1.9; guest no | BLOCKED here / NOT RUN |
| flairoc.com/gh and /intl | Historical independent-install leads; current topology/private qualification not established here | NOT RUN; production migration not attempted |
| pos.cetechbpa.com and CETECH /gh /ng /en | Historical leads only; current WordPress/topology cannot be inferred | NOT RUN |

Inventory source is attributed in the bundled site-qualification guide. No actual estate plugin installation, backup/restore, customer test or licensed theme qualification occurred here. Earlier SSH attempts returned network-unreachable before authentication; this cycle did not establish a new SSH route. The owner reports Cursor has that route. Default/Kadence version fixtures do not certify WoodMart, B2BKing, WPML, Wordfence, Cloudflare, WP Rocket, Redis, checkout Blocks or subscription/download extensions.

## CI and evidence

All 13 jobs pass on the qualified release source:

- [WordPress 45375103385](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45375103385): three PHP 8.3/8.4/8.5 protocol/static/security/package jobs, Windows packaging, five full two-site browser matrices and the representative trusted-HTTPS smoke.
- [General CI 45375105500](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45375105500): verify and live IAM onboarding. API 24/web 22/reference 16, infrastructure 45 and private-client 9 tests; API 24/reference 16 repeat against the same database under normal concurrency. Production audit has no known vulnerabilities; builds, UI/PWA/offline/update, IAM, container and proxy checks pass.
- [IAM theme 45375103420](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45375103420): existing theme qualification.
- PHP 39 tests /44 assertions per protocol job; fixture safety/syntax/TLS-diagnostic tests 5. The pure isolated-schema/port improvements do not borrow a pass from an earlier candidate.

[CI index](ci-index.json), [categorical markers](ci/categorical-ci-markers.json) and per-lane JSON retain exact source/build checkout, archive/package hashes, versions and results. The synthetic PR merge checkout differs from the candidate head and is recorded honestly; sourceDirty is false. Exact prior alpha.5 ZIP SHA256 is f85e2eb00ba3e71742f435e9bb9025c189c6b1f2819081a388d60969bada20c2.

The initial dd157 implementation run passed 12 jobs but the representative API did not start. A locally reproduced generated-JavaScript newline syntax error was corrected in 2ac7da4, with an early syntax check and bounded categorical diagnostics. Later stricter TLS gates passed at d635626 and the final release source. Windows metadata was normalized; no failure is relabeled as a successful run. The first 90,903-byte alpha.6 pre-release package had a different digest; the canonical 91,112-byte package above includes reconciled documentation and has its own complete run.

Local API/web typecheck/build, web 22/reference 16, Python infrastructure 45/fixture5 and production dependency audit pass. PHP, PostgreSQL, Docker and browser runtime qualification ran remotely in CI, not locally. Public staging probes are independent read-only observations, not candidate acceptance.

## External support and remaining gates

Stage A retains reviewed first-party WordPress registration and admission. Runtime migrations stop at 006. Stage B consent/profile routes, UI/navigation, private preparation CLI and migrations 007/008 are excluded; even a stale enablement flag cannot expose the preview. Fresh databases create no external preview tables. Existing development preview data is retained. Complete inactive preview work remains preserved in PR61.

The real pairwise negative probe produces different subjects with one IAM credential prompt, but still finds cross-client shared sid/undeclared claims; the external API correctly denies entry and activates zero external applications. This is an expected **closed privacy gate**, not safe external issuance. App-scoped identity, token-wide privacy, minimal consent/scopes, publisher/domain verification, client lifecycle/transfer/retention and an external-like pilot still need completion. The consolidated runtime does not provide external consent UX.

Next: controlled two-site estate adoption using the [staging runbook](../../runbooks/wordpress-consolidation-staging.md), actual licensed/cache/security/extension checks, a real backup/recovery/rollback record, review/immutable staging promotion, then separate production authorization. Multisite remains unsupported and external activation remains closed. No percentage or completed-MVP claim substitutes for those gates.
