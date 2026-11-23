<?php
/** Test-only hooks, never packaged. No anonymous session injection/authentication shortcut. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) { return; }
add_shortcode( 'fixture_local_login', static fn() => wp_login_form( array( 'echo' => false ) ) );
add_action( 'template_redirect', static function () {
	if ( is_page( (int) get_option( 'alwp_fixture_protected' ) ) && ! is_user_logged_in() ) { auth_redirect(); }
} );
$identity = static function () {
	echo '<output id="fixture-identity" data-user="' . esc_attr( (string) get_current_user_id() ) . '" data-admin="' . esc_attr( current_user_can( 'manage_options' ) ? 'yes' : 'no' ) . '"></output>';
};
add_action( 'wp_footer', $identity );
add_action( 'login_footer', $identity );
// Prevent real mail from disposable fixtures; never relax authentication/authorization.
add_filter( 'pre_wp_mail', '__return_false' );
// The built-in server is single-threaded. A loopback or a public WordPress call would stall the page.
add_filter( 'pre_http_request', static function ( $pre, $args, $url ) {
	$host = parse_url( $url, PHP_URL_HOST );
	$port = (int) parse_url( $url, PHP_URL_PORT );
	if ( '127.0.0.1' === $host && in_array( $port, array( 8083, 8090 ), true ) ) { return $pre; }
	return new WP_Error( 'fixture_http_blocked', 'Disposable fixture blocks this HTTP request' );
}, 10, 3 );
