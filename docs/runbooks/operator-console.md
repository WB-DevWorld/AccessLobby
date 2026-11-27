# AccessLobby operator console

Staging update, 2026-11-27: the qualified29292fbe API/web release and migrations009–015 are deployed, with bounded backup/restore and public/anonymous checks accepted. Initial human role bootstrap and signed-in operator acceptance remain pending; [deployment evidence](../qa/operator-staging-2026-11-27/README.md). The private Keycloak companion is not installed.

Original runbook, 2026-11-25. Use this procedure with a qualified artifact that includes [ADR 015](../adr/015-operator-console.md). The round-two candidate additionally implements [ADR016](../adr/016-operator-controls-and-activation-jobs.md); use its [runbook](operator-round-2.md) for migrations011–013, status changes and queued private activation. Deployment facts come from the evidence linked above. These instructions alone grant no person an operator role.

## Where to manage each responsibility

| Responsibility | Interface |
|---|---|
| Platform directory, application review and operator audit | AccessLobby web origin → `/admin` |
| Own application request, DNS proof and entry grants | AccessLobby → `/apps/manage` |
| Organization memberships and invitations | AccessLobby → Personal & organizations |
| Credential, authentication, session and realm administration | Keycloak's protected administrative channel |
| Containers, qualified images, domains, secrets and backups | The Dokploy instance hosting AccessLobby |
| Local WordPress roles, orders and connector settings | Each installation's WordPress dashboard |

The deployed staging web route is `https://accesslobby.realjanelove.com/admin`. The reported document200 is a page shell. Private role bootstrap and signed-in acceptance are still required for management access; a successful login alone grants no console role.

Do not confuse that address with `https://iam.accesslobby.realjanelove.com/admin/`. The public IAM administration path remains blocked. No working private Keycloak browser URL has been verified in this record.

## Deploy and bootstrap

1. Record the exact source, passing CI and API/web image digests. Verify an existing backup and rollback baseline. Apply migrations 009/010 before starting the corresponding API image; migrations 007/008 remain reserved for external-preview development.
2. Confirm ordinary sign-in, identity, organizations, app-owner controls and the accepted consumer paths still work. Confirm public IAM administration remains denied.
3. Identify the intended operator through the established protected operator process. Obtain that person's existing durable AccessLobby UUID and verify the intended human independently. Never select the first registrant, match an email automatically, or accept a role asserted by the browser.
4. From the protected API artifact's working directory, with its protected identity-database connection available as `DATABASE_URL`, run the appropriate command below. In the current API image, that working directory is `/app/apps/api`. Use the actual approved runner/container selection procedure; no container name or host command is assumed here.
5. Sign in as that person and open `/admin`. The navigation includes **Operator console** only when current API authorization succeeds. Record access and denial results before wider use.

Private CLI syntax:

```text
node dist/manage-operator.js PERSON_UUID grant support_reader CHANGE_REFERENCE
node dist/manage-operator.js PERSON_UUID grant application_reviewer CHANGE_REFERENCE
node dist/manage-operator.js PERSON_UUID revoke support_reader CHANGE_REFERENCE
node dist/manage-operator.js PERSON_UUID revoke application_reviewer CHANGE_REFERENCE
```

Replace the placeholders with an explicitly authorized person and a protected evidence reference. Each role is independent: `application_reviewer` already includes console read access, so it does not require an additional `support_reader` grant. Revoke both if the person holds both and should lose all console access. Repeated grants/revocations that change nothing return `changed:false` and do not fabricate a second change event. Revocation may target an existing suspended person; new grants require an active person.

These commands were prepared for authorized operators. No actual live grants, revocations or production changes were executed merely by writing this runbook. Do not print database credentials, tokens or protected connection strings in acceptance evidence.

## Use the console

| Route | Available work |
|---|---|
| `/admin` | Overview, current role and capability boundaries |
| `/admin/people` | Search by durable ID or ID prefix; inspect status, creation time and participation counts |
| `/admin/organizations` | Search names or exact IDs; inspect status and member/owner counts |
| `/admin/applications` | Find applications across owners by name or client ID |
| `/admin/applications/APPLICATION_UUID` | Inspect exact requested configuration, proof and review; authorized independent reviewer records a decision |
| `/admin/audit` | Page through operator role changes, application reviews and updated private-provisioner activations |

List pages return at most 25 records at a time. Use their next-page controls instead of treating one page as the full inventory. The round-one directory is read-only. Round two adds eligible person status controls and private activation progress; merge, delete, credential-reset and organization-owner takeover remain outside these increments.

People data currently contains IDs and status rather than a complete profile. The operator audit is limited to this workflow's events. Existing organization, application, IAM and WordPress event sources are not automatically combined into it.

## Review an application and hand it to the private provisioner

1. The owner requests the application at `/apps/manage`, publishes its exact TXT challenge and selects **Verify DNS record**. This proves callback-host control, not publisher identity or entitlement to first-party activation.
2. A different, explicitly authorized `application_reviewer` opens its console detail. Review the publisher's first-party status, ownership, exact callback/logout/backchannel routes, supported platform, entry policy and visibility. Record the underlying evidence privately. This profile cannot activate arbitrary external publishers.
3. Enter a concise evidence reference and choose **Approve first-party review** or **Reject request**. References accept 4–120 letters/digits or `.`, `_`, `:`, `/`, `-`. Keep secrets and personal data out of them.
4. Confirm the recorded decision and current configuration. Approval reads **Approved · awaiting private activation**; the application remains inactive. A rejection records the refusal but does not delete the request.
5. The protected operator inspects the existing plan, then activates using the exact approved reference:

   ```text
   node dist/provision-app.js APPLICATION_UUID --plan
   node dist/provision-app.js APPLICATION_UUID --activate-first-party REVIEW_REFERENCE
   ```

6. On the private runner only, use the existing short-lived realm client-management `IAM_PROVISIONING_TOKEN` (runner restricted to its selected app) and protected database/internal-IAM configuration. Never add this token to the public service environment or browser. Activation requires a current matching approval and reviewer authority, fresh live DNS proof, and exact IAM client readback. An error leaves the registry inactive.
7. Refresh the console to observe registry status, then qualify the real consumer's login, entry and logout separately. An active registry row alone is not consumer acceptance.

If a request changes while its detail page is open, the server refuses a stale configuration hash. Reload and review the current revision. An identical repeated decision is idempotent; changing a decision for the same revision is refused. After a rejected or outdated review, the owner can re-verify its valid DNS proof to establish a current revision for a new independent decision. This preserves the earlier record. Removing the reviewer's role or suspending that person prevents activation on the old approval.

The existing private suspension command remains separate:

```text
node dist/suspend-app.js APPLICATION_UUID --suspend REFERENCE
```

It first records registry denial, then attempts IAM disable/readback. Retry with the same reference if IAM was unavailable. The console does not add browser suspension or reactivation in this round. Existing peer sessions still follow the documented receipt, recheck and expiry policies.

## Acceptance and recovery

Record exact source/digests, timestamp and categorical PASS/FAIL/BLOCKED/NOT RUN for these checks:

- A current operator can use its allowed pages. A signed-out person, ordinary signed-in person, organization owner/admin and non-web peer client cannot enumerate operator data or submit review decisions.
- A `support_reader` can inspect data but cannot approve/reject. A reviewer cannot review its own application. Revoked/suspended authority is denied on a subsequent request, including from an already open detail page.
- Searches, cursor paging, empty/error states and private/no-store behavior work. No tokens, provider subjects, session IDs or credential values appear in pages or evidence.
- A stale or contradictory decision is refused. A correct decision produces one review and audit event; approval alone creates no IAM client and changes no app to active.
- The protected provisioner rejects absent/rejected/stale approval, inactive reviewer and missing fresh DNS; a controlled approved app activates only after exact IAM verification. Existing active consumers remain usable.
- Desktop/mobile navigation, keyboard use, confirmation behavior and PWA update/offline boundaries pass their applicable checks. Offline pages cannot grant administrative authority.

If authority was granted incorrectly, revoke the affected role through the protected CLI and repeat the denied-request check. Preserve the audit trail. Revoke both roles when applicable. A role revocation does not retract information already read, and application suspension is a separate action.

A deployment rollback must use recorded artifact pins and a compatible schema plan. Do not delete operator/review audit records or re-import an entire realm to roll back a UI change.

## Private Keycloak access and realm creation

Realm administration remains a separate IAM operator responsibility. Once a protected browser route is established and tested, a sufficiently privileged IAM operator selects the administrative realm context and uses **Create realm**; **Clients** manages a selected realm's technical app registrations. Ordinary realm administrators may lack permission to create another realm.

The current gateway intentionally blocks public administrative and master-realm paths. Establishing browser access needs a reviewed private endpoint/tunnel, actual hostname/proxy configuration, trusted TLS, valid administrative login, working console assets/redirects and explicit public-denial regression checks. This procedure is not supplied as an already verified tunnel or URL.

For AccessLobby app onboarding, continue using registry review and private provisioning even when Keycloak's console is reachable. Creating an IAM client manually cannot substitute for AccessLobby's person, ownership, application-entry or publisher review contracts. Creating another realm also requires explicit issuer/mapping and consumer migration decisions under [ADR 008](../adr/008-realm-boundaries-and-automation.md).
