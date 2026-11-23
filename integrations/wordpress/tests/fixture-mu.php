<?php
/** Test-only hooks, never packaged. The bypass probe still requires valid local password proof. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) { return; }
add_shortcode( 'fixture_local_login', static fn() => wp_login_form( array( 'echo' => false ) ) );
add_action( 'init', static function () {
	if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || empty( $_POST['fixture_direct_local_login'] ) ) { return; }
	if ( ! wp_verify_nonce( (string) ( $_POST['_wpnonce'] ?? '' ), 'fixture_direct_local_login' ) ) { wp_die( 'Invalid fixture nonce' ); }
	$user = get_user_by( 'login', wp_unslash( (string) ( $_POST['log'] ?? '' ) ) );
	if ( ! $user || ! wp_check_password( wp_unslash( (string) ( $_POST['pwd'] ?? '' ) ), $user->user_pass, $user->ID ) ) { wp_die( 'Invalid fixture proof' ); }
	// Simulates a custom password frontend that bypasses authenticate(), using real WordPress cookie APIs.
	wp_set_auth_cookie( $user->ID );
	wp_safe_redirect( get_option( 'alwp_fixture_data' )['account'], 303 );
	exit;
}, 20 );
add_action( 'template_redirect', static function () {
	if ( is_page( (int) get_option( 'alwp_fixture_protected' ) ) && ! is_user_logged_in() ) { auth_redirect(); }
	if ( is_page( (int) get_option( 'alwp_fixture_restricted' ) ) && ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Fixture local resource denied', '', array( 'response' => 403 ) );
	}
} );
add_filter( 'pre_http_request', static function ( $result, $args, $url ) {
	if ( ! in_array( wp_parse_url( $url, PHP_URL_HOST ), array( '127.0.0.1', 'localhost' ), true ) ) {
		return new WP_Error( 'fixture_external_service_blocked', 'Disposable fixtures do not use external updates or feeds' );
	}
	if ( get_option( 'alwp_fixture_outage' ) && str_contains( $url, '/v1/me' ) ) {
		return new WP_Error( 'fixture_outage', 'Disposable identity API outage' );
	}
	return $result;
}, 10, 3 );
add_filter( 'rest_pre_dispatch', static function ( $result, $server, $request ) {
	if ( get_option( 'alwp_fixture_backchannel_outage' ) && '/accesslobby/v1/backchannel-logout' === $request->get_route() ) {
		update_option( 'alwp_fixture_delivery_attempts', (int) get_option( 'alwp_fixture_delivery_attempts' ) + 1 );
		return new WP_Error( 'fixture_delivery_unavailable', 'Disposable delivery outage', array( 'status' => 503 ) );
	}
	return $result;
}, 10, 3 );
add_action( 'wp_footer', static function () {
	echo '<output id="fixture-identity" data-user="' . esc_attr( (string) get_current_user_id() ) . '" data-admin="' . esc_attr( current_user_can( 'manage_options' ) ? 'yes' : 'no' ) . '" data-order-received="' . esc_attr( function_exists( 'is_order_received_page' ) && is_order_received_page() ? 'yes' : 'no' ) . '"></output>';
	echo '<input id="fixture-direct-nonce" type="hidden" value="' . esc_attr( wp_create_nonce( 'fixture_direct_local_login' ) ) . '">';
} );
// Prevent real mail from disposable fixtures; never relax authentication/authorization.
add_filter( 'pre_wp_mail', '__return_false' );
