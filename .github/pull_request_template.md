## Work package

Issue and scope:

Issue disposition (choose explicitly for every substantive PR):
- `Closes #N` / `Fixes #N` / `Resolves #N`: this PR fully satisfies the issue's Definition of Done.
- `Relates to #N`: partial progress; list the remaining acceptance gate.
- `No issue`: explain why no issue is appropriate.

After merge, inspect every linked issue against its Definition of Done. Close completed issues with exact PR/SHA and required CI/runtime evidence; update partial issues with the remaining gate. A merged PR alone is not proof that an umbrella or deployment/acceptance issue is complete.

## Identity/security impact

Contracts, data, redirects, permissions, secrets, rollback:

## Evidence

Exact SHA, typecheck/tests/build, negative auth checks and staging smoke where applicable:
