# Alpha.7 late-hook rollback acceptance — 2026-11-24

Release source: **3d9aa57aef00807ac5174ff28fe807409873a838**, version **0.1.0-alpha.7**, branch feat/wordpress-consolidation / PR62. This is a first-party fixture-qualified pilot candidate; actual estate adoption remains pending. The alpha.6 record is retained as historical evidence and is superseded for new installation by this fix.

## Finding and source reconciliation

Cursor's expanded HTTPS Join case at 0ecc60eb20984cb24e0c185a420484b9ea978646 failed [run 45378656583](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45378656583) because the partial-provisioning fault left a local account or mapping. TLS, cancelled/unverified/collision Join and denied admission had passed first. The stopped local Mailpit experiment was not a successful registration result.

The consolidated native suite already completed the email-verification → password-new → protected return journey; its earlier 356 browser cases did not include this late-hook corruption. An independent red regression at c767b2dd292f8af53bc1ec9e046f119b68e61c81 reproduces the actual defect on **all five** WordPress version/storage/theme lanes. In every lane, hookCalled=true, rejected=false, usersPreserved=false and linksPreserved=false. [Negative matrix](baseline-matrix.json) and [first observation](baseline-negative.json) retain exact run/job evidence. These are expected failing baseline checks, never release passes.

WordPress's [official wp_insert_user source](https://developer.wordpress.org/reference/functions/wp_insert_user/) checks the initial login before applying [wp_pre_insert_user_data](https://developer.wordpress.org/reference/hooks/wp_pre_insert_user_data/). Emptying the username in that later filter can therefore yield an inserted record and returned user ID rather than the early core WP_Error. The old connector guard checked role/capability safety but not the resulting blank login. **CURRENT-REPO-FACT**; focused acceptance pass 41 reconciles the official hook order and both implementations' runtime findings. No owner policy or account-ownership contract is changed.

## Fix and behavior

The connector now rejects an empty or whitespace-only finished username **inside the existing transaction**, before committing its durable mapping/audit or creating a WordPress session. User/usermeta/mapping changes roll back, with existing cache cleanup. A malformed success produces unsafe_provisioning_result; an ordinary earlier WordPress creation error remains local_account_creation_failed.

Valid local username customization is accepted and repeat authentication resolves the same local user. The username is not an external identity key. The guard applies only to a newly JIT-created account; established users, roles, customer records and commerce relationships are not rewritten.

The real browser regression validates an IAM identity, injects the late hook, observes the refused callback, unchanged user/mapping counts and no WordPress login cookie. After removing the fault it retries through quiet IAM SSO, creates exactly one safe local account and repeats login to that same ID. The normal real registration/email/password-new path remains separately exercised.

## Exact package

Normal installable ZIP: **accesslobby-sso-0.1.0-alpha.7.zip**, **50 files / 91,493 bytes**. SHA256 **373dce094881278b9f08e28ba3e847bb6634719605bef761ee251d80fa771afa**. Every archived byte matches the release source; Linux and native Windows CI inner ZIPs match. [Package verification](package-verification.json).

The upgrade fixture uses the exact alpha.6 ZIP from 1c04017e0eeddb505a7b053c7683edb94958cb71, SHA256 64eea67c7c71a8504d1dde3df1b3241f4d32b1185ae693479eb286e4f1be9fc5. An already-established normal SSO session, local user/role/mapping/commerce survive alpha.6 → alpha.7.

## CI and runtime evidence

All 13 jobs pass at this release source:

- [WordPress 45380567670](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45380567670): PHP 8.3/8.4/8.5 protocol/static/coding/audit/package, native Windows packaging, five full real-IAM/two-WordPress matrices and distinct-hostname/nginx/PHP-FPM trusted-HTTPS smoke.
- [General CI 45380567582](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45380567582): verify and live IAM onboarding, existing API 24/web 22/reference 16, API/reference repeatability, infrastructure 45/private-client 9, dependency audit, builds, UI/PWA/offline/update, container/proxy regressions.
- [IAM theme 45380567470](https://github.com/WB-DevWorld/AccessLobby/actions/runs/45380567470): existing theme regression.

| Full two-site fixture | Storage/theme | Browser cases | Security assertions per site | Result |
|---|---|---:|---:|---|
| WP 7.1.5/PHP 8.4.28/Woo 11.3.1 | CPT/default | 73 | 33 | PASS |
| WP 7.1.5/PHP 8.3.37/Woo 11.3.1 | HPOS/default | 73 | 33 | PASS |
| WP 6.9.12/PHP 8.3.37/no Woo | Plain/default | 69 | 33 | PASS |
| WP 7.1.4/PHP 8.4.28/Woo 11.2.1 | CPT/default | 73 | 33 | PASS |
| WP 7.1.1/PHP 8.4.28/Woo 11.1.1 | CPT/Kadence 1.5.2 | 73 | 33 | PASS |

Total **361 browser cases**. Security assertions increase from 25 to 33 per site: blank/whitespace rejection and rollback, valid customization/repeat mapping, and early core-error behavior. PHP unit suite remains 39 tests / 44 assertions; fixture safety/syntax/TLS tests 5. Per-lane database integration, concurrency, install/activate/deactivate/reactivate/update/uninstall/reinstall preservation and negative privacy probes pass. Both authentication modes, fresh linking, JIT, guest policy, cross-app SSO and both logout choices remain covered.

The separate representative hosting smoke retains its nine FLOW scenarios plus BROWSER_PASS, trusted Docker/host/Chromium CA checks, TLS 1.3 and exact real-client registration/proof/provisioning/IAM readback. It does not claim Cursor's later extended Join/lifecycle cases; native coverage is reported separately.

[CI index and report checksums](ci-index.json) retain exact candidate and synthetic merge checkout, sourceDirty=false, runtime versions, archive/package hashes and categorical results. The first 17a4dcf test draft used a happy-path browser helper that excluded the deliberately rejected callback URL; the next test-only commit waits for that error directly. It does not change the packaged fix or relabel the draft as release-qualified.

Local JavaScript/Python syntax and five fixture safety tests pass. Real PHP/WordPress/PostgreSQL/IAM/browser checks ran in CI, not locally. No raw token, password, callback query, verification link, session cookie or customer content is retained in the reports.

## Release and remaining gates

Use the [controlled staging runbook](../../../runbooks/wordpress-consolidation-staging.md) and current package digest. Keep alpha.6's records/ZIP as the exact tested upgrade baseline, rather than the recommended new pilot package. No main merge, AccessLobby image promotion, estate installation or production migration occurred.

The full alpha.6 acceptance retains the broader account/authorization/logout/privacy and actual site-inventory boundaries. They remain unchanged: first-party app admission is separate from local roles/commerce; migration readiness and deliberate host recovery are required; real CETECH/FLAIROC, licensed WoodMart/B2BKing/cache/security/extensions, backup/rollback and public-domain two-site adoption are not qualified here. Actual subscriptions/downloads and custom membership plugins require their own evidence.

External activation remains closed; Stage B consent/profile work remains preserved in PR61 and excluded from this runtime. Fresh production migrations end at 006, and stale preview flags cannot enable it. Multisite remains unsupported. Issue59 stays open.
