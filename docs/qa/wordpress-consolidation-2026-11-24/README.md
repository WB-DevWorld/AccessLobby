# Consolidated WordPress qualification — alpha.7

Current qualified release source: **3d9aa57aef00807ac5174ff28fe807409873a838**, version **0.1.0-alpha.7**, feat/wordpress-consolidation / PR62. All **13 CI jobs** pass, including **361 browser cases** across five real-IAM/two-WordPress matrices and the separate trusted-hostname HTTPS smoke. This is a first-party fixture-qualified pilot candidate; actual estate adoption remains pending.

- [Current alpha.7 acceptance and remaining gates](late-hook/ACCEPTANCE.md)
- [Current CI index and 62 categorical reports](late-hook/ci-index.json)
- [Current package/source/Windows/Linux byte verification](late-hook/package-verification.json)
- [Red baseline on all five configurations](late-hook/baseline-matrix.json)
- [Historical alpha.6 acceptance](ACCEPTANCE.md), superseded for new pilots by the late-hook fix
- [Controlled staging runbook](../../runbooks/wordpress-consolidation-staging.md)
- [ADR013: sources, selection and boundaries](../../adr/013-wordpress-first-party-consolidation.md)

The canonical installable alpha.7 ZIP contains **50 files / 91,493 bytes**, SHA256 **373dce094881278b9f08e28ba3e847bb6634719605bef761ee251d80fa771afa**. Its exact alpha.6 upgrade baseline remains retained. Both modes, explicit linking, safe JIT, local ownership and targeted logout remain qualified within the listed fixtures.

Cursor's later partial-Join test exposed a gap in both candidates: a late WordPress hook could leave a blank username after core validation. The alpha.6 passes did not include that fault. Alpha.7 rejects it inside the transaction, rolls back user/mapping changes and proves no cookie plus quiet retry to one safe account. Valid local username customization still works. Do not relabel the earlier record as covering this fix.

Focused acceptance extends through 41 passes: earlier 37 plus exact comparison/CI reconciliation 38, guard/isolation/TLS review 39, Cursor's stronger certificate checks 40 and official WordPress hook-order/runtime reconciliation 41. Findings are CURRENT-REPO-FACT/SOURCE-CONFIRMED as recorded; no new owner policy is inferred. Raw source packs, chat exports and credentials remain outside Git.

No main merge, candidate staging promotion, estate installation or production migration occurred. Actual CETECH/FLAIROC backup/recovery, WoodMart/B2BKing/cache/security/extensions and public-domain two-site adoption remain gates. External publisher activation stays closed; Stage B remains preserved in PR61. Multisite unsupported; issue59 stays open. Evidence-only successors must retain the packaged bytes and pass their own head checks.
