<?php
/** Test-only hooks, never packaged. No anonymous session injection/authentication shortcut. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) { return; }
add_shortcode( 'fixture_local_login', static fn() => wp_login_form( array( 'echo' => false ) ) );
add_action( 'template_redirect', static function () {
	if ( is_page( (int) get_option( 'alwp_fixture_protected' ) ) && ! is_user_logged_in() ) { auth_redirect(); }
} );
add_action( 'wp_footer', static function () {
	echo '<output id="fixture-identity" data-user="' . esc_attr( (string) get_current_user_id() ) . '" data-admin="' . esc_attr( current_user_can( 'manage_options' ) ? 'yes' : 'no' ) . '"></output>';
} );
// Prevent real mail from disposable fixtures; never relax authentication/authorization.
add_filter( 'pre_wp_mail', '__return_false' );
