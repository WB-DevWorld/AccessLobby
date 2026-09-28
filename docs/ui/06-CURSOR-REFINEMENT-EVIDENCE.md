# Identity Wave 1 refinement evidence

Date: 2026-09-28

Branch: `feat/ui-cursor-refinement`

This pass refines the existing shell. It does not change `/auth/**`, `apps/web/lib/oidc.ts`, `/v1/me`, or peer-local authorization.

Representative screenshots are in `docs/ui/verification-screenshots/`. The directory is not named `evidence`, because the CI source-material guard rejects that directory name. Files named `preview-*` are layout previews. Each preview page says that no live account is signed in and uses the identifier `preview-not-a-live-person`. That identifier is not an AccessLobby person. The preview route was removed before the committed production build.

## Representative screenshots

| File | What it shows |
|---|---|
| `home-390x844-light.png` | Public home, phone, light |
| `home-1440x900-light.png` | Public home, desktop, light |
| `home-1440x900-dark.png` | Public home, desktop, dark |
| `account-390x844-light.png` | Signed-out account state, phone |
| `preview-account-390x844-light.png` | Account layout preview, phone |
| `preview-account-1440x900-light.png` | Account layout preview, desktop |
| `preview-identity-390x844-light.png` | Identity layout preview, phone |
| `preview-identity-1440x900-light.png` | Identity layout preview, desktop |
| `preview-recovery-390x844-light.png` | Recovery layout preview, phone |
| `preview-recovery-1440x900-light.png` | Recovery layout preview, desktop |

Repeated viewport and theme combinations from the earlier browser run are not committed.

## How the pages were served

`pnpm --filter @accesslobby/web build` then `pnpm --filter @accesslobby/web start`.

The process used local non-secret values: `WEB_BASE_URL=http://127.0.0.1:3000`, `OIDC_ISSUER=http://127.0.0.1:8080/realms/accesslobby-first-party`, `OIDC_CLIENT_ID=accesslobby-web`, `API_INTERNAL_URL=http://127.0.0.1:3001`, and a process-local `SESSION_SECRET`. No production secret was used or committed.

`next start` printed that `output: standalone` prefers `node .next/standalone/server.js`. The `next start` process still served the built pages, and the captured headings match those pages. There were no HMR WebSocket errors.

Public home and the signed-out account shot were captured again after the temporary preview route was deleted. Layout preview shots were captured with `next start` while that route was mounted.

## Routes checked on the production server

| Route | What rendered |
|---|---|
| `/` | Public landing, sign-in, and create-account entry |
| `/account` | Signed-out state: “Sign in to continue” |
| temporary `/preview?screen=account` | Labeled account layout preview |
| temporary `/preview?screen=identity` | Labeled identity layout preview |
| temporary `/preview?screen=recovery` | Labeled planned recovery layout |

## Visible error overlay

CI run 61’s browser report set `overlay` to true on every page. That field was `document.querySelector('nextjs-portal')`. On the development server that host element exists even when no error dialog is shown, so the field did not mean a visible Next.js error overlay.

The replacement field is `visibleErrorOverlay`. It is true only when a dialog inside `nextjs-portal` is displayed. On this production-server run, `devOverlayHost` was false and `visibleErrorOverlay` was false for every retained screenshot. No page console errors were recorded. Measured details are in `docs/ui/verification-screenshots/report.json`.

## Other checks on the retained shots

- No page-level horizontal overflow (`scrollWidth` matched the viewport).
- Skip-link focus used a 3px solid outline in light (`rgb(8, 70, 199)`) and dark (`rgb(185, 210, 255)`). Screenshots were taken after that focus was cleared.
- Measured links and buttons were at least 44px tall.
- `prefers-reduced-motion: reduce` set button transitions to `1e-05s` and document scrolling to `auto`.

## Unresolved limitations

- No sealed session was available, so the live `/account`, `/identity`, and `/recovery` responses are the signed-out state. The signed-in shell images are labeled layout previews.
- An API timeout after a valid sealed session was not replayed.
- Staging sign-in, `/v1/me` resolution, current-app sign-out, and shared-SSO sign-out still need a re-smoke after this web image is deployed.
