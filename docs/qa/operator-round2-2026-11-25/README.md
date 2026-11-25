# Operator round-two local qualification — 2026-11-25 UTC

Candidate `feat/operator-round-2`, based on PR73 head eb661bdc7f8e9661dbbe58c2ef04bb278ebca875. Original [browser report](local-browser-report.json) retains its actual source base and dirtyWorktree=true; it is not relabeled as a committed clean-head run. The resulting published source/CI identities belong in the PR. Issue74 tracks separate live acceptance.

| Local check | Result |
|---|---|
| Typecheck and production build | PASS |
| Real isolated PostgreSQL17.11 API tests |59PASS,0fail/skip |
| Web/model/action/session tests |48PASS,0fail/skip |
| Independent reference consumer |16PASS,0fail/skip |
| Python infrastructure |77PASS, including12new private-console checks |
| Private client/token/email JavaScript |16PASS |
| New joined API/PostgreSQL/production Next/Chromium browser |11groupsPASS |
| Retained round-one console browser |10groupsPASS |
| Retained general production UI browser |14groupsPASS |
| New native Keycloak worker script | Syntax PASS; actual execution deferred to disposable CI |
| Whitespace | PASS |

Scratch runtime used Node24.22.3, pnpm11.25.0, PostgreSQL17.11 and temporary Chromium158. CI pins its own runtime and supplies the native Docker/IAM fixture. No product dependency was added for the temporary local browser/database. Synthetic signed issuer and DNS fixtures are explicitly not live IAM or estate acceptance.

Coverage includes explicit-role/owner/token denial, audited status CAS and protected targets, old bearer/receipt non-revival, same-SID fresh-session protection, lifecycle identity/history preservation and quota/concurrency, review/generation invalidation, leased job authority and crash recovery. The full pre-round schema010→new manifest upgrade is checked with actual PostgreSQL, preserving active clients and immutable history and renewing pending legacy approvals exactly once. Six independently written adversarial database cases prove stale jobs make zero IAM calls and include deterministic lock barriers rather than timing guesses.

Native forms were exercised for person action, owner edit/cancel/resubmit and reviewed queue; anonymous, revoked and cross-origin actions fail. Narrow360px and wide1440px screens render actual fixture records without hydration/runtime errors; person and queued-job screenshots were visually reviewed. Screenshots remain scratch/CI artifacts, not customer records committed to Git.

Prepared native-IAM CI uses actual temporary realm client-management credentials, verifies human-users403, exact client/mapper readback, mismatched existing configuration refusal and injected completion-audit rollback followed by exact-client reuse. Only newly owned fixtures enter cleanup. It does not connect to staging, configure SMTP or deploy a worker.

Live rollout still requires exact qualified artifacts, current schema/recovery evidence, explicit human bootstrap, protected worker issuance/cleanup/operation, real admin/owner/consumer acceptance and any private-IAM browser-route deployment/login. Realm creation, external publishers and production acceptance remain outside this local result. Cursor's separately committed a83634f mail/WordPress result is source-reviewed operator evidence; it is not a test of this source candidate.
