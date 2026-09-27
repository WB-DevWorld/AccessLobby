# Information architecture and route map

## Navigation model

The authenticated product shell should support:

### Primary identity navigation

- Overview
- Identity
- Recovery
- Security
- Apps & Access
- Privacy

### Secondary navigation

- Help
- Account menu
- Theme control
- Notifications placeholder only when a real notification source exists

Navigation items whose products are not implemented must be hidden, disabled with an honest explanation, or protected by explicit feature flags.

## Route plan

| Route | Product page | Initial state | Data authority |
|---|---|---|---|
| `/` | Public AccessLobby landing/sign-in | Existing; restyle without breaking auth | Existing OIDC handoff |
| `/account` | Personal Account Overview | Wave 1, production route | Session + `/v1/me` |
| `/identity` | Identity Profile | Wave 1 | `/v1/me`; future typed profile adapter |
| `/recovery` | Recovery & Trusted Contacts | Wave 1 shell; feature-flagged/unavailable until API exists | Future recovery contract |
| `/security` | Security Center | Later | Future session/security APIs |
| `/apps` | Connected Apps | Later | Future app-registry/access contract |
| `/apps/[connectionId]/permissions` | App Permissions | Later | Future consent/permission contract |
| `/launcher` | SSO App Launcher | Provisional/later | Future app registry; ownership review required |
| `/trust` | Trust Score / Trust Level | Provisional/later | Future authoritative assertion provider |
| `/insights` | Insights Overview | Prototype/later | Future authorized telemetry contract |
| `/insights/seo` | SEO / AISEO Performance | Prototype/later | Ownership and data scope unresolved |
| `/insights/reports` | Analytics Explorer / Reports | Prototype/later | Ownership and data scope unresolved |

## `/account` compatibility

`/account` remains the canonical first signed-in destination for the first UI wave. This avoids changing the proven callback and existing staging behavior while the shell is introduced.

The route may become the Personal Account Overview, but it must retain:

- safe server-side session resolution;
- bounded API timeout;
- truthful unavailable state;
- sign-in retry path;
- sign-out action;
- no exposure of raw tokens.

## Layout structure

Recommended route/layout structure:

```text
apps/web/app/
  layout.tsx
  page.tsx
  account/page.tsx
  identity/page.tsx
  recovery/page.tsx
  auth/
  components/
    app-shell/
    navigation/
    feedback/
    ui/
  features/
    identity/
    recovery/
  lib/
    api/
    auth/
    feature-flags/
    fixtures/
```

The exact folders may change during implementation, but feature boundaries and adapter separation must remain clear.

## Responsive behavior

### Desktop

- persistent sidebar;
- top bar with page title context and account controls;
- content width suitable for dense identity information;
- cards and data sections reflow without horizontal page scrolling.

### Mobile

- compact header;
- bottom navigation for the highest-frequency destinations;
- stacked content cards;
- minimum interactive target size of approximately 44 CSS pixels;
- tables convert to lists/cards or controlled horizontal regions with labels preserved.

### Intermediate widths

Tablet behavior must be intentional. Do not rely on desktop shrinking until it becomes mobile.

## Accessibility landmarks

Every authenticated page should expose:

- skip link;
- `header`;
- `nav` with accessible label;
- one `main` landmark;
- hierarchical headings;
- labelled account and theme controls;
- live-region behavior only for meaningful asynchronous status updates.
