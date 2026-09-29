# Agent instructions

Read `PROJECT-CONSTITUTION.md`, `SOURCE-OF-TRUTH.md`, `CURRENT-WORK.md` and the integration contract before editing. Update `CURRENT-WORK.md` with exact evidence. Never commit source packs, conversations, credentials or generated realm configuration. Use a branch and PR after bootstrap. Do not claim production, CI, backup or peer adoption without runtime evidence. Preserve peer-local authorization, durable person IDs and IAM data separation.

Every substantive PR must explicitly declare `Closes #N` (complete Definition of Done), `Relates to #N` (partial progress and remaining gate), or `No issue` with a reason. Use native closing keywords only for complete work. After every merge, inspect all linked issues: manually close completed issues if needed, update partial issues with exact evidence and next gate, and keep genuine umbrella/release gates open. Implementation, CI, staging and production evidence are separate; never infer all of them from a merge.
