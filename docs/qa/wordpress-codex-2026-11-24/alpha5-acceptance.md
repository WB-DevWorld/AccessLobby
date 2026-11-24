# WordPress alpha.5 acceptance and next deployment gates

2026-11-24 UTC. **Qualified independent comparison candidate; no candidate selection, merge or estate deployment.** The real first-party estate MVP and universal external support remain incomplete. This increment adds working user/admin flows and qualification to the previously proved connector.

## Current AccessLobby and connector identity

| Item | Exact state |
|---|---|
| Repository | WB-DevWorld/AccessLobby; independently versioned standalone plugin in integrations/wordpress |
| Our branch / PR | feat/wordpress-codex-comparison / [draft PR61](https://github.com/WB-DevWorld/AccessLobby/pull/61) |
| Qualified implementation | `f89402321ee0d2432e80164d66c4c39335deaafb` |
| Earlier baseline | a0583c09ac8d89e2ad530e02ba1a8722c58648b7, alpha.4; common handoff92afbb261672401426aa4d8d3ad36f2e81ac13fd |
| Other candidate | Cursor [PR60](https://github.com/WB-DevWorld/AccessLobby/pull/60), observed948018e9a77e0e4bb3fb4b75350092867f08473d; separate, open/draft and unmodified by this lane |
| Main / staging API | `3d9220a140d61df5effe633bc72cf5142c4a8371` |
| Public runtime probe | 2026-11-24T00:33:47.282488+00:00: web200, live200/ok, ready200/ready and exact issuer discovery200 |
| Deployment evidence limit | No candidate AccessLobby/WordPress staging or production deployment; private image digests/IAM settings not read back here |
| Relevant issue | [59](https://github.com/WB-DevWorld/AccessLobby/issues/59) stays open; partial progress |
| Connector version | AccessLobby SSO for WordPress0.1.0-alpha.5 |
| Installable ZIP | accesslobby-sso-0.1.0-alpha.5.zip; 90152 bytes / 50 files |
| ZIP SHA256 | `f85e2eb00ba3e71742f435e9bb9025c189c6b1f2819081a388d60969bada20c2` |
| Runtime support floor | PHP8.3+, WordPress6.9+, OpenSSL/Sodium, HTTPS, InnoDB; multisite explicitly unsupported |

Every packaged byte matches the qualified implementation and the canonical Linux CI artifact. Windows packaging also validates every file against Git; Windows PHP/WordPress runtime is not implied. The normal installable PHP ZIP does not load the TypeScript monorepo at runtime, another app's DB or Keycloak internals. A canonical standalone repository extraction is still pending governance/tooling; this work does not create a duplicate repository.

## What this cycle implements

- **Dedicated frontend login pages:** administrators select published page IDs under Settings → AccessLobby. AccessLobby only redirects on the server, including with JavaScript disabled, preserves a safe original destination and falls back to local home. Public pages with a login button remain public. Shortcode/block and membership adapter filter are theme independent.
- **External consent review and withdrawal:** production Next.js `/connections` and exact application review pages show minimal requested data and inactive status, provide explicit native approval/cancel/withdrawal, and resume the review after real IAM sign-in. The bounded continuation is sealed with OIDC state, revalidated and used only after normal person/context validation. No automatic consent or arbitrary return URL exists.
- **Reviewed configuration and lifecycle:** migration008 binds consent to publisher/site/routes/policy and a fresh review generation. A DB trigger durably invalidates changed and later-restored configurations. Private reverify/resume requires fresh origin proof/review and fresh consent; even unchanged re-review rejects older rendered forms. Original approved display snapshots remain visible for withdrawal.
- **Idempotent and isolated approvals:** concurrent retries produce one app identity/audit change; another human cannot withdraw it. Withdrawal/re-consent preserves one existing canonical Person and the site's opaque identity. Neither preview nor resume provisions or activates a client.

API/web require exact `EXTERNAL_PROFILE_PREVIEW_ENABLED=true`; Compose defaults false. Contract0.2 remains an inactive first-party-web management preview. The first-party identity API and external activation gates retain their meaning. The service worker caches no connection/identity/API content and still requires a safe home boundary for updates.

## Authentication modes and account flows

Both normal modes pass the complete fixture matrix. Hybrid retains local login and adds AccessLobby. Enforced SSO requires readiness/backup/recovery acknowledgements, automatically starts supported interactive login and blocks ordinary local cookie/registration bypass. It does not convert machine authentication into a human flow or create additional login modes.

| Flow | Qualified behavior / boundary |
|---|---|
| New user / Join | Real IAM registration and fixture email verification precede one safe local account; repeat SSO reuses it |
| JIT | Explicit opt-in, validated identity/app admission and verified email, safe local subscriber/customer defaults; no claim privilege elevation |
| Existing account | Fresh AccessLobby proof plus bounded existing WordPress session; atomic unique mapping, audit, rotated link session; original local ID/history retained |
| Existing unlinked/collision | Matching email/username never merges; conflicts fail closed; inactive links cannot silently re-provision |
| Staff/admin | Explicit privileged link preserves local capabilities; readiness counts/acknowledges unlinked privileged users; no organization-owner-to-admin mapping |
| Customer | Original Woo owner/order, addresses, role and business metadata retained through link/disconnect/reconnect/upgrade; CPT and HPOS exercised |
| Guest | Actual anonymous purchase remains possible according to local Woo policy; account-required checkout redirects separately |
| Disconnect/recovery | Fresh dual proof in hybrid; wrong/denied/lost proof preserves link; enforced public unlink refused; controlled host recovery and rollback remain |
| Machine | Explicit Application Password REST setting, CLI/cron exemptions; each site's XML-RPC/custom machine integrations need its own inventory |
| Domain permissions | Membership, B2B, pricing, commerce and protected-resource permission remain local; a real reference consumer separately denies its protected resource after SSO |

## Logout and availability

Site-only clears the local WordPress session and retains IAM/other app sessions; quiet re-entry is proved. All-app logout ends the same IAM browser session and targeted participating WordPress/reference sessions in both directions. Another browser/device remains signed in; this is not all-devices logout. Signed backchannel checks signature, issuer, audience, event/age/sid/replay; malformed/unrelated/replayed requests do not clear other sessions.

Optional opaque receipts reconcile a missed backchannel at the next due check (normally30seconds), with at most90seconds from last successful validation during status-service failure. A slow failure cannot extend grace. Cookie expiry is unchanged; an unavailable check denies authenticated access after the bound, and recovery can reuse the same valid cookie. Legacy API/pre-upgrade sessions retain bounded old behavior until fresh authentication. A marker may already end participating access if issuer confirmation is cancelled; it is not proof the issuer cookie ended.

New SSO fails closed during an identity outage. Hybrid local login and deliberate host emergency recovery remain available under their policy. Emergency access uses explicit host enablement, exact IP, a one-use short CLI ticket and intended existing administrator with audit; no unrestricted public password fallback.

## Clean CI and browser/runtime evidence

Twelve jobs pass at the exact implementation: nine WordPress jobs (three PHP8.3/8.4/8.5 protocol/static/coding/dependency/package, Windows ZIP, five real browser matrices), general verify, real IAM lifecycle/consent smoke and IAM theme. Runs: [WordPress45297822122](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45297822122), [CI45297822106](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45297822106), [theme45297822213](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45297822213).

Every row contains a root installation plus an independent `/gh/` installation with separate DB/client/local IDs, actual HTTPS Keycloak/API and the independent reference consumer. The companion is plain WordPress. HTTPS uses distinct loopback origins, not a public domain/CDN or external-publisher deployment.

| Pair fixture | WordPress | Actual PHP | Root Woo | Storage | Root theme | Browser cases |
|---|---|---|---|---|---|---|
| wp715-classic | 7.1.5 | 8.4.28 | 11.3.1 | CPT | Twenty Twenty-Five 1.5 | 72 PASS |
| wp715-hpos | 7.1.5 | 8.3.37 | 11.3.1 | HPOS | Twenty Twenty-Five 1.5 | 72 PASS |
| wp69 | 6.9.12 | 8.3.37 | none | n/a | Twenty Twenty-Five 1.4 | 68 PASS |
| wp714-woo112 | 7.1.4 | 8.4.28 | 11.2.1 | CPT | Twenty Twenty-Five 1.5 | 72 PASS |
| wp711-kadence | 7.1.1 | 8.4.28 | 11.1.1 | CPT | Kadence 1.5.2 | 72 PASS |

The ten new cases per pair cover selected shortcode/block entry, no-JavaScript protected return, foreign-return rejection and public-page behavior on both installations. The retained suite also proves linking/JIT, safe roles/commerce, mobile modal/Gutenberg, targeted shared/site logout, another browser's survival, outages, real install/activation/deactivation/update/uninstall/reinstall and preserved data. Database/security/concurrency/lifecycle/inventory categories are retained for each lane. A fixture's synthetic B2B flag is not a licensed B2BKing integration test.

Nine additional browser cases use **production Next.js + real IAM/API/PostgreSQL**, including default-off routes, mobile/no-JavaScript sign-in/approval/withdrawal, same-origin and actor isolation, stale form, re-review and suspension/resume. General checks retain API25, web26, PHP39 tests/44 assertions, infrastructure Python45, PWA/offline/update and existing reference/UI/container/proxy regressions. No production audit vulnerability was accepted.

Supplementary native HTTP30 cases pass with PHP8.4.27/WP7.1.5/Woo11.3.1 and the same exact ZIP. `alpha5-native-http/build.json` honestly records a pre-commit dirty tree at a0583c09; it is not the clean-source browser evidence. The initial new fixture incorrectly compared Site B's SSO user to an unrelated unlinked local user; corrected to its established mapping. Initial browser page-selection comparison assumed insertion order rather than HTML submission order; corrected to compare the set. Neither failure is hidden or counted as a pass at its failed source. The final CI re-runs the entire matrix.

## Estate qualification and access

The following inventory is **reported by Cursor PR60/948018e9**, not independently read by this lane. Our fresh TCP22 attempt remains network-unreachable(errno101) before authentication for all owner routes. No site was installed/migrated or used for customer testing here. Site qualification columns are all BLOCKED/NOT RUN until real controlled tests pass.

| Site | Environment / reported stack | Modes, login, linking, JIT, logout, SSO, rollback | Result |
|---|---|---|---|
| staging.cetechbpa.com | Non-production; reported WP7.1.5/PHP8.4.27/Woo11.2.1, WoodMart child1.0/parent8.6.6, WP Rocket3.24, Redis3.0, Wordfence9.1.1; guest checkout no | Not run here | BLOCKED |
| training.cetechbpa.com | Non-production; reported WP7.1.4/PHP8.4.24/Woo11.2.1, WoodMart child1.0/parent8.6.6, B2BKing5.6.80, WP Rocket3.24, Redis3.0; guest checkout yes | Not run here | BLOCKED |
| training.flairoc.com | Non-production; reported WP7.1.1/PHP8.4.25/Woo11.1.1, active Kadence1.5.2; WoodMart installed/inactive, Core1.1.9; guest checkout no | Not run here | BLOCKED |
| flairoc.com/gh/ | Historical separate WordPress/Woo installation lead; current topology/versions not read back | Not run; no production mutation | BLOCKED / UNVERIFIED |
| flairoc.com/intl/ | Historical separate WordPress/Woo installation lead; current topology/versions not read back | Not run; no production mutation | BLOCKED / UNVERIFIED |
| Other CETECH root/subdirectory/POS environments | Historical leads only; current installation/version/access and business integrations need runtime inventory | Not run | UNTESTED |

## External support

First-party plugin support is fixture-qualified; estate adoption remains gated. App-scoped preview IDs are distinct across unrelated apps and refer to one existing human. Minimal `openid` consent review/withdrawal and configuration lifecycle are implemented in the closed preview. **No external client is activated, no privacy-safe external token/API is issued and no external WordPress pilot has run.**

The real Keycloak pairwise probe still finds different subjects but a shared cross-client sid. It must fail the token-wide privacy gate and is never admitted to first-party APIs. Stage B requires product-owned stable app subjects across ID/access/userinfo, scoped session/logout identifiers, external API audience, verified safe provisioning, approved consent/scopes/retention/erasure and transfer policies, full operator onboarding, independent review and an external-like WordPress pilot. Saving a preview approval does not meet these gates.

## Release, rollback and remaining work

Use the installable ZIP and its hash, [setup/admin/migration/recovery/troubleshooting/developer/frontend guides](../../../integrations/wordpress/docs/setup.md), [controlled alpha.5 staging runbook](../../runbooks/wordpress-alpha5-staging.md) and [inactive consent runbook](../../runbooks/external-consent-preview.md). Before real installation back up and rehearse restore; start hybrid, link staff/customers deliberately, rehearse host recovery, then use readiness gates. Retain additive identity/session/preview data during rollback; plugin uninstall must not remove WordPress users or Woo orders. Disable both preview flags before rolling back server code; never backfill old approvals to bypass a fresh review.

Remaining real work: select/review the independent candidates; canonical repository/release publication; controlled immutable AccessLobby API staging adoption; actual estate backup/restore, licensed WoodMart/B2BKing/cache/security/membership and extension/mobile tests; public independent-site SSO/logout; downloads/subscriptions/Blocks checkout where installed; staff MFA/step-up policy qualification; explicit multisite design (currently unsupported); and the listed Stage B issuance/onboarding/privacy gates. These are not hidden behind a completion percentage. The original first-party estate vertical slice and universal external WordPress definition are not declared complete.
