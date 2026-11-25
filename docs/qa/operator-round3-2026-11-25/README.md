# Operator round-three local qualification — 2026-11-25 UTC

Based on qualified PR75 head750f51a890d65d3b17306b7d47e2f8f2012880fc; feat/operator-round-3 is a dirty candidate at local test time. The original [browser report](local-browser-report.json) preserves source/dirty attribution verbatim. Its private-console note names a separate fixture; it does not report a native fixture PASS. Source/CI identities for publication belong in the PR and issue76.

| Check | Local result |
|---|---|
| API with real isolated PostgreSQL17.11 |77PASS,0failure/skip |
| Web/model/action/session |64PASS,0failure/skip |
| Independent reference consumer |16PASS,0failure/skip |
| Typecheck / production build |PASS |
| New compiled API/database/production Next browser |7groupsPASS |
| Retained round-two / round-one / general UI browser |11/10/14groupsPASS |
| Python existing infrastructure |77PASS |
| Private-client/email JS retained |16PASS from the qualified baseline; unchanged source |
| New private package Python/OpenSSL |6PASS |
| New exact-authority CONNECT/loopback actual TLS |4NodePASS |
| Native private-console script |SyntaxPASS; actual Docker/IAM/browser execution pending CI |

The application tests total157; joined browser groups total42. Private package checks exercise actual OpenSSL trust/hostname/key permissions and actual loopback TLS, including untrusted CA, wrong hostname and wrong CONNECT authority refusal. They do not replace real Keycloak administrative login.

Joined tests prove current role denial, actual28member organization paging/invitations/history, opaque receipt grouping, stale-after-new-receipt refusal, exact retry preserving fresh same-SID authentication, other-client/session isolation, native confirmed same-origin controls, suspension/old-receipt/current-token denial and role revocation. PostgreSQL cases separately cover both receipt-issuance/suspension lock orders, idempotent concurrency, authority changes while blocked, protected-target grant races and rollback after audit failure. Cleanup removes only isolated test schema/browser/process resources.

Native client-side navigation initially needed an explicit URL wait. Visual review then widened the stored-ID cells on mobile and made the suspended-page capture wait for completed server rendering. The revised build/new7group browser run passes, with organization360/1440, association and suspended-state screenshots retained as local/CI artifacts. No customer data is in these fixtures. Runtime used Node24.22.3, pnpm11.25.0, temporary PostgreSQL17.11/Chromium158; CI supplies its pinned runtime/Docker fixture.

Not established locally: native IAM console authentication, current staging route, actual host certificate/tunnel, new live operator permissions, app/session effects on real consumers, image promotion or production acceptance. The optional private package is source preparation, and Cursor's independently accepted mail/WordPress tests remain a separate lane.
