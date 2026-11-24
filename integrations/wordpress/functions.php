<?php
/** Public integration API. No theme files need to be modified. */
if ( ! function_exists( 'accesslobby_login_url' ) ) {
	function accesslobby_login_url( string $destination = '', string $intent = 'login' ): string {
		return add_query_arg(
			array(
				'redirect_to' => AccessLobby\WordPress\Security::destination( $destination, home_url( '/' ), site_url( '/' ) ),
				'intent'      => 'join' === $intent ? 'join' : 'login',
			),
			AccessLobby\WordPress\Config::route( 'start' )
		);
	}
}
if ( ! function_exists( 'accesslobby_logout_url' ) ) {
	function accesslobby_logout_url(): string {
		return AccessLobby\WordPress\Config::route( 'logout' );
	}
}
