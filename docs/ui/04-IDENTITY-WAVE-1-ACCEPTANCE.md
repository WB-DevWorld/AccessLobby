# Identity Wave 1 acceptance criteria

Tracking: issue #16

## Shared shell

- Desktop sidebar, top bar, page container and account menu are reusable.
- Mobile header and bottom navigation are reusable.
- Shell supports signed-in, signed-out, unavailable and loading states.
- No horizontal page overflow at representative mobile, tablet and desktop widths.
- Navigation items for unavailable products are hidden, disabled truthfully or feature-flagged.
- Theme tokens are prepared for light/dark support without page-specific color duplication.

## Personal Account Overview — `/account`

- Existing session unsealing and `/v1/me` request remain server-side.
- The real person ID and lifecycle/status display correctly when available.
- Signed-out users receive a clear sign-in path.
- API timeout or failure produces a truthful unavailable state.
- Sign-out continues to post through the existing logout route.
- No visual card claims a capability that is not backed by live data.

## Identity Profile — `/identity`

- Real person ID and lifecycle/status are presented from the current identity adapter.
- Planned profile sections can render unavailable/not-configured states without fake values.
- Page structure remains compatible with later profile/contact/address/claim APIs.
- Sensitive identifiers are not exposed beyond what the current approved account contract already returns.

## Recovery & Trusted Contacts — `/recovery`

- Route is protected by an explicit feature state.
- No recovery contact, backup code, passkey or device-recovery claim is shown as live without a backend contract.
- The unavailable/coming-later presentation is useful and consistent with the product shell.
- No recovery data is collected or persisted by the first UI foundation PR.

## Accessibility

- A skip link reaches the main content.
- Keyboard focus is visible and logical.
- Navigation has accessible labels and current-page state.
- Buttons and links have meaningful names.
- Status is not communicated through color alone.
- Motion honors reduced-motion preferences where applicable.
- Interactive targets are suitable for touch.

## Verification

Required before merge:

- TypeScript typecheck passes.
- Existing web tests remain green.
- New component/route tests pass.
- Production Next.js build passes.
- Browser screenshots are captured at representative desktop and mobile widths.
- Existing login, account resolution and logout are re-smoked in staging after deployment.
