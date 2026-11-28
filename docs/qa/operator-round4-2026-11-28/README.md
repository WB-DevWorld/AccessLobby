# Round-four integrated candidate — 28 November 2026

Five source lanes were implemented in parallel and integrated above main5b386782ab7d307f440b1ac3ee2d24a263029459: ordinary recorded app sessions, admitted app launch links, filtered operator history/CSV, owner entry-grant management with expiry and personal session-ending history. Issue85 tracks the combined source release and separate actual staging acceptance. The existing713140ad console's visible read flows are independently accepted by d8ebd66/65bedeb; these new features are not deployed by that evidence.

## Local verification

| Check | Result |
|---|---|
| Whole-workspace TypeScript | PASS |
| Production API/web/reference-consumer builds | PASS |
| API suite with actual isolated PostgreSQL17.11 | 100PASS,0FAIL,0SKIP |
| Web unit suite | 116PASS,0FAIL,0SKIP |
| Retained production UI browser groups | 14PASS, including native actions, no-script and200%text |
| Combined real API/PostgreSQL/production Next operator browser | 34PASS:23retained and11new groups |
| New worker-controlled session page | PASS:actual active worker, native confirmation, selected receipts denied, other client/browser preserved, fresh retry harmless |
| New launch forms and cards | PASS:current authority, same-origin URL, CSRF/stale/reader/ordinary denial and admission-dependent links |
| New history/download | PASS:real filters/pagination, native CSV, fixed headers, current-role/ordinary denial and formula neutralization |
| Personal ending history | PASS:real end event, own-person isolation, opaque25/2paging and private worker behavior |
| Owner grant management | PASS:25/1paging, native UTC grant, actual8second expiry/entry denial, indefinite renewal and selected-person revocation/control |
| Unexpected round-four browser errors/private cache entries | 0/0 |

The [local browser report](local-browser-report.json) identifies its actual base source and dirty worktree. It is candidate evidence, not an exact committed-head verdict. The joined helper is imported into the existing CI operator-console smoke, so exact-head CI uploads the full34group artifact through the retained workflow. Local runtime uses synthetic signed loopback OIDC and disposable real PostgreSQL; it is not live IAM or physical-device acceptance. All owned temporary database clusters, schemas and child processes were removed after the run.

PostgreSQL tests additionally cover concurrent stale/retry behavior, current authentication/authority after blocked transactions, atomic rollback on audit failures, minimal retention cleanup, invalid/origin-obsolete launch metadata, unchanged OIDC/review/grant facts, literal wildcard search, inclusive UTC dates, export bounds and locked-role revocation. New grant cases cover queued-owner cutoff/SID denial, target-status locking and event rollback. The two initially impossible active/external test fixtures were corrected to existing schema-valid inactive external states; no production constraint was weakened.

## Committed source acceptance

PR86 merged as8f63578deb485a9457522f2b8ff0d4b89bb2c588 with exact tree equality to qualified head323237447323784b7e546f3d00581a87491c7098. All15head checks pass: CI46143014489, WordPress46143014510 (10jobs), theme46143014535 and security. The operator artifact15262533034/digestsha256:505f083792e2fc8b9172534eafe39f9945d13eb0b61177c25745152ce401bce8 is bound to that head. Main CI46143522786, all10WordPress46143522844 jobs and theme46143522854 pass. Publisher46143858761/job140975507158 actual checkout and allfourtags match8f63578; main artifact15262008441/digestsha256:c607171fbf68ec0b180ab45de0618207e79b5c3430202d089f69df7a137cf812 preserves all34groups. Host acceptance remains separate; [release record](../../releases/operator-round4-staging-2026-11-28.json) records their final status.

## Remaining release gates

Exact committed-head CI, merge-tree equality and source-bound publication are accepted above. Controlled host migration/readback and new-feature acceptance remain open. Use the selected immutable pair from the release record, independently of later documentation builds. Migrations016/017 must follow existing001–006/009–015, keeping007/008 absent. The selected API/web pair must be promoted together under the [round-four procedure](../../runbooks/operator-round-4.md), with IAM/gateway/SMTP/WordPress and real owner grants preserved.

Genuine staging self-service receipts/session isolation, ending history, owner grant expiry/renewal, launch metadata/consumer entry and audit download remain NOT RUN here. Cursor's private Keycloak certificate/browser access, existing controlled suspension/session tests and actual private-worker activation/consumer agenda remain independently tracked. Umbrella59/72/74/76 and round85 stay open for their remaining gates. No production or external-publisher acceptance is claimed.
