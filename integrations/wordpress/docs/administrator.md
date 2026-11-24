# Administrator guide

Settings → AccessLobby shows connection metadata, issuer/API/client, exact routes, version/environment, linked/total and unlinked privileged counts, emergency status and migration references. Secrets and token values are excluded. All changes require manage_options and a WordPress settings nonce. A connection metadata check requires a POST/admin nonce.

The two normal modes are WordPress + AccessLobby and AccessLobby only. JIT is separately opt-in. Default role is explicit subscriber/customer; role claims are ignored. Authentication does not grant paid membership, B2B approval, staff status or administrator access. Local authorization plugins continue checking local capabilities and records.

An existing user opens their profile, WooCommerce dashboard or a page with `[accesslobby_account]`, then Connect AccessLobby. Their current local session and fresh AccessLobby authentication must both remain valid in one five-minute flow. Conflicts stop; neither account is repointed. Email equality alone does nothing. In hybrid mode Disconnect requires the same fresh dual proof and invalidates linked sessions. Enforced-mode unlink/recovery uses host administration.

JIT creates a local account only after validation and app admission, with a random local password and opaque login name. No password is copied. A verified email collision asks the person to link; it never silently takes over the existing user. Email changes after linking do not rewrite a WordPress profile or create another user.

`wp accesslobby status` prints non-secret routes/migration counts. Audit events are in the site-local accesslobby_audit table and exposed by the `accesslobby_audit` hook; events include correlation ID/client/plugin version and local numeric user ID, never token/code/secret/cookie values. Use a private operational exporter for longer retention. The hourly cleanup expires transient state/sessions and audit older than 90 days. See security.md for retention on uninstall.

Machine password APIs have an explicit setting in enforced mode. Keep it enabled during initial migration and inventory Application Passwords/XML-RPC/REST integrations before changing it. WP-CLI, cron and existing cookie-based REST sessions are separate from interactive login. Checkout remains governed by WooCommerce. Modern WooCommerce login layouts and custom membership handlers require the compatibility matrix, not assumptions based on core login.
