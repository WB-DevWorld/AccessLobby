# ADR 016 — Person controls, owner request lifecycle and private activation jobs

Status: implementation candidate, 2026-11-25. Extends [ADR015](015-operator-console.md); implementation, CI, deployment and operator acceptance remain separate stages. Relates to issue74.

## Roles and interfaces

Every role reads the existing console. Additional permissions are independent:

| Role | Additional authority | Interface |
|---|---|---|
| `support_reader` | Read existing identity/organization/application/operator records | `/admin` |
| `application_reviewer` | Independently approve/reject the inspected first-party app revision | `/admin/applications/ID` |
| `identity_operator` | Suspend/re-enable an eligible person | `/admin/people/ID` |
| `application_operator` | Queue approved first-party activation and eligible retries | `/admin/applications/ID`, `/admin/activations` |

Private `manage-operator` grants/revokes these roles. Browser forms cannot grant authority. A revoke/regrant advances the role generation; an idempotent grant does not. Organization roles, publisher ownership and token role claims remain insufficient.

## Person controls and session boundary

The detail page exposes existing identity-database facts and a status version. A change requires a bounded evidence reference, expected version and current `identity_operator` authority. The transaction locks actor/target in deterministic UUID order, rechecks authority, updates status/session cutoff, deletes affected peer receipts and appends operator audit atomically. Idempotent retries do not fabricate another change. Self-targets and people holding any unrevoked platform role are protected; platform-operator offboarding uses the existing private authority process.

Suspension denies API use and receipt checks. A status transition advances a whole-second authentication cutoff: signed token `iat` must be at or after that cutoff. Re-enablement does not revive old bearer tokens or deleted receipts. `/v1/session/end` applies the same check, so an old token cannot revoke a fresh same-IAM-session login. A new authorization-code flow can still reuse a valid IAM SSO cookie; this is not credential rotation, forced password entry or all-device IAM logout. Existing person IDs, links, organizations and grants remain stored. Peers that never check current status retain their own expiry/revocation contract.

## Owner application requests

`/apps/manage/ID` allows the owner to inspect, edit, cancel and resubmit an inactive unreviewed request. Application/client IDs remain stable. Owners cannot use this flow to rewrite active/suspended clients or activate external publishers. Editing covers the supported name, platform, exact callback/logout/backchannel, visibility and entry policy. A version/hash and evidence reference prevent stale writes; command retries are recorded durably.

Edit and resubmit clear origin proof and advance the lifecycle/review revision, including edits that restore earlier values. Hostname changes rotate the DNS challenge. Cancellation frees an outstanding-request slot; resubmission rechecks the serialized quota. Historical reviews remain append-only. Old approval/job snapshots cannot authorize the revised request. Replayed unchanged actions receive neutral notices even if the application has since advanced.

## Activation queue and private execution

The browser queues work and displays `queued`, `running`, `succeeded` or `failed`; queue acceptance is never registry activation. A job pins the exact configuration, review/reference and current requester/reviewer/owner authority generations. Independent review remains mandatory. Reviewer and activation requester may be the same authorized operator; the reviewer must differ from the owner. Restored permissions or owner re-enablement do not revive a stale job; a new authorized enqueue is explicit.

The public API/database job stores no IAM credential. A protected one-job worker claims a bounded exclusive lease using `FOR UPDATE SKIP LOCKED`, receives a short-lived realm client-management token through bounded noninteractive stdin, and rechecks authority/configuration before IAM mutation and completion. Lease tokens stay internal. The existing provisioner still checks fresh DNS and exact issuer/client callback/logout/PKCE/audience settings. Existing mismatches are refused, never silently repaired.

Application activation, job success and their audit commit together. If IAM creation succeeded before a database failure, retry inspects and reuses that exact compatible client. An already-active job-bound recovery uses GET-only readback; it never recreates/enables a missing or drifted client. Five attempts cap recovery. Only eligible failures expose retry; stale authority/configuration requires a renewed reviewed operation. Errors shown publicly use a bounded safe code set.

This candidate supplies explicit `--job` and `--next` execution, not an installed live daemon. A protected scheduler/runner, credential issuance/cleanup and staging acceptance are deployment work. Keycloak client-management authority is realm-wide at the IAM layer; the runner binds its operation to the selected job. It is not a single-client IAM permission.

## Upgrade and recovery

Add migrations011/012/013 after009/010; reserved007/008 remain excluded. Pending legacy approvals lacking generation stamps lose their proof once and require renewed DNS verification plus a current independent review. Immutable history and already-active clients are preserved. Re-running migrations must preserve renewed proof/review. The whole old010→new manifest upgrade is integration-tested.

Do not roll an old API back over the new security/session semantics merely because its schema reads succeed. Keep a verified pre-change database/image baseline, stop/drain private workers, and choose a compatible forward fix or a coordinated tested database/image restore. An IAM client created before a failed transaction requires protected reconciliation, not deletion by guesswork. [Operational procedure](../runbooks/operator-round-2.md).

No realm creation, credential lifecycle UI, app retirement, privileged WordPress migration, arbitrary external activation or verified private Keycloak browser route is delivered by these three features. [Private IAM readiness](../runbooks/private-iam-console.md) remains a separate protected acceptance path.
