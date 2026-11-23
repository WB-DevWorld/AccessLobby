# WordPress candidate comparison

The owner authorized independent work alongside Cursor on 2026-11-23. Compare exact commits against the same acceptance cases before selecting a candidate. Neither branch is merged or promoted by this record.

| Candidate | Reference | Current disposition |
|---|---|---|
| Preserved Cursor starting handoff | `feat/wordpress-connector`, PR60, `92afbb261672401426aa4d8d3ad36f2e81ac13fd` | Historical handoff; Cursor's subsequent candidate must supply its own exact head and evidence |
| Independent Codex implementation | `feat/wordpress-codex-comparison`, PR61 | Extends the common handoff; exact results and revisions in [QA evidence](qa/wordpress-codex-2026-11-23/README.md) |

The common source acceptance contains 28 focused passes. Current main/staging truth, existing AccessLobby contracts, source inputs and owner requirements outrank either candidate's assumptions. This comparison does not repeat or weaken the mission's acceptance criteria.

| Compare | Evidence required from each candidate |
|---|---|
| Identity safety | No email auto-link, original local IDs/roles/history, fresh dual proof, unique mapping, negative token tests, no privileged JIT |
| Both modes | Core/admin/frontend/My Account automatic initiation and safe return; hybrid local login; measurable migration gate; outage/recovery behavior |
| Actual shared SSO | Independently registered sites, quiet second-site login, separate local users/roles, fresh browser credential challenge after shared logout |
| Session/logout safety | Site-only leaves peers active; signed targeted backchannel; replay/unrelated sid/device controls; linked-session rotation |
| Commerce | Existing orders/addresses/customer ownership; real guest order without a new account; no pricing/membership/B2B changes |
| Installation/operations | Normal ZIP install/activate/deactivate/reactivate/upgrade/uninstall/reinstall, preserved data, backup/recovery/rollback, cache exclusions |
| Compatibility | Exact WP/PHP/Woo versions, root/subdirectory, licensed WoodMart/B2BKing/mobile/cache/security qualification separately |
| AccessLobby regression | Existing API/UI/IAM/PWA/offline/update and container/proxy CI on the candidate head |
| External publisher claims | Pairwise/token-wide privacy, same internal person, consent/domain proof/client lifecycle and independent external pilot; otherwise activation remains closed |
| Maintainability | Small separated protocol/mapping/session/admin/UI components, maintained locked verifier, reproducible package, documented supported APIs and real limits |
| Efficiency | Comparable start/end boundaries, actual elapsed work and rerun/defect evidence; include inherited work, access differences and blocked dependencies |

Cursor's reported SSH access is a material advantage for live CETECH/FLAIROC qualification. This workspace's successful isolated fixtures and remote CI are separately useful evidence. A missing environment result is a missing gate, never an invented pass or a speed score. No winner or numeric ranking is asserted without Cursor's implementation and the common test results.

For review, install each candidate in separate clones using distinct clients. Run the same synthetic users and acceptance matrix, then a controlled estate cohort. Compare behavior and evidence before selectively merging; do not combine branches blindly or test authentication migration on a production storefront. Keep the owner-facing two-mode vocabulary and the same identity/commerce/privacy boundaries regardless of implementation choice.
