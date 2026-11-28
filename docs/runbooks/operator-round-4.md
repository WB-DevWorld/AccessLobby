# Round four — five account, app and audit features

Qualified source release8f63578, 28 November 2026. The [immutable API/web pins and rollback](../releases/operator-round4-staging-2026-11-28.json) bind the selected application source; newer documentation images are not selected. [Issue85](https://github.com/WB-DevWorld/AccessLobby/issues/85) coordinates one integrated release. Source readiness, exact-head CI, source-bound images and actual staging acceptance are separate results.

## Accepted work and parallel ownership

Release713140ad is already running. Evidence d8ebd66/65bedeb accepts normal worker activation and visible owner overview, hard reload, navigation, four tables, nested organization and closed realm disclosure. Existing owner grants remain in place. No repeated bootstrap, accepted read qualification, SMTP delivery or WordPress test belongs to this source round.

Cursor can execute the three existing live agendas in Issue85 while source agents finish this release: private Keycloak browser access; controlled person/session/app suspension; application request/domain proof/independent review/private worker/real consumer. A missing supported PEM facility blocks only private browser access. Those procedures use the existing713140ad runtime until a separately qualified release handoff is issued. Coordinate host changes so there is one operator and one rollout window.

## New interfaces

| Person | Interface | Action |
|---|---|---|
| Any signed-in account | Account menu → App sessions (`/security`) | Review its recorded participating-app sessions, confirm and end one |
| Application operator | Operator console → Applications → application → Manage launch link | Set a public HTTPS entry URL on the approved callback origin, or leave it blank to remove it |
| Admitted person | Apps or account app cards | Open an app that has a valid approved entry link |
| Any console reader | Operator console → Audit → Filters | Filter safe history and download up to1000matching events as CSV |
| Application owner | Developer tools → application entry grants | Inspect current grants, issue an optional exact UTC expiry or revoke entry |
| Any signed-in account | App sessions → History | View its own recorded session-ending actions within30days |

The short normal view exposes actions and essential consequences. Background details remain closed. App sessions are receipt-backed observations, not a device inventory. Ending one does not revoke app entry or end IAM SSO. Launch links do not grant access or alter peer permissions. CSV covers stored operator history only.

## Controlled staging acceptance — after one qualified rollout

Use separate ordinary fixture people/apps and the existing real operator; never revoke that operator’s grants or mutate accepted customer links. Keep300second tokens and record actual remaining validity. No token, capability, cookie, raw session/provider identifier or real owner UUID enters public evidence.

1. Establish genuine receipt-backed fixtures for the ordinary person in two clients and a distinct browser SSO session. A compatible controlled harness must negotiate fresh receipts through `GET /v1/me` with `x-accesslobby-session-receipt: 1`; the reference consumer does not do this automatically. Synthetic CI signing must never be used against staging. Check the ordinary `/security` UI with the worker active. End one selected group; prove its old capability denies while other client/browser controls survive. Changed snapshots must conflict, and retry must not end fresh authentication. Foreign and peer-client access must deny. Preserve any accepted fixtures already used by Cursor.
2. On a separate active first-party app, set the launch link through the actual operator form. Record before/after callback/logout/review/grant facts unchanged. Refuse a foreign origin, malformed URL, stale page and ordinary/reader write. On Apps, show a real link only when current entry is allowed; an ungranted restricted discoverable app may remain listed without a link. Add/revoke only a controlled fixture grant to prove both states. Open the intended consumer and prove its independent authentication/admission/resource checks. An empty link list alone is not this test.
3. Filter Audit by the controlled launch action, actor/target/reference and UTC dates. Check paging retains filters, then use the native download. Confirm expected rows, fixed seven columns/filename, private/no-store/nosniff and denied ordinary/revoked access. Use only separate disposable authority for revocation; retain real owner grants. Export starts from the first matching row and reports truncation at1000events; it does not provide a historical snapshot across later writes.

4. As the controlled app owner, inspect the restricted app's grant list. Issue a future exact UTC grant, verify its displayed deadline and real entry, then use a controlled expired fixture/deadline to prove expiry denial. Reject an impossible date, past instant, other-owner inspection and suspended target; exercise paging and native revoke without changing any accepted grant. Blank expiry remains indefinite. App roles stay local.
5. As the ordinary person who ended a recorded session, open its ending history. Verify the real action/client/time/count and pagination, no foreign records or provider/session values, and current-authentication denial. The last30days describes the display window, not guaranteed immediate physical deletion or every sign-in event.

## Release and recovery

Do not deploy a moving tag or unqualified branch. The selected source is8f63578deb485a9457522f2b8ff0d4b89bb2c588, with the immutable API/web pair in the release record. Its exact-head/main checks and source-bound publication pass. Preserve IAM/gateway/databases/consumer image pins, session secret, issuer/audiences, SMTP587/auth/STARTTLS, realm policies, accepted users/grants/apps and WordPress plugin/hybrid/JIT-off/enforced-off/commerce state.

Before changing staging, capture current effective and encrypted durable pins privately, make current database backups and restore them to an isolated owned PostgreSQL17.11 instance. Compare schema and relevant inventories; never restore over the live databases. Apply the reviewed new API migration artifact through the existing private supported runner using the actual Compose files and `--no-deps`. Require transaction success and explicit001–006/009–017 readback, with007/008 absent. Recreate only API then web at the qualified pins; do not run the IAM reconciler or broad stack redeploy. Read source/digests/schema/health back from the actual containers and durable panel record.

Migrations016/017 are additive. For application rollback, retain the previous713140ad API/web immutable pair and preserve the added tables/events; do not invent down-migrations or delete history. A backup is recovery evidence, not an instruction to overwrite newer live activity. If a migration or readback fails, stop that rollout and use the preserved qualified application pair under the recorded recovery procedure. Do not claim a rollback rehearsal without actually observing it.

Use the normal safe home → Update now flow. Retain the worker and grant generations. Finish all five new feature acceptance sections in one fresh-session sequence, preparing independent timed controls last. Renew authentication when necessary; do not lengthen token lifetimes to force a pass. Publish one sanitized result table with source/digests, schema, audit references, fixture deltas, final disposition and exact blockers. Keep85/59/72/74/76 open until their full applicable gates pass.
