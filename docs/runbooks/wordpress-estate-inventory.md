# Controlled WordPress estate inventory

Use the same generic inventory for every installation. A domain name or historical stack is not deployment truth, and `/gh/` and `/intl/` may be physically independent sites. Inventory first; do not switch authentication modes or install a comparison candidate on production to discover its configuration.

The operator uses existing host access, identifies each actual WordPress document root and Unix owner, and copies `integrations/wordpress/scripts/site-inventory.php` outside the web root. Do not read or export raw wp-config files, secrets, license settings or customer records. The owner already supplied SSH access routes in the private handoff; they are deliberately excluded here.

Run as the site's Unix owner, retaining the JSON privately:

```sh
umask 077
wp --path=ABSOLUTE_WORDPRESS_ROOT --skip-plugins --skip-themes eval-file /PRIVATE_OPERATOR_PATH/site-inventory.php > /PRIVATE_OPERATOR_PATH/site-inventory.json
```

The script invokes no network request and issues no writes. Standard WordPress bootstrap still loads drop-ins and must-use plugins even when normal plugins/themes are skipped; review those if strict operational isolation is required. Do not use `--allow-root` as a substitute for identifying the correct site owner. No plugin installation, user creation, client registration, mode change or session invalidation is part of this command.

It records WordPress/PHP, standalone/multisite, active and installed plugin versions, active/parent theme, cache drop-ins, aggregate role/user counts, saved Woo checkout/order-storage flags and a minimal subset of persisted connector settings. It exports no user IDs, usernames, email addresses, customer/order content, passwords, client secrets or token values. URL credentials/query strings are excluded. Treat infrastructure/plugin inventory as a private operational report; publish only the selected qualification facts.

`authenticationQualification=NOT_RUN` is intentional. Role totals do not assess custom per-user capabilities; the connector's actual migration gate remains authoritative. Woo HPOS here is configured state, not the real `OrderUtil` readback used by runtime CI. HTTPS/proxy/cache behavior, modal/mobile login, subscriptions/downloads, commerce preservation, logout and public cross-domain SSO still require controlled browser/runtime qualification.

For the owner estate, begin with staging.cetechbpa.com, training.cetechbpa.com and training.flairoc.com when reachable. Determine whether other FLAIROC installs are production before any mutation. Record each real physical root separately, including site/home URLs and version tuple; mark inaccessible sites BLOCKED rather than borrowing another site's result. The first-party pilot then needs a backup/restore checkpoint, reviewed exact client routes, a selected immutable plugin artifact, explicit local-account cohort, both modes, preserved commerce, logout/SSO and recovery/rollback proof. Never infer any of those passes from this inventory.
