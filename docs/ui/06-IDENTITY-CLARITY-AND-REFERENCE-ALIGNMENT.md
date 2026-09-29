# Identity clarity and reference alignment

Tracking: issue #27

## Product-language rules

- Use **AccessLobby ID** as the current user-facing label for the durable opaque identifier.
- Do not freeze unresolved public API or claim names such as `accesslobby_person_id` merely through UI copy.
- Show the AccessLobby ID openly to the signed-in owner with a copy action and a short explanation.
- Keep tokens, cookies, OIDC subjects, IAM-private identifiers, client secrets, session IDs, and recovery secrets out of normal account UI.
- Preserve **Identity** as the AccessLobby product/module concept. A profile is one surface inside Identity, not the whole module.
- Preserve **Apps & Access** as the broader planned module. Connected Apps is a page inside that module.
- Explain that one AccessLobby identity may link to separate app-local accounts, data, roles, and permissions.
- Do not imply that AccessLobby owns every verification engine. It may display assertions supplied by an approved verification service.
- Do not present unapproved recovery mechanisms as committed features. Label them as possible or under evaluation until approved.

## Logout language

The primary user choices are:

1. **Sign out of this app** — end only the current app session. The shared AccessLobby session may allow quick sign-in again.
2. **Sign out of AccessLobby and supported apps** — end the shared AccessLobby sign-in session and let participating apps process the sign-out.

Do not claim that the second choice instantly destroys every independent local app session unless runtime evidence proves it.

## Identifier layers in connected apps

A connected application should be able to show, when useful:

- the stable **AccessLobby ID**;
- the app's separate **local account ID**.

The interface must explain that the AccessLobby ID identifies the person through AccessLobby, while the local ID belongs to the application's own account, data, and permissions.

## Mobile requirements

At 360, 390, and 412 CSS pixels:

- no page-level horizontal scrolling or clipped controls;
- the complete wordmark and theme control remain visible;
- public hero content fits the viewport;
- the identity illustration becomes a bounded vertical composition rather than relying on off-canvas orbit labels;
- identifier values wrap without widening the page;
- copy and sign-out controls remain at least 44 CSS pixels high.

## Relationship to the generated references

The generated UI images are visual direction, not pixel-perfect specifications or proof of implemented data. They establish the desired visual language: light and dark themes, rounded cards, clear hierarchy, desktop side navigation, mobile navigation, identity summaries, apps/access management, trust presentation, and analytics concepts.

The current implementation is **not yet an exact reproduction of all reference images**:

- public and Identity Wave1 routes, contexts, organizations and the first-party app-request/grant surface are implemented; the new app surface is not yet staging-accepted;
- several reference cards depend on profile, contact, verification, recovery, connected-app, consent, trust, SEO, and analytics contracts that do not exist yet;
- Keycloak still renders the authentication screens;
- the reference consumer remains a conformance application rather than a full product UI;
- first-party Apps & Access foundations now exist; complete connected-app/consent/entitlement UX, Trust, Insights, SEO/AISEO and Analytics remain future or unresolved work.

Future implementation should match the references closely where the product boundary and real data contract are approved, while retaining truthful unavailable states where capabilities are not implemented.
