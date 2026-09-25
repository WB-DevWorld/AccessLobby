# Contribution workflow

Create a bounded issue and short-lived branch; include contract/security impact and test evidence in the PR. CI checks typecheck, tests and builds. Do not merge a failing check. Production promotion requires staging qualification and a digest-pinned artifact. Code changes that affect identity mapping or OIDC validation require negative auth tests and a migration/rollback note.
