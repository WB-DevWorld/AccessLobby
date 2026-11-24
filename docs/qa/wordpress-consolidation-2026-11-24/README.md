# Consolidated first-party WordPress qualification

The implementation cycle is qualified at **b683fcf776de50bf8606ca772c38625633c19110**, version **0.1.0-alpha.6**, on **feat/wordpress-consolidation / PR62**. All **13 CI jobs** pass, including **356 browser cases** across five independent two-WordPress matrices, and the additional distinct-hostname/nginx/PHP-FPM trusted-TLS smoke. This is an isolated first-party pilot candidate, not a real estate or external-publisher rollout.

- [Complete acceptance and actual remaining gates](ACCEPTANCE.md)
- [CI revisions, jobs, versions and report checksums](ci-index.json)
- [Exact package/source and Windows/Linux byte verification](package-verification.json)
- [Read-only public staging observation](staging-observation.json)
- [Per-lane categorical evidence](ci/)
- [Standalone controlled staging runbook](../../runbooks/wordpress-consolidation-staging.md)
- [Consolidation decision and source rationale](../../adr/013-wordpress-first-party-consolidation.md)

The canonical installable ZIP contains 50 files / 91,112 bytes. SHA256: **64eea67c7c71a8504d1dde3df1b3241f4d32b1185ae693479eb286e4f1be9fc5**. It upgrades the exact alpha.5 package. Build with integrations/wordpress/scripts/package.py from the qualified source; the outer review bundle is not installable.

Source acceptance reuses the previous 37 focused passes. Pass 38 reconciles exact comparison heads and actual CI. Pass 39 checks typed WordPress registration, missing-extension enforcement, durable audit/storage/JIT guards, database/port isolation and TLS fixture boundaries. Pass 40 reviews Cursor's independently advancing 04941d9f179c29739de25a3e8d5a277692bc28c2 and incorporates its stronger host/browser certificate gates; broader new Join/lifecycle additions are not claimed for the representative smoke. Consequential findings are **CURRENT-REPO-FACT**; consolidation and Stage A/B separation are owner-authorized decisions recorded in ADR013. No raw chat/source-pack or credential is committed.

The initial fixture startup failure, its generated-script fix and pre-release package changes are retained honestly in the acceptance record. Evidence-only successors must retain the same packaged files and pass their own required checks. Main/public API stays 3d9220a140d61df5effe633bc72cf5142c4a8371. No estate installation, main merge, image promotion or production migration occurred. Issue59 remains open. Actual WoodMart/B2BKing/cache/security/extensions, public-domain two-site adoption and backup/recovery remain gates; multisite is unsupported and arbitrary external activation stays closed.
