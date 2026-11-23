# WordPress alpha.4 acceptance and remaining delivery

2026-11-23 UTC. **Qualified independent comparison candidate; the real-estate WordPress MVP and universal external support remain incomplete.** This cycle implements registration, continuing sessions and closed external preparation, and expands actual runtime qualification. It does not select a winner, merge either branch or promote production.

## AccessLobby, repository and release identity

| Item | Exact state |
|---|---|
| Canonical source | WB-DevWorld/AccessLobby; independently versioned plugin at integrations/wordpress |
| Our branch / PR | feat/wordpress-codex-comparison / [draft PR61](https://github.com/WB-DevWorld/AccessLobby/pull/61) |
| Tested implementation | `7c9ec8c8985939addb17ccf1e25bd8313c652eb3`; later release-tooling/evidence commits preserve all packaged bytes |
| Common Cursor handoff | `92afbb261672401426aa4d8d3ad36f2e81ac13fd` |
| Other candidate | Cursor [PR60](https://github.com/WB-DevWorld/AccessLobby/pull/60), observed 948018e9; separate and unmodified by this lane |
| Main / public staging API | `3d9220a140d61df5effe633bc72cf5142c4a8371`; read-only web200, live200/ok, ready200/ready and exact issuer discovery at 23:33 UTC |
| Deployment limit | No AccessLobby/WordPress staging or production deployment by this candidate; private running image digests and full IAM inventory not read back |
| Issue | [59](https://github.com/WB-DevWorld/AccessLobby/issues/59) remains open |
| Connector | AccessLobby SSO for WordPress **0.1.0-alpha.4** |
| Installable ZIP | accesslobby-sso-0.1.0-alpha.4.zip; 87809 bytes / 49 files |
| ZIP SHA256 | `906f904449dc23a1d5bfaeab07c77365bd09c5cdf57a094a00676cb2d33cb4f5` |

The CI artifact inner ZIP matches this digest, and every packaged file matches the tested Git revision. It is a normal standalone PHP plugin with no TypeScript service import, private IAM-table dependency or runtime library download. Canonical repository extraction remains pending available repository-creation/governance tooling; do not create a duplicate fork casually. The code stays independently versioned and distributable in the current canonical tree.

## Implemented authentication and account behavior

Both primary modes are exercised. **WordPress + AccessLobby** retains local login and adds Continue with AccessLobby. **AccessLobby only** starts authentication automatically from supported core/admin/frontend/Woo surfaces after readiness checks. Original safe destinations survive; local authorization remains local.

| Flow | Tested result / precise boundary |
|---|---|
| New visitor / Join | Real IAM registration and synthetic email verification precede one safe local account; repeat sign-in reuses it |
| JIT | Explicit opt-in; verified identity/email and app admission; safe subscriber/customer defaults; no claim-to-admin or organization-owner elevation |
| Existing account | Current WordPress session plus fresh IAM proof in one bounded flow; atomic unique mapping, audit and session rotation |
| Existing unlinked/collision | Email/username equality never merges; collision requires explicit proof; retained inactive links prevent silent duplicate provisioning |
| Disconnect/reconnect | Fresh dual proof preserves the original local user/mapping and commerce; wrong/lost/denied proofs do not alter the link |
| Staff/admin | Explicit privileged account link preserves local capabilities; unlinked privileged users are measured/acknowledged at migration gate; provider MFA policy is not translated into WordPress roles |
| Customer | Existing numeric user/order owner, addresses, role and business metadata stay local; real Woo CRUD checks cover CPT and HPOS |
| Guest | Guest checkout remains a Woo policy; an actual anonymous order succeeds; account-required checkout starts IAM separately |
| Unlink/recovery | Enforced public unlink refuses even a valid local nonce; host recovery/controlled rollback required |
| Emergency administrator | Explicit host enablement, exact remote-IP allowlist, one-use short-lived CLI ticket, intended existing administrator and audit; replay/ordinary shopper denied; no public fallback password screen |
| Machine authentication | Explicit Application Password REST policy tested; CLI/cron retain their separate exemptions; arbitrary XML-RPC/custom machine integrations still need site qualification |
| Domain authorization | WordPress roles, membership/B2B/pricing/commerce rules and reference-peer resource permission remain independent of global identity and app admission |

The registration workflow now works for WordPress's actual URLs. Migration006 adds a typed platform defaulting existing clients to web. WordPress requests/provisioning accept only the fixed callback/signed-out actions on the same wp-login.php path and the exact plain-REST backchannel query (or query-free endpoint), with HTTPS/exact origin checks. Generic web routes remain query-free. Request→domain proof→private provisioning/readback→app admission is tested on PostgreSQL; DNS/review use explicit synthetic fixtures. Runtime IAM validates the exact root and subdirectory callbacks. Actual public estate DNS/client activation is still required.

## Logout, continuing admission and availability

**This site** ends only its local WordPress session. IAM and the other WordPress/reference sessions stay active; re-entry can be quiet SSO. **All connected apps** records the current verified browser-session marker, requests issuer logout and delivers signed sid-scoped backchannel notifications. Both WordPress→reference and reference→WordPress directions pass while another browser remains signed in. All connected apps is not all devices.

The connector validates signature/issuer/audience/event/age/sid/jti and replay, and deletes only associated local tokens. The API also rejects malformed nonempty/array logout event values. A body cannot select another session for the durable marker.

Fresh alpha.4 sessions negotiate opaque receipts. The API stores their hashes; WordPress stores them encrypted with its local session association. Due checks normally occur every 30 seconds and re-evaluate expiry, active person/client, app admission and durable revocation. A missed WordPress backchannel is reconciled on the next due request before cookie expiry. Status-service failure permits at most 90 seconds since last successful validation, then authenticated access fails closed; a slow failed check cannot extend that deadline. The unchanged valid cookie can recover after service restoration without a new credential prompt. No refresh token is retained and expiry is never extended.

This is bounded request-time reconciliation, not instant push. Older APIs and pre-upgrade sessions retain their earlier bounded expiry/backchannel behavior until reauthentication. A malformed present receipt fails closed; absence is negotiated legacy compatibility. An unupdated initiator without a marker or API-delivered issuer event cannot provide the new propagation guarantee. Issuer-confirmation cancellation after a marker may already have ended app access without proving the issuer cookie ended. Outages preserve hybrid local login and configured host recovery; new SSO still fails closed.

Deploy additive migrations005–007 and the matching API before plugin rollout to obtain the new capability. Preview tables remain inactive; the public API on main currently lacks this extension. Retain additive tables during rollback. Use the immutable package/source, current guides and the actual host backup/recovery rehearsal; a fixture is not a restore of the real estate.

## Runtime qualification

Each row is a real disposable root WordPress installation plus a second independent `/gh/` installation of the same WordPress version, with separate databases, clients, local IDs/roles and HTTPS origin ports. The companion is plain WordPress with its bundled default theme. A real independent Node reference app uses the same issuer and its own local account store; its HTTP origin is loopback-only. These are not public cross-domain or external-publisher pilots.

| Fixture | WordPress | Actual PHP | Root Woo | Storage | Root theme | Browser cases per pair |
|---|---|---|---|---|---|---|
| wp715-classic | 7.1.5 | 8.4.28 | 11.3.1 | CPT | Twenty Twenty-Five 1.5 | 62 PASS |
| wp715-hpos | 7.1.5 | 8.3.37 | 11.3.1 | HPOS | Twenty Twenty-Five 1.5 | 62 PASS |
| wp69 | 6.9.12 | 8.3.37 | none | n/a | Twenty Twenty-Five 1.4 | 58 PASS |
| wp714-woo112 | 7.1.4 | 8.4.28 | 11.2.1 | CPT | Twenty Twenty-Five 1.5 | 62 PASS |
| wp711-kadence | 7.1.1 | 8.4.28 | 11.1.1 | CPT | Kadence 1.5.2 | 62 PASS |

All rows are **QUALIFIED (bounded fixture)**. Each includes both modes, Join/link/disconnect, quiet two-site SSO, targeted logout/device isolation, outage/recovery, guest policy, editor/shortcode/mobile mounted forms, independent reference-app SSO/logout and an actual alpha.2→alpha.4 ZIP upgrade preserving an old session and local data. Root and companion pass installation, activation/deactivation/reactivation, schema-failure/idempotence checks and uninstall/reinstall preservation. Database assertions are 43(Woo)/41(plain) per root and 41 per companion, with 19 security assertions per site and three independent-process race cases per pair. No users, mappings or orders are deleted on uninstall.

PHP 8.3/8.4/8.5 protocol, static, coding/dependency and packaging jobs pass; PHP 8.5 real WordPress browser runtime is untested. Tested floors are WordPress 6.9+ and PHP 8.3+; current Woo is tested on compatible WP 7.x. Multisite/network activation is explicitly unsupported.

## Real site qualification

The following software baseline is **reported read-only inventory** in Cursor's committed CURRENT-WORK.md at 948018e9, not an SSH inventory independently re-executed here. It reports no install, backup or pilot. This workspace again received errno101 before SSH authentication at 23:34 UTC.

| Site | Reported WP / PHP / Woo | Theme / relevant plugins | Guest policy | This candidate's login/link/JIT/logout/SSO |
|---|---|---|---|---|
| training.cetechbpa.com | 7.1.4 / 8.4.24 / 11.2.1 | WoodMart child1.0.0, parent8.6.6; B2BKing5.6.80; WP Rocket3.24; Redis3.0.0 | yes | BLOCKED here / NOT RUN |
| staging.cetechbpa.com | 7.1.5 / 8.4.27 / 11.2.1 | WoodMart child1.0.0, parent8.6.6; WP Rocket3.24; Redis3.0.0; Wordfence9.1.1 | no | BLOCKED here / NOT RUN |
| training.flairoc.com | 7.1.1 / 8.4.25 / 11.1.1 | Active Kadence1.5.2; WoodMart Core1.1.9; WoodMart8.6.1/child installed inactive | no | BLOCKED here / NOT RUN |
| flairoc.com/gh/ and /intl/ | Current topology/version not established here | Historical separate physical-install leads | unverified | NOT RUN; no production mutation |
| CETECH /gh /ng /en, pos site | Locate and inventory current physical installs | Do not infer WordPress or topology | unverified | NOT RUN |

The version-matched default-theme/Kadence fixtures improve compatibility evidence without cloning private data or claiming licensed-stack certification. WoodMart, B2BKing, WPML, WP Rocket, Redis/Cloudflare/Wordfence configuration, modern Woo enhanced login/Checkout Blocks, subscriptions/download extensions and specific membership plugins remain UNTESTED in their actual deployments. No theme file was edited. Kadence header-builder/custom account configurations are separate from the tested core/Woo and conventional-form fixture.

## External support and privacy

Reviewed first-party support is implemented. External activation remains **CLOSED** by the existing database constraint, API registry and private provisioner. A legacy environment allowlist cannot bypass that gate.

Migration007 and the private preparation runner add current DNS/review checks, inactive external classification, suspension, random per-app subjects referring to an existing canonical person, minimal versioned openid consent/withdrawal and concurrent-safe storage. Two apps retain different identifiers for one canonical human; no Person is created from an external pairwise token. Withdrawal/suspension blocks preview resolution; regrant retains the same app identity. The management preview is disabled by default and first-party-web only; responses expose neither canonical/provider identifiers nor opaque subject values. No IAM client or external token is provisioned by preparation.

The real Keycloak 26.7.0 negative probe obtains pairwise ID/access/userinfo data for two isolated IAM-only clients using one SSO session: subjects differ, but a shared sid remains. Both are rejected by the first-party API. The privacy gate correctly fails that exposure and logs categories only. This is a passing negative gate test, not compliant external authentication. Actual product-subject issuance across every token surface, scoped session/logout IDs, external audience/API, consent product UX and publisher/transfer/retention/recovery policy plus an external-like WordPress pilot remain unfinished. Universal self-registration is not claimed.

## Exact evidence and delivery

All 11 CI jobs pass at `7c9ec8c8985939addb17ccf1e25bd8313c652eb3`: [WordPress protocol/five runtime lanes](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45289597912), [API/UI/PWA/offline/update/IAM/container/proxy regression](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45289597984), and [IAM theme](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45289597963). Current API tests 25, web22, Python45 and PHP 39 tests/44assertions pass. The API live-smoke also checks disabled external preview, unknown capability, forged sid rejection, HTTP200 marker/idempotence and another browser's survival. PWA private-route caching/update/session contracts remain intact.

- wp715-classic: clean merge checkout `150fba1f8739a8c02320febf109244d3c8b67d39`; candidate `7c9ec8c8985939addb17ccf1e25bd8313c652eb3`, exact ZIP hash, 62 passing browser cases, both-site lifecycle and three process races retained.
- wp715-hpos: clean merge checkout `150fba1f8739a8c02320febf109244d3c8b67d39`; candidate `7c9ec8c8985939addb17ccf1e25bd8313c652eb3`, exact ZIP hash, 62 passing browser cases, both-site lifecycle and three process races retained.
- wp69: clean merge checkout `150fba1f8739a8c02320febf109244d3c8b67d39`; candidate `7c9ec8c8985939addb17ccf1e25bd8313c652eb3`, exact ZIP hash, 58 passing browser cases, both-site lifecycle and three process races retained.
- wp714-woo112: clean merge checkout `150fba1f8739a8c02320febf109244d3c8b67d39`; candidate `7c9ec8c8985939addb17ccf1e25bd8313c652eb3`, exact ZIP hash, 62 passing browser cases, both-site lifecycle and three process races retained.
- wp711-kadence: clean merge checkout `150fba1f8739a8c02320febf109244d3c8b67d39`; candidate `7c9ec8c8985939addb17ccf1e25bd8313c652eb3`, exact ZIP hash, 62 passing browser cases, both-site lifecycle and three process races retained.

Categorical reports are retained under alpha4-ci-7c9ec8c8. Native real-IAM/WordPress/reference HTTP 24 cases pass separately under alpha4-native-cross; its build records a dirty pre-commit working tree, so it is supplementary protocol evidence, not clean browser/source qualification. Primary browser evidence is the clean CI checkout. Raw realm/logs, tokens/codes/cookies, verification links, customer exports and private credentials are excluded. Package proof and fresh public-health/SSH-route records are separate JSON files.

The review bundle contains the installable ZIP/hash, this report, retained evidence, current setup/migration/admin/security/logout/recovery/developer guides, the read-only site-inventory tool/runbook and an incremental Git bundle from the shared handoff. Source/CI fixture acceptance is distinct from live deployment acceptance. README, changelog and exact immutable revisions let a successor continue without reconstructing chat.

## Remaining delivery

1. Compare and select exact independent candidates, then complete controlled non-production adoption through the reachable estate executor: actual backup/restore reference, reviewed per-site clients/DNS/routes, explicit staff/customer linking, preserved real Woo history, public cross-domain SSO/logout, outage/host recovery and rollback. No production migration or winner is selected here.
2. Qualify the actual licensed theme/business/membership/cache/security/CDN/machine-auth/commerce-extension combinations and production load/adversarial behavior. A public default theme or preserved synthetic metadata does not certify them.
3. Finish external token/session/API/consent/publisher lifecycle and independent WordPress onboarding pilot before activating unrelated publishers. Keep the preview gate closed meanwhile. Multisite requires its own shared-user/session contract.
4. Move to a canonical standalone connector repository only with governance/tool access and preserve history/versioned packaging; stage immutable AccessLobby images through existing protected-main procedures after candidate selection.

No percentage or universal compatibility claim substitutes for those unresolved gates.


## Release tooling portability

The builder now sorts by portable relative paths, uses POSIX ZIP entry names on Windows and refuses symlinks/backslash entries. Git text files are LF on each platform while known binary types remain binary. A dedicated native Windows packaging job compares every ZIP member against committed Git bytes; its result is recorded in the final review bundle LATEST-CHECKS.json and PR checks. Linux rebuilt the exact same906f9044 ZIP after this tooling-only correction. This does not claim WordPress/PHP browser runtime on Windows is qualified.
