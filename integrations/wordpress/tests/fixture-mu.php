<?php
/** Test-only hooks, never packaged. No anonymous session injection/authentication shortcut. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) { return; }
add_shortcode( 'fixture_local_login', static fn() => wp_login_form( array( 'echo' => false ) ) );
add_action( 'template_redirect', static function () {
	if ( is_page( (int) get_option( 'alwp_fixture_protected' ) ) && ! is_user_logged_in() ) { auth_redirect(); }
	if ( is_page( (int) get_option( 'alwp_fixture_restricted' ) ) && ! current_user_can( 'manage_options' ) ) {
		wp_die( 'Fixture local resource denied', '', array( 'response' => 403 ) );
	}
} );
add_filter( 'pre_http_request', static function ( $result, $args, $url ) {
	if ( get_option( 'alwp_fixture_outage' ) && str_contains( $url, '/v1/me' ) ) {
		return new WP_Error( 'fixture_outage', 'Disposable identity API outage' );
	}
	return $result;
}, 10, 3 );
add_action( 'wp_footer', static function () {
	echo '<output id="fixture-identity" data-user="' . esc_attr( (string) get_current_user_id() ) . '" data-admin="' . esc_attr( current_user_can( 'manage_options' ) ? 'yes' : 'no' ) . '" data-order-received="' . esc_attr( function_exists( 'is_order_received_page' ) && is_order_received_page() ? 'yes' : 'no' ) . '"></output>';
} );
// Prevent real mail from disposable fixtures; never relax authentication/authorization.
add_filter( 'pre_wp_mail', '__return_false' );
