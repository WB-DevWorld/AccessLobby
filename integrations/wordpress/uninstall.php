<?php
/** Deliberate retention: mappings/audit and all WordPress/WooCommerce data survive removal. */
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;
wp_clear_scheduled_hook( 'accesslobby_cleanup' );
// No DROP TABLE, user deletion, commerce mutation or password reset on uninstall.
// A host operator may export and remove accesslobby_* tables under the documented retention procedure.
