# ADR 008 — Realm boundaries and onboarding automation

Status: **MVP-PROVISIONAL boundary; application admission and external trust policy OPEN** (2026-09-29).

## Evidence and decision

The owner asked whether creating a person, organization or connected application should automatically create a Keycloak realm, and requested scalable onboarding rather than manual user/client edits. Source Pack DEC-003–009 separates durable person identity, organization membership, app entry and peer permissions. CONFLICT-006 and Q-001/Q-027 leave future Almighty DigiVerse, World TransVerse and external trust domains unresolved. ADR 002 already selected one `accesslobby-first-party` realm **per isolated environment** for the pilot, without committing the global topology. The August roadmap advised against one realm per app, organization or country. Keycloak describes a realm as an isolated user/application set and a client as an application using that realm; it supports administrative client registration and realm creation, but those capabilities do not determine AccessLobby's product policy.

| Requested action | AccessLobby canonical change | Keycloak change in current pilot | New realm? |
|---|---|---|---|
| Person registers or is provisioned | Resolve/create durable person and issuer-subject link after verified sign-in | User/credential in existing realm, through the configured registration or provisioner | **No** |
| Organization created, member invited, role changed | Organization, membership, invitation and audit in AccessLobby | None in the initial model; a future Keycloak Organization may be a projection | **No** |
| Peer application onboarded | Logical app, owner, environment deployment and admission policy require their own registry and lifecycle | One controlled OIDC **client in the existing environment realm**, with exact URLs, PKCE, scoped audience and appropriate logout registration | **No** |
| Customer/staff gets app access | Broad app admission when defined; app owns local account, domain role and resource grant | No new realm or per-customer OIDC client | **No** |
| New staging/production environment | Separate deployment and issuer, explicit migration/configuration | Provision that environment's baseline realm as part of infrastructure rollout | **Yes, once per environment** |
| Genuinely separate trust domain/private SSO/federation | Explicit trust-domain decision, identity-linking and consumer migration plan | Provision a distinct realm or issuer **only after that decision** | **Conditional** |

A realm is an issuer and security boundary. Ordinary application/organization operations must never invoke a privileged `create-realm` call. Creating a new realm changes the issuer, signing-key scope and `sub` namespace, and a person in two realms needs explicit verified mapping to one durable AccessLobby person. An email match must not create that mapping. Existing OIDC consumers pin an exact issuer, so an automatic new realm would not be invisible to them.

`infra/scripts/plan-onboarding.py` checks the present mapping and reuses the existing `render-client.py` URL/PKCE validator for application plans. It has **no IAM credentials or mutation path**. It rejects an issuer outside the pilot realm and marks a new trust domain for review. This provides an executable guard and a reviewed input for the next orchestration slice; it does not claim that a client, realm or access grant was created.

## Automation to implement after this boundary

1. **Application registration:** an authenticated developer or organization representative requests a logical application and environment deployment, names its owner, proves control of exact HTTPS callback/logout origins, and selects an approved integration profile. Keep draft, verified, active, suspended and retired states separate. Do not make a browser form equivalent to approval or domain proof.
2. **Controlled OIDC client provisioning:** a private reconciler uses a narrowly scoped Keycloak client-registration credential to create/update/disable the environment client from a validated, versioned application deployment. It verifies readback and records external ID, issuer, exact URI set, configuration version, audit and failure state. Never put master-realm credentials in a public route. Retrying the same request must not create another client. A failure cannot mark the application active. The existing `ALLOWED_CLIENT_IDS` environment list would have to migrate to a durable active-client registry with a safe read path and rollback before dynamic onboarding is operational.
3. **Broad app admission:** define per-app open versus invite-gated entry and who may grant/revoke a person or organization seat. Evaluate active person, app state, grant/eligibility and active organization membership where required. A billing or license system may supply a fact but retains commercial truth. An OIDC token or membership alone must not grant entry. Preserve peer-local customer/staff roles and per-resource checks. Never use `GRANTED_PERSON_IDS` as a production grant store.
4. **External application privacy:** the current `GET /v1/me` returns the durable ID to allowlisted clients. Before untrusted external app onboarding, decide pairwise identifiers, consent/data scope, client ownership and abuse controls; do not expose the internal universal ID merely because an external OIDC client was registered. Existing client/issuer contracts must be versioned for this change.
5. **Exceptional realm provisioning:** after an approved trust-domain ADR, a private infrastructure reconciler can create a realm from a pinned template, configure issuer/keys/clients, verify discovery and JWT validation, record ownership and rollback, then enable traffic. This is automation of a rare approved operation, not a side effect of ordinary app or organization creation. Production and staging remain isolated.

The product needs an AccessLobby management interface for app owners and authorized operators. Keycloak's Admin Console remains an IAM operator interface; ordinary organization owners and third-party app developers must not receive realm administration just to onboard people or manage their app.

## Open decisions before activating self-service external apps

- Q-001/Q-027: which trust domains truly need separate issuer/keys, and when to introduce them;
- Q-005/Q-019/Q-022: admission modes, grant subject/scope, administrator authority, revocation latency and entitlements;
- Q-015: application registry ownership versus technical client registry;
- Q-009: proof and recovery for existing local account links;
- external subject privacy, origin/domain verification, and who may approve sensitive scopes.

This ADR is an implementation boundary and phased design, not a claim that these open policies have already been approved. The current staged `936aae1` release and its successful owner-reported tests remain separate from this branch.

## Primary technical references

- Keycloak [Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/) — realm isolation, clients and administrator delegation.
- Keycloak [Client Registration Service](https://www.keycloak.org/securing-apps/client-registration) — authenticated registration, initial access tokens and policies.
- Keycloak [Admin REST API](https://www.keycloak.org/docs-api/26.7.4/rest-api/index.html) and [realm import/export](https://www.keycloak.org/server/importExport) — available provisioning mechanics; importing an existing realm is not an application onboarding workflow.
