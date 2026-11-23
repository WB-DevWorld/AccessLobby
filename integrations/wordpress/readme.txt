=== AccessLobby SSO for WordPress ===
Contributors: wbdevworld
Tags: sso, openid-connect, accesslobby, authentication, woocommerce
Requires at least: 6.9
Tested up to: 7.1
Requires PHP: 8.3
Stable tag: 0.1.0-alpha.4
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Controlled first-party AccessLobby SSO with local WordPress data ownership, explicit linking and two authentication modes.

== Description ==
AccessLobby authenticates people. WordPress retains its user IDs, roles and capabilities. WooCommerce retains customers, orders, addresses, downloads, subscriptions and guest-checkout policy. No password synchronization or email-based account linking.

This alpha requires reviewed first-party client registration. Arbitrary third-party publisher activation and WordPress Multisite are not supported. See the bundled documentation for exact qualification status, privacy boundaries and operational requirements.

== Installation ==
Back up a non-production site. Upload the release ZIP through Plugins > Add New > Upload Plugin. Activate, open Settings > AccessLobby and follow docs/setup.md. Remain in WordPress + AccessLobby until users are linked and the migration gate is satisfied.

== Frequently Asked Questions ==
= Will this replace my customers, roles or orders? =
No. The connector creates an explicit identity mapping to the existing WordPress user after proof of both accounts. JIT, if enabled, creates only a safe local role for a validated new identity.
= Does the plugin enable guest checkout? =
The plugin does not change WooCommerce guest-checkout settings.
= Can any external WordPress operator activate it? =
Not yet. The current AccessLobby identity contract is first-party only; external publisher privacy/onboarding is a separate gate.

== Changelog ==
= 0.1.0-alpha.4 =
* Add optional negotiated server session receipts and missed-logout reconciliation.

= 0.1.0-alpha.3 =
* Restrict frontend submit interception to actual supported credential forms.
* Expand real editor, modal and account disconnect/reconnect qualification.

= 0.1.0-alpha.2 =
Initial first-party pilot connector. See CHANGELOG.md and bundled compatibility/qualification records.
