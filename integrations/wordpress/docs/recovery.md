# Emergency recovery and rollback

Emergency recovery requires authenticated host/SSH access, explicit protected wp-config configuration and an exact remote IP. It never reveals an ordinary WordPress password screen during an outage.

```php
define('ACCESSLOBBY_EMERGENCY_ENABLED', true);
define('ACCESSLOBBY_EMERGENCY_IPS', ['YOUR_EXACT_TRUSTED_REMOTE_IP']);
```

Prefer an additional private proxy/VPN route. The IP checked is PHP REMOTE_ADDR; spoofed X-Forwarded-For does not count. A shared proxy IP must not be allowlisted as if it identified one administrator. Rehearse with the actual topology before declaring recovery ready.

An authorized host operator runs `wp accesslobby emergency-ticket --user=EXISTING_ADMIN_ID --ip=EXACT_CONFIGURED_IP --reason='incident reference and reason'`. The command prints a single 256-bit ticket to the operator terminal. It expires in five minutes, is bound to that IP and existing manage_options user, and can be redeemed only once. Do not paste it into chat, logs or a URL. From that exact trusted IP over HTTPS, open the site's wp-login.php?action=al_emergency page and POST the ticket in its form. Other IPs receive 404; only a short emergency session is created. Issuance/use are audited without ticket values.

Normal users have no emergency link. Configure nothing until the operator can secure the host route. A consumed/expired/replayed ticket fails closed. Recovery is an explicit host-issued authority, not a response to AccessLobby failure.

Rollback: record the incident, run `wp plugin deactivate accesslobby-sso` on the correct installation, verify local login, preserve mapping/audit tables, and restore the prior package if needed. If CLI cannot load a failed plugin, use its skip-plugins option. Restore a database backup only for an actual data migration failure after preserving newer commerce records; ordinary authentication rollback does not need to rewind orders. Rotate emergency access configuration after the incident and inspect audit.

Deactivation removes plugin-enforced login hooks and scheduled cleanup, preserving users/passwords/commerce and mappings. Reactivating a site whose saved mode is enforced ends all of that site's WordPress cookie sessions, including local sessions created during rollback, and requires AccessLobby entry again. This deliberate authentication transition does not sign out other sites or change Application Passwords. Uninstall deliberately retains mapping/audit/private rows for safe reinstall; expired private data should be removed by an authorized export/purge process if permanently retiring the connector. Never delete WordPress users or WooCommerce orders as connector cleanup.
