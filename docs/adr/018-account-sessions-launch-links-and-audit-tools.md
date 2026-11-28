# ADR 018 — Account sessions/history, app launch/grants and audit tools

Status: implementation candidate, 2026-11-28. Issue85 tracks one combined release and separate staging acceptance. Builds on ADR015–017 and accepted visible713140ad console evidence65bedeb.

## Ordinary account sessions

`/security` lets any active signed-in person inspect and end their own unexpired receipt-backed app associations. It requires no platform role. The verified first-party actor is rebound to its durable person under a person lock; the request cannot select another person. The list contains an opaque handle, safe app/client name, observed dates/count, snapshot and a label indicating the same browser SSO session. It does not infer devices, location or IP, or enumerate bearer-only/IAM sessions.

Ending requires the inspected snapshot and an explicit browser confirmation. Issuance and removal serialize on the person row. A changed group conflicts; exact retries use an opaque ending record and cannot remove newer authentication. Other clients/browser sessions remain independent. Minimal security events and ending records contain handles/counts, never provider subjects, raw session IDs, capabilities or tokens. Per-person activity removes up to100 records older than30days from each retention table; inactive accounts may retain them longer.

An end removes the central receipt association. Participating apps apply denial at their next check under the existing expiry/outage policy. It does not revoke application admission, end the IAM cookie, ban a device or prevent a new sign-in. The existing operator route continues to refuse self/protected targets; this separate route provides deliberately scoped account self-service.

## Personal ending history

A separate `/security/history` view lists the person's own recorded app-session-ending actions within the past30days, with bounded opaque event pagination. Each event records the client identifier and an independent public event UUID alongside the already minimal action/time/count. Current app names may be displayed without inventing historical profile/device information. The same current verified self binding protects every history read. Internal receipt association handles, provider/session values and another person's identifiers are not returned. The display window and opportunistic storage cleanup are distinct; this is a local action history, not a complete security centre.

## Owner entry grants

The app owner gains a bounded grant directory and native grant/revoke controls with optional explicit UTC expiry. The existing active first-party restricted-app and active-target authority boundaries remain; an organization or operator read role alone is insufficient. Expiry is validated as a real future UTC calendar instant, with no arbitrary new business cap. Blank remains indefinite. The display distinguishes stored active, expired and revoked grants; peers continue enforcing current entry and their session policy. This does not assign a peer role or immediately remove every local cookie. No grant schema migration is needed.

## App launch links

An application operator may set/remove a static public HTTPS entry URL for an active first-party noncore application. It must be canonical and on the registered callback origin, with no credentials, query, fragment, ambiguous path or local/IP hostname. It is reviewed navigation metadata in separate tables; it never changes the OIDC callback/logout configuration, review hash, visibility, admission, grants or peer roles.

Writes lock the application, actor and current role, use a version binding app administration and launch revision, and atomically append the command and audit. Exact retries cannot overwrite a later link. Invalid or obsolete stored URLs are hidden and can be repaired. The ordinary available-app response retains its discovery rules, adds explicit current admission and includes a launch URL only for an already-visible admitted row. Discovery still may show a restricted app without an entry grant. A button is navigation; the receiving app must validate authentication, admission and local permissions.

## Audit investigation and export

Existing operator history gains exact action/actor/target filters, literal reference search, inclusive UTC calendar dates and preserved cursor paging. Structured, repeated, unknown and invalid query input is rejected. Every list/export checks current person/role authority; a bounded transaction holds those locks through selection and serialization.

CSV contains only the existing seven safe event fields. Output quotes every cell, neutralizes formula prefixes including hidden whitespace/control characters, and is capped at1000events/1MiB with a five-second SQL timeout. A fixed filename, correct MIME, nosniff and private/no-store headers apply. The web download validates upstream shape/size/row metadata instead of forwarding arbitrary headers/content. Export is a read and does not append an event to the data being exported. This is operator history, not a complete cross-system audit archive.

## Delivery

Migrations016/017 add launch metadata/commands and ordinary session ending/security-event tables. Reserved007/008 remain absent. No IAM credentials or new service enter the public runtime. Existing console rendering, normal update guards and concise disclosure patterns remain. One integrated fixture covers the real compiled API/PostgreSQL/production Next paths; genuine staging authentication, host migration and user acceptance remain separate gates. No production, mobile-device or external-publisher claim follows from this source change.
