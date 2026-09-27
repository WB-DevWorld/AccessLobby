# Data truth and fixture policy

The visual concepts contain illustrative names, scores, documents, organizations, devices, events and metrics. They are design references, not production facts.

## Display states

Every field shown by the UI must be classified as:

- **LIVE** — returned by an approved authoritative backend.
- **LIVE-DERIVED** — calculated from live data by a documented rule.
- **UNAVAILABLE** — planned, but no approved data source exists.
- **DEVELOPMENT FIXTURE** — synthetic data for component development and non-production previews.

## Production rules

- Fixtures are disabled by default in production.
- A failed live request renders an unavailable/error state; it never falls back to synthetic success data.
- Fixture adapters are isolated and removable without changing component contracts.
- Production should fail closed if a development fixture flag is enabled accidentally.

## Current real contract

The existing signed-in account route resolves `/v1/me` and currently relies on:

```ts
type CurrentPerson = {
  id: string;
  status: string;
};
```

The UI foundation may create view models around this response, but it must not redefine the API semantics.

## Adapter direction

Use typed adapters for current identity, future profile data and future recovery data. Result types must distinguish ready, signed-out, unavailable and denied states rather than treating every absence as a successful empty object.

## Do not claim these are live without an approved source

- personal profile fields beyond the current contract;
- contact verification;
- identity documents;
- completeness percentages;
- trust scores or assurance levels;
- MFA, passkeys, backup codes or biometrics;
- devices, sessions or security-event history;
- recovery contacts/readiness;
- connected apps, permissions or consent history;
- search, SEO, AISEO or analytics metrics.

## Privacy

Never log session cookies, authentication tokens, document numbers, recovery secrets or private profile fields. Prefer correlation/request IDs for support and error investigation.
