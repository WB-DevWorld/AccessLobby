<?php
/** Disposable-fixture lifecycle checks. This file is not product behavior. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) {
	fwrite( STDERR, "Fixture required\n" );
	exit( 1 );
}

function alwp_lifecycle( string $name ): void {
	WP_CLI::line( 'LIFECYCLE ' . $name );
}

global $wpdb;
$store = new AccessLobby\WordPress\Store( $wpdb );
$users = count_users()['total_users'];
$links = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $store->table( 'links' ) ) );
$admin = get_user_by( 'login', 'fixture_admin' );
$roles = $admin->roles;
$guest = get_option( 'woocommerce_enable_guest_checkout' );
$order_id = 0;
if ( function_exists( 'wc_create_order' ) ) {
	$order = wc_create_order( array( 'customer_id' => $admin->ID ) );
	$order->set_status( 'pending' );
	$order->save();
	$order_id = $order->get_id();
}
$local = get_user_by( 'email', 'local-only@example.test' );
if ( ! $local || $store->link_for_user( $local->ID ) ) {
	fwrite( STDERR, "Expected an unlinked local account\n" );
	exit( 1 );
}

AccessLobby\WordPress\Plugin::deactivate();
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	define( 'WP_UNINSTALL_PLUGIN', true );
}
require dirname( ACCESSLOBBY_WP_FILE ) . '/uninstall.php';
AccessLobby\WordPress\Plugin::activate();

$saved_order = $order_id ? wc_get_order( $order_id ) : null;
$order_ok = ! $order_id || ( $saved_order && (int) $saved_order->get_customer_id() === (int) $admin->ID && 'pending' === $saved_order->get_status() );
if ( count_users()['total_users'] !== $users || get_userdata( $admin->ID )->roles !== $roles || (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $store->table( 'links' ) ) ) !== $links || ! $order_ok || get_option( 'woocommerce_enable_guest_checkout' ) !== $guest ) {
	fwrite( STDERR, "Lifecycle changed local identity, permissions, or commerce data\n" );
	exit( 1 );
}
alwp_lifecycle( 'deactivate-uninstall-activate-preserves-data' );

delete_option( 'accesslobby_schema' );
$store->migrate();
if ( '1' !== get_option( 'accesslobby_schema' ) || (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $store->table( 'links' ) ) ) !== $links ) {
	fwrite( STDERR, "Schema rebuild changed mappings\n" );
	exit( 1 );
}
alwp_lifecycle( 'schema-rebuild-preserves-links' );

wp_set_current_user( $admin->ID );
$oidc = new AccessLobby\WordPress\Oidc( new AccessLobby\WordPress\Http(), new AccessLobby\WordPress\TokenValidator() );
$settings = new AccessLobby\WordPress\Admin( $store, $oidc );
$saved = get_option( 'accesslobby_sso' );
$attempt = $saved;
$attempt['mode'] = 'enforced';
$returned = $settings->sanitize( $attempt );
if ( 'hybrid' !== ( $returned['mode'] ?? '' ) || 'hybrid' !== ( get_option( 'accesslobby_sso' )['mode'] ?? '' ) || $store->link_for_user( $local->ID ) ) {
	fwrite( STDERR, "Enforcement readiness changed the configuration or an unlinked account\n" );
	exit( 1 );
}
alwp_lifecycle( 'enforcement-readiness-preserves-hybrid' );
alwp_lifecycle( 'unlinked-account-unchanged' );

$broken = $saved;
$broken['issuer'] = 'https://api.alwp.test:8443/not-an-issuer';
update_option( 'accesslobby_sso', $broken );
$outage = false;
try {
	$oidc->discovery( AccessLobby\WordPress\Config::get() );
} catch ( Throwable $error ) {
	$outage = true;
}
update_option( 'accesslobby_sso', $saved );
if ( ! $outage || count_users()['total_users'] !== $users || get_option( 'accesslobby_sso' )['issuer'] !== $saved['issuer'] ) {
	fwrite( STDERR, "Issuer outage did not fail closed\n" );
	exit( 1 );
}
alwp_lifecycle( 'issuer-outage-fails-closed' );

$blocked = false;
try {
	AccessLobby\WordPress\Emergency::issue( $store, $local->ID, '127.0.0.1', 'fixture recovery check' );
} catch ( AccessLobby\WordPress\Failure $error ) {
	$blocked = 'emergency_not_configured' === $error->getMessage();
}
try {
	AccessLobby\WordPress\Emergency::issue( $store, $admin->ID, '203.0.113.10', 'fixture recovery check' );
} catch ( AccessLobby\WordPress\Failure $error ) {
	$blocked = $blocked && 'emergency_not_configured' === $error->getMessage();
}
try {
	AccessLobby\WordPress\Emergency::issue( $store, $admin->ID, '127.0.0.1', 'short' );
} catch ( AccessLobby\WordPress\Failure $error ) {
	$blocked = $blocked && 'emergency_not_configured' === $error->getMessage();
}
if ( ! $blocked ) {
	fwrite( STDERR, "Emergency recovery accepted an ineligible request\n" );
	exit( 1 );
}
alwp_lifecycle( 'emergency-ineligible-rejected' );

$ticket = AccessLobby\WordPress\Emergency::issue( $store, $admin->ID, '127.0.0.1', 'fixture recovery check' );
file_put_contents( '/fixture-logs/emergency-ticket', $ticket );
alwp_lifecycle( 'emergency-ticket-issued' );
$_SERVER['HTTPS'] = 'on';
$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST['ticket'] = $ticket;
AccessLobby\WordPress\Emergency::redeem( $store );
