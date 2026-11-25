# Jane inbox qualification — 2026-11-25 UTC

The integrator retrieved [Cursor commit6e4cb0f](https://github.com/WB-DevWorld/AccessLobby/commit/6e4cb0fda389fc6a3d1cb2b4ea3f1a205a6a65e1) and [Issue59comment7175168358](https://github.com/WB-DevWorld/AccessLobby/issues/59#issuecomment-7175168358). These are committed operator observations, not a repeated live test by this integrator. They supersede the earlier mailbox blocker and pending one-inbox plan. [Categorical observations](operator-followup.json) retain source/runtime/audit attribution without credentials, subjects, tokens or delivered links.

| Stage | Training users | Active mappings | Result |
|---|---:|---:|---|
| Accepted baseline |40|2|Hybrid, JIT off; accepted45/47 preserved|
| Empty unlinked subscriber48 plus genuinely verified disposable IAM identity |41|2|Same existing receiving address; no disconnect shortcut|
| Fresh login with JIT on |41|2|Email-collision HTTP400/account_link_required130; no local account/link/session created|
| Exact supported cleanup of only the two new disposable accounts |40|2|Address free again; durable central identity/audit retained|
| New normal WordPress-originated registration, initial JIT-off return |40|2|New IAM account; no local provisioning before readiness|
| Genuine delivered verification, fresh login with JIT on |41|3|Subscriber49/account_provisioned137, active validated_jit|
| Site-only logout and repeat login |41|3|Same49/callback143, no duplicate provisioning|
| Final restored state |41|3|Hybrid, JIT off at144, enforced off|

Collision verification completed from the real delivered message; the refused callback is audit130/1795641390. User48 remained empty/unlinked with no session/order until supported deletion. Only the new disposable IAM fixture was ended/deleted; neither original qualification identity nor durable AccessLobby history was removed.

New IAM registration was created1795641522633, after cleanup. The first return occurred unverified with JIT off, so that refusal is not the successful provisioning result. The new delivered verification completed genuinely. Fresh login provisioned49 at1795641961; repeat entry reused it. Source guard ordering establishes admission before local provisioning. No administrative emailVerified override, token-life or realm-wide-verification change is recorded.

The evidence proves normal WordPress-originated registration followed by genuine verification and fresh entry. It does not specify how the second verification send was initiated. Therefore fully unassisted public verification/signup remains a distinct unestablished claim; do not relabel this bounded result as that wider journey.

Customer45, subscriber47, their earlier mappings, order50402/on-hold/owner45 and guest checkout on remain. Runtime source d875712, plugin0.1.0-alpha.9, SMTP587/STARTTLS and image pins stay unchanged. Staging and FLAIROC were not changed. Issue59 remains open for its other acceptance gates, including privileged/enforced migration and real emergency recovery. Accepted tests need not be repeated merely to refresh this summary.
