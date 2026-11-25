# Operator console round 1 — local qualification

The implementation starts from main `de71ec978d9c5dcc2eaa4e3076eb7a7da94ed223` and is reviewed in [PR #73](https://github.com/WB-DevWorld/AccessLobby/pull/73), related to [#72](https://github.com/WB-DevWorld/AccessLobby/issues/72). It adds protected operator access, read-only investigation and independent application review/private activation handoff. Deployment and operator bootstrap are separate acceptance gates.

## Local results

| Check | Result and boundary |
|---|---|
| Real PostgreSQL 17.11 application suites | PASS: 32 API, 22 existing web, 16 reference-consumer cases; no database skips |
| New admin web model/action tests | PASS: 8 cases, including origin, bounded fields, duplicate/claimed-authority refusal, stale and uncertain responses |
| Typecheck and production build | PASS; includes all `/admin` destinations |
| Infrastructure Python | PASS: 65 cases |
| Private client and email diagnostic tests | PASS: 16 cases |
| Joined operator console | PASS: all 10 groups in [the original categorical report](local-report.json) |
| Existing production UI browser smoke | PASS: all 14 groups, including native/no-JavaScript actions, responsive layouts and retained logout scopes |
| Live IAM, staging and production for this console | NOT RUN |

The joined smoke uses the actual compiled Nest API, isolated PostgreSQL schema, production Next.js server and Chromium 158. Its OIDC discovery/signing issuer and prior-DNS fixtures are synthetic. It verifies real HTTP role/identity/session checks and actual native review submissions; it does not demonstrate live Keycloak, DNS, physical installed devices or production readiness. Existing private-provisioner source tests use controlled IAM readback fixtures. Native IAM and WordPress workflows are separate CI results.

The initial HTTP run detected the new POST route's default 201 response. Explicit HTTP 200 corrected the idempotent review contract. Browser startup was initially blocked by a missing installed executable and a 403 from the ordinary download route; a temporary test binary supplied the successful local check. No browser runtime dependency was added to the product.

The original local report correctly retains `source=de71ec978d9c5dcc2eaa4e3076eb7a7da94ed223` and `dirtyWorktree=true`. After that run, the exact working files and the submitted source were independently compared through Git tree `6ec0ab75b58dbb5f6bb5047b2eadbd6bc76e2cba`, published in commit `13659e2553e71ceb2105f823bad5262b32c4b295`. This evidence-only successor preserves that code; it does not relabel the earlier run as a clean commit run. Check PR #73 for its final head's own CI results and retained artifacts.

## Remaining acceptance

The controlled rollout needs qualified immutable artifacts, current backup/rollback evidence, schema 009/010, explicit private role bootstrap for the intended operator, real allowed/denied console checks and an approved consumer's current private activation. No actual operator grant, new realm, SMTP change, image promotion or WordPress package change occurred here. Rejected request editing/cancellation/retirement and automatic private activation remain separately scoped features. Cursor's Forward Email and estate qualification lane retains its existing scope.
