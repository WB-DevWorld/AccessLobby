# Setup

Use a disposable or backed-up non-production installation first. Record WordPress/PHP/WooCommerce/theme/plugin versions and cache/security settings. This connector requires independent WordPress installations; multisite activation is refused.

Upload the installable ZIP, activate, and open Settings → AccessLobby. Enter the environment's exact full issuer (including realm path), API origin and distinct reviewed client ID. Choose WordPress + AccessLobby initially. No secret is required by the supported public-client Code/PKCE profile. If an operator separately approves a confidential client using client_secret_post, supply `ACCESSLOBBY_CLIENT_SECRET` in protected wp-config/environment configuration; it is never stored in settings.

The page displays exact callback, logout-return and backchannel URLs, derived with WordPress APIs. Select **WordPress** in AccessLobby's developer-tools request and copy these exact values through DNS-proof/review/private provisioning. The operator renderer takes `--platform wordpress`; the JSON planner takes `"platform":"wordpress"`. This requires migration006 and the matching API revision. Fixed action/REST queries are permitted only for this profile; do not remove them or add return targets. Every installation/environment gets its own client. No wildcard callback, realm-per-site, shared database or IAM admin access is needed by WordPress. Activate a reviewed registry row with `authenticated_open` or `grant_required`; the connector always checks `/v1/application-entry`. A transitional allowlist alone is insufficient for app entry.

Keep scopes `openid profile email` for this first-party profile, `aud=accesslobby-api`, signed RS256 tokens, PKCE S256 and session-required backchannel logout. Set the backchannel URL before activation and confirm the registration/readback. Test connection metadata, then complete actual sign-in/linking; metadata checks alone do not qualify a client.

For alpha.4 continuing session checks, apply API migrations005/006 and deploy the matching API before the plugin. Run the connection test, confirm opaque receipts are available and establish a fresh SSO session. Older sessions/API versions retain their earlier bounded behavior; they do not acquire retroactive revocation guarantees. See [logout](logout.md).

Configure cache exclusions from security.md. Enable opt-in JIT only after selecting subscriber or customer and reviewing its actual capabilities. The plugin rejects a modified default role with capabilities beyond read/level_0. Existing users must link while locally signed in. Add `[accesslobby_login]`, `[accesslobby_login intent="join"]`, the AccessLobby login block or `[accesslobby_account]` through the editor for custom themes.

For subdirectories use the displayed URLs verbatim. `home` and `siteurl` can differ; do not strip `/gh/` or `/intl/`. Configure HTTPS correctly at the trusted proxy/WordPress layer. The connector does not trust arbitrary forwarded headers to manufacture HTTPS or an emergency IP.

Production must not define `ACCESSLOBBY_ALLOW_LOCAL_HTTP`. Its only exception is exact localhost/127.0.0.1/::1 when WordPress environment type is `local`. There is no staging HTTP exception.

For dedicated theme or membership login pages, select the published pages under **Settings → AccessLobby → Frontend login pages**. Hybrid mode keeps their normal UI. AccessLobby only starts SSO on entry, even without JavaScript; a validated `redirect_to` returns to the original resource, otherwise the site home is used. Do not select ordinary browsing pages. A login action in a footer, shortcode or block does not by itself turn that public page into a mandatory login page. Read [frontend integration](frontend.md).
