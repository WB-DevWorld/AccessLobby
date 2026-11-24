<?php
/** Read-only pre-install inventory. Run outside the web root through WP-CLI eval-file. */
if ( ! defined( 'WP_CLI' ) || ! WP_CLI || ! defined( 'ABSPATH' ) ) {
	if ( PHP_SAPI !== 'cli' ) { http_response_code( 404 ); }
	exit( 1 );
}
require_once ABSPATH . 'wp-admin/includes/plugin.php';

$safe_url = static function ( $url ) {
	$parts = wp_parse_url( (string) $url );
	if ( ! is_array( $parts ) || empty( $parts['host'] ) || ! in_array( $parts['scheme'] ?? '', array( 'https', 'http' ), true ) || isset( $parts['user'] ) || isset( $parts['pass'] ) ) { return null; }
	return $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' ) . ( $parts['path'] ?? '' );
};
$active = (array) get_option( 'active_plugins', array() );
$network = is_multisite() ? array_keys( (array) get_site_option( 'active_sitewide_plugins', array() ) ) : array();
$plugins = array();
foreach ( get_plugins() as $basename => $data ) {
	$plugins[] = array( 'basename' => $basename, 'name' => wp_strip_all_tags( $data['Name'] ), 'version' => $data['Version'],
		'active' => in_array( $basename, $active, true ) || in_array( $basename, $network, true ) );
}
usort( $plugins, static fn( $a, $b ) => strcmp( $a['basename'], $b['basename'] ) );
$theme = wp_get_theme();
$parent = $theme->parent();
$counts = count_users();
$role_counts = (array) ( $counts['avail_roles'] ?? array() );
ksort( $role_counts );
$stored = get_option( 'accesslobby_sso', array() );
$stored = is_array( $stored ) ? $stored : array();
$commerce = null;
foreach ( $plugins as $plugin ) {
	if ( 'woocommerce/woocommerce.php' === $plugin['basename'] ) {
		$commerce = array( 'installedVersion' => $plugin['version'], 'active' => $plugin['active'],
			'orderStorageConfigured' => 'yes' === get_option( 'woocommerce_custom_orders_table_enabled' ) ? 'HPOS' : 'CPT',
			'orderStorageRuntimeVerified' => false,
			'guestCheckoutConfigured' => get_option( 'woocommerce_enable_guest_checkout' ),
			'checkoutSignupConfigured' => get_option( 'woocommerce_enable_signup_from_checkout' ),
			'myAccountSignupConfigured' => get_option( 'woocommerce_enable_myaccount_registration' ) );
	}
}
$dropins = array();
foreach ( get_dropins() as $basename => $data ) { $dropins[] = array( 'basename' => $basename, 'name' => wp_strip_all_tags( $data['Name'] ), 'version' => $data['Version'] ); }
$report = array(
	'evidenceType' => 'READ_ONLY_PREINSTALL_INVENTORY_NOT_AUTHENTICATION_ACCEPTANCE',
	'recordedAt' => gmdate( 'c' ), 'wordpress' => get_bloginfo( 'version' ), 'php' => PHP_VERSION,
	'environmentReportedByWordPress' => function_exists( 'wp_get_environment_type' ) ? wp_get_environment_type() : 'unknown',
	'homeUrl' => $safe_url( home_url( '/' ) ), 'siteUrl' => $safe_url( site_url( '/' ) ),
	'multisite' => is_multisite(), 'connectorMultisiteSupport' => false,
	'extensions' => array( 'openssl' => extension_loaded( 'openssl' ), 'sodium' => extension_loaded( 'sodium' ), 'mysqli' => extension_loaded( 'mysqli' ) ),
	'theme' => array( 'stylesheet' => $theme->get_stylesheet(), 'name' => $theme->get( 'Name' ), 'version' => $theme->get( 'Version' ),
		'parent' => $parent ? array( 'name' => $parent->get( 'Name' ), 'version' => $parent->get( 'Version' ) ) : null ),
	'plugins' => $plugins, 'dropins' => $dropins, 'externalObjectCache' => wp_using_ext_object_cache(),
	'users' => array( 'total' => (int) $counts['total_users'], 'roleCounts' => $role_counts,
		'customUserCapabilitiesAssessed' => false, 'dormancyAssessed' => false ),
	'woocommerce' => $commerce,
	'connectorPersistedConfiguration' => array( 'mode' => in_array( $stored['mode'] ?? '', array( 'hybrid', 'enforced' ), true ) ? $stored['mode'] : null,
		'issuer' => $safe_url( $stored['issuer'] ?? '' ), 'api' => $safe_url( $stored['api'] ?? '' ),
		'jitConfigured' => isset( $stored['jit'] ) ? (bool) $stored['jit'] : null ),
	'authenticationQualification' => 'NOT_RUN', 'httpsProxyAndCacheQualification' => 'NOT_RUN',
	'notes' => array( 'No usernames, emails, order/customer records, credentials or tokens are exported.',
		'Role totals do not assess per-user capabilities or prove migration readiness.',
		'Storage and checkout flags are saved configuration, not commerce/runtime qualification.' ),
);
WP_CLI::line( wp_json_encode( $report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) );
