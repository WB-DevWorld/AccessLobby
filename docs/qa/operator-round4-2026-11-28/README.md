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

## Remaining release gates

Exact committed-head CI, merge-tree equality, source-bound image publication and controlled host migration/readback are distinct gates. Use the latest result linked from Issue85 rather than infer success from this local table. Migrations016/017 must follow existing001–006/009–015, keeping007/008 absent. The selected API/web pair must be promoted together under the [round-four procedure](../../runbooks/operator-round-4.md), with IAM/gateway/SMTP/WordPress and real owner grants preserved.

Genuine staging self-service receipts/session isolation, ending history, owner grant expiry/renewal, launch metadata/consumer entry and audit download remain NOT RUN here. Cursor's private Keycloak certificate/browser access, existing controlled suspension/session tests and actual private-worker activation/consumer agenda remain independently tracked. Umbrella59/72/74/76 and round85 stay open for their remaining gates. No production or external-publisher acceptance is claimed.
