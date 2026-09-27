# Identity Wave 1 refinement evidence

Date: 2026-09-27

Branch: `feat/ui-cursor-refinement`

This pass refines the existing shell. It does not change `/auth/**`, `apps/web/lib/oidc.ts`, `/v1/me`, or peer-local authorization.

Screenshots are in `docs/ui/evidence/`. Files named `preview-*` are layout previews. Each preview page says that no live account is signed in and uses the identifier `preview-not-a-live-person`. That identifier is not an AccessLobby person. The preview route was removed before the production build.

## Routes checked

| Route | What rendered |
|---|---|
| `/` | Public landing, sign-in, and create-account entry |
| `/?error=shared_logout_unavailable` | Shared sign-out failure notice |
| `/account` | Signed-out state: “Sign in to continue” |
| `/identity` | Signed-out state: “Sign in to continue” |
| `/recovery` | Signed-out state: “Sign in to continue” |

The signed-in shell was also checked through the temporary layout preview for overview, identity, and recovery. Planned recovery copy stays planned. No profile, contact, document, or recovery data was invented as live.

## Viewports

- 390 × 844
- 768 × 1024
- 1366 × 768
- 1440 × 900

Light presentation was checked at all four widths. Dark presentation was checked at 390 × 844 and 1440 × 900.

## Results

- No page-level horizontal overflow at the sizes above.
- No Next.js error overlay. Headless Chrome reported the Next.js development websocket failing to connect; that is the dev server, not a page exception.
- Skip-link focus used a 3px solid outline in light (`rgb(8, 70, 199)`) and dark (`rgb(185, 210, 255)`).
- Measured links and buttons were at least 44px tall.
- `prefers-reduced-motion: reduce` set button transitions to about `0.00001s` and document scrolling to `auto`.
- Tablet width uses a horizontal section nav. Phone width uses the bottom nav. Laptop and desktop widths keep the sidebar.

## Commands

```text
pnpm install --frozen-lockfile
pnpm --filter @accesslobby/web typecheck
pnpm --filter @accesslobby/web test
pnpm --filter @accesslobby/web build
```

Typecheck passed. Tests: 6 passed. Production build passed and listed `/`, `/account`, `/identity`, `/recovery`, and the existing auth routes.

## Unresolved limitations

- No sealed session was available, so the live `/account`, `/identity`, and `/recovery` responses are the signed-out state. The signed-in shell evidence is the labeled layout preview.
- An API timeout or invalid sealed session was not replayed in this browser pass. The unavailable panel remains the existing component copy.
- Staging sign-in, account resolution, and logout were not re-smoked here.
- Main advanced with staging notes and the web bind repair while this branch was open. Those files were not edited by this refinement.
