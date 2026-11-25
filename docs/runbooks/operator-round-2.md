# Operator round 2

Candidate, 2026-11-25. Requires the round-one console, migrations009/010 and [ADR016](../adr/016-operator-controls-and-activation-jobs.md). No live role, worker, image or migration is installed by this document.

## Deploy a qualified candidate

1. Record source, exact-head CI, web/API immutable digests, current configuration and a recoverable database baseline. Check migrations011/012/013 and preserve reserved007/008. Inspect pending pre-generation reviews: those requested/unreviewed apps need proof and independent approval renewed after migration. Existing active clients remain active.
2. Apply the complete supported manifest using the protected runner before starting its compatible API. Verify migration records and old/new client behavior; do not invent a successful migration from absent completed-job containers.
3. Privately identify intended human operators by durable ID and grant only the required roles using the qualified API artifact. Run from its API working directory with protected `DATABASE_URL`:

   ```text
   node dist/manage-operator.js PERSON_UUID grant identity_operator CHANGE_REFERENCE
   node dist/manage-operator.js PERSON_UUID grant application_operator CHANGE_REFERENCE
   ```

4. Retain independent reviewer authority separately. Inspect current role grants through `/admin`; prove ordinary-person denial and immediate revoked-role denial with an existing browser session. Never expose a role-grant HTTP endpoint or distribute database/IAM credentials to the console.

## Person management

Open **Operator console → People → person ID**. The detail shows stored status, version, counts and protected-operator status. An identity operator enters a non-secret evidence reference, confirms the action and suspends/re-enables an eligible target. Self and current platform-operator targets are refused. Concurrent/stale versions require a fresh inspection.

Acceptance uses a controlled ordinary person: preserve its ID, memberships/grants and links; prove new API/receipt denial after suspension; re-enable and prove old bearer/receipt remain unusable; perform a fresh code/PKCE login and confirm access. Also prove an old bearer cannot end a newly authenticated session sharing an IAM SID. Account cutoff may require waiting until the next whole second before the new token. This does not close IAM cookies or every unchecked peer session.

## Owner request management

Open **Developer tools → Manage request**. An owner can inspect/edit/cancel/resubmit an inactive request. Record the IDs before and after, re-publish/re-verify DNS when required, and obtain independent review of the new revision. Prove stale review/job refusal, other-owner denial and active-client mutation denial. Cancellation/resubmission must not overrun the outstanding-request quota. Preserve the immutable decision history.

## Activation and progress

1. Owner requests and proves the exact callback hostname. An independent reviewer approves the current first-party configuration and evidence reference.
2. An application operator opens the console app detail and selects **Queue private activation**. Inspect **Activation progress** and the job detail. A queue acknowledgement leaves the application inactive.
3. The protected runner supplies its database connection, approved public `OIDC_ISSUER` and supported private `IAM_INTERNAL_URL`. It obtains a fresh temporary realm client-management credential through the existing protected mechanism. The credential producer pipes only the short-lived token to one of these commands:

   ```text
   node dist/activation-worker.js --job JOB_UUID --token-stdin
   node dist/activation-worker.js --next --token-stdin
   ```

   These are consumer-side syntax examples, not a complete credential-issuance command. Never type the token into a terminal argument, chat, URL, browser form, Git file or public service environment. Provision and remove any temporary service-account client using the existing protected issuance/cleanup procedure. IAM `manage-clients` is realm-wide client management, while this runner restricts its own action to the claimed job. Human users/realm management remain outside the worker credential's scope.

4. Record safe job ID/status/attempt and exact non-secret configuration readback. A successful worker commits active registry state, succeeded job and audit together. Inspect a real consumer login/admission/logout separately; client creation does not prove adoption.
5. For a retryable transient failure, an application operator inspects the error and current attempt then requests a bounded retry. Configuration/authority mismatch needs a fresh authorized workflow; do not keep retrying revoked authority. A crashed lease is reclaimed/fenced, never executed concurrently as if both workers own it.

No worker/scheduler is yet configured in the live deployment. If scheduling is added, supply a fresh short-lived token per run, serialize operational ownership and preserve job leasing; do not save a permanent provisioning token in web/API configuration.

## Qualification and rollback

Local tests use isolated PostgreSQL and synthetic identities. CI additionally exercises actual disposable Keycloak, scoped credential cleanup, exact readback, mismatch refusal and an IAM-create/database-failure/retry path. Neither result proves the live staging runner or private browser console works.

Before rollout, rehearse stopping/draining workers and recovering the compatible web/API/database baseline. Old API code lacks the new cutoff and generation checks, so a casual image-only rollback can weaken the current contract. Prefer a compatible forward fix; otherwise use a coordinated tested restore and reconcile any externally created IAM client by exact identity/readback. Do not delete customer accounts, change plugin/JIT modes or replay accepted estate tests to fill unrelated acceptance gaps.

Private Keycloak **Create realm** and **Clients** remain in its separate protected Admin Console. This candidate has no verified live private URL. Follow [private IAM readiness](private-iam-console.md), preserve public admin/master denial and the existing issuer, then perform a genuine authorized admin login before calling that route usable.
