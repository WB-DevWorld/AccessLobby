<?php
/** Confirms the one-use emergency ticket cannot be redeemed again. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE || ! is_file( '/fixture-logs/emergency-ticket' ) ) {
	fwrite( STDERR, "Fixture recovery check was not prepared\n" );
	exit( 1 );
}

global $wpdb;
$store = new AccessLobby\WordPress\Store( $wpdb );
$ticket = file_get_contents( '/fixture-logs/emergency-ticket' );
unlink( '/fixture-logs/emergency-ticket' );
$replayed = false;
try {
	$_SERVER['HTTPS'] = 'on';
	$_SERVER['REMOTE_ADDR'] = '127.0.0.1';
	$_SERVER['REQUEST_METHOD'] = 'POST';
	$_POST['ticket'] = is_string( $ticket ) ? trim( $ticket ) : '';
	AccessLobby\WordPress\Emergency::redeem( $store );
} catch ( AccessLobby\WordPress\Failure $error ) {
	$replayed = 'expired_or_replayed_flow' === $error->getMessage();
}
$admin = get_user_by( 'login', 'fixture_admin' );
$started = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i WHERE event=%s', $store->table( 'audit' ), 'emergency_session_started' ) );
if ( ! $replayed || ! $admin || ! in_array( 'administrator', $admin->roles, true ) || $started < 1 ) {
	fwrite( STDERR, "Emergency recovery was not one-use or changed the administrator\n" );
	exit( 1 );
}
WP_CLI::line( 'LIFECYCLE emergency-ticket-consumed' );
WP_CLI::line( 'LIFECYCLE administrator-role-preserved' );
