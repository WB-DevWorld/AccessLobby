# ADR013 — Consolidate first-party WordPress delivery

Status: owner-authorized consolidation, 2026-11-24. Relates to #59; actual estate adoption and external activation remain open.

The owner selected a new consolidation branch after comparing PR60 and PR61. `feat/wordpress-consolidation` starts from PR61/3131df44bb7f6bb006a2dac6bcbac29591f288e9. The other source is Cursor PR60/6ad3ec96d3c18f06d993c8e72d941fc0d90dd8e1. Neither comparison branch is modified by consolidation. Cursor independently advanced to 04941d9f179c29739de25a3e8d5a277692bc28c2 during this work; the stricter CA/host/browser certificate checks from that source are also incorporated. This is selective integration, not a merge that discards either candidate's history or silently downgrades its safety contract.

| Source | Retained work |
|---|---|
| PR61 | Standalone connector; two modes; safe JIT, explicit linking/unlinking and session rotation; cookie/registration/fault guards; local commerce/roles; dedicated frontend pages; targeted logout and bounded receipt reconciliation; typed WordPress app registration; broad version/HPOS/Kadence matrix; install/update/uninstall/recovery/rollback coverage |
| Cursor PR60 | Representative nginx/PHP-FPM/distinct-hostname TLS profile; per-test PostgreSQL schemas and readiness-bound port claims; compatible maintained dependency/lockfile updates |
| Separate Stage B source | PR61's external profile/consent implementation and migrations007/008 stay preserved in that exact source, outside this first-party release runtime |

The consolidated API migration list ends at006. The external consent/profile API, private preparation CLI, UI/navigation/continuation and preview schema migrations are excluded. A default-deny `/v1/preview` boundary returns404/no-store even with an obsolete enablement flag. Fresh databases create no preview tables; older development databases retain any preview data rather than dropping it. No external client is activated, and the first-party-only registry/admission constraints remain. The negative token-wide pairwise privacy probes remain relevant release gates.

The runtime identity/API/WordPress ownership contracts stay unchanged. A human, broad application entry, WordPress capabilities, commerce and membership entitlements remain separate. No email merge, role elevation or password/hash mirroring is introduced.

The additional HTTPS profile uses the same candidate plugin and compiled API from the repository Dockerfile/frozen lockfile. It creates WordPress clients through ApplicationStore request/proof and the real private first-party provisioner with actual IAM readback. DNS TXT and owner review are explicitly synthetic fixture inputs; public-domain ownership or estate onboarding is not certified. The fixture-only private-address/port/CA exceptions are outside the shipped plugin. Callback queries are redacted, disposable resource ownership is checked, and failed preflight cannot remove foreign resources.

The broad native matrix and representative hosting smoke are complementary. The five version/configuration pairs retain their complete behavior checks; the nginx/PHP-FPM profile separately verifies trusted hostname TLS, Secure host-only cookies and real shared logout. Neither substitutes for actual WoodMart/B2BKing/cache/security or public estate tests. Upgrade qualification advances from the exact alpha.5 ZIP to alpha.6.

API tests use independent schemas and the same production migration list. CI repeats API and reference suites under normal concurrency against the same database to expose residue and port races. A passing fresh-database run alone is insufficient evidence of repeatability.

Release gates: local checks → new PR and full CI → exact ZIP/source evidence → controlled first-party staging adoption with real backup/recovery and site qualification. No main merge, immutable staging promotion, production authorization or pilot success is inferred from branch creation. The external preview remains a follow-up after first-party release review; no legal/privacy decision is manufactured by consolidation.

## Selection rationale

At the compared source revisions, PR61's typed WordPress URL validator accepts only the fixed callback/logout actions and registered REST logout profile. Cursor's generic validator rejects those query-based URLs; the consolidation retains the typed validator so actual registration works without a database bypass. PR61 also retains the enforced-mode prerequisite/cookie gates, durable audit/storage failure handling and final post-hook safe-role check for JIT. The representative profile now exercises the real registry/provisioner against IAM rather than relying on hand-seeded application rows.

Cursor's isolated PostgreSQL schemas eliminate cross-test deletion and residue. Its readiness-bound port claim prevents a test from releasing a port before the child server owns it. Those improvements are retained and repeated under normal test concurrency. Cursor's distinct-hostname nginx/PHP-FPM fixture and stricter certificate observations add a hosting/trust boundary the loopback fixture alone did not establish. Both source candidates contribute testable improvements; no elapsed-time or productivity score is inferred from commit counts or unequal server access.

## Later runtime finding — alpha.7

Cursor's later partial-Join fault at 0ecc60e uncovered a shared late-hook malformed-user gap. A real consolidated red regression reproduces it on all five native lanes. Alpha.7 validates the nonblank finished username before committing its transaction, retaining existing role/capability checks and legitimate local naming. The callback rollback/quiet retry and exact alpha.6 upgrade now have their own qualified evidence. This is a bounded correctness fix, not a new identity/linking/authorization policy. See the current consolidation acceptance; earlier alpha.6 evidence remains historical.
