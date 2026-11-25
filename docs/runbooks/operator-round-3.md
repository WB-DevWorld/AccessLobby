# Operator round 3

Candidate, 2026-11-25. Requires the compatible console from rounds1/2, migrations014/015 and [ADR017](../adr/017-operator-investigation-and-suspension.md). Source, CI, publication, deployment and real operator acceptance are separate.

## Rollout

Record the exact qualified source/web/API digests, current schema/configuration and recoverable database/image baseline. Apply the complete manifest using the protected runner, retaining reserved007/008. Check migration versions and rerun safety before starting compatible code. Grant existing human operators only the needed existing roles through the private CLI; no browser grants are added.

## Stop an application's AccessLobby admission

Open **Operator console → Applications → application → Application suspension controls**. Inspect the app/client/state, type its exact client ID, enter a non-secret issue/change reference and confirm. Only an application operator can suspend an eligible active first-party registration. Core service registrations are protected.

For acceptance use a controlled consumer: record its configuration, grants and receipt; prove ordinary-owner/reader denial, stale-version refusal, current role revocation, exactly-one audit under retry, registry denial and receipt invalidation. Preserve the app's local users and records. Native form and cross-origin refusal must work. Record IAM state separately: this browser action never claims IAM client disabling or immediate local-cookie deletion. There is no browser reinstatement in this increment.

## Investigate or end a recorded app association

Open **Operator console → People → person → Inspect participating app sessions**. The list contains unexpired receipt-backed groups, not every device or IAM/local session. Inspect the app, dates and count. An identity operator enters a reference and confirms **End app association**. If records changed, refresh and inspect them again; never force an old snapshot over fresh authentication.

Acceptance uses an ordinary controlled person with two clients and a separate browser session. Prove only the selected group ends, old receipts fail, other groups remain, concurrent/fresh issuance is protected and exact retry cannot end new receipts. Self/platform-operator targets remain protected. Observe the actual peer's next status check under its contract. An admitted person may log in again or reuse IAM SSO; this is not account suspension or a device ban.

## Investigate an organization

Open **Operator console → Organizations → organization**. Review the stored identity/counts, then **Members**, **Invitations** and **Organization history**. Use **Next page** and **First page**; one page is at most25rows. Expired-pending and revoked/accepted invitations have distinct meanings. A missing historical event is not proof an action never occurred. Names are self-asserted; no ownership recovery or legal certification is performed here.

## Private Keycloak console

Use the [separate private-console procedure](private-iam-console.md). The source package and its disposable fixture do not configure the real host. Preserve current issuer/SMTP/client/image settings and public admin/master denial, validate the actual protected certificate/network/tunnel and perform real authorized administrative login before reporting the route available. AccessLobby product roles do not grant Keycloak realm privileges. New realms require an explicit environment/trust-domain decision and their own AccessLobby contract; routine apps continue as clients in the existing realm.

## Recovery and evidence

Keep non-secret IDs, references, statuses, counts and audit timestamps. Never export SID/capability/token/cookie/key/mailbox values. Test rollback with compatible images and schema; an old image may lack current person cutoff/generation protections. Prefer a compatible forward fix, or a coordinated tested restore. Cursor's existing WordPress/email qualification remains separate; do not reset accepted customer/site state to test console recovery.
