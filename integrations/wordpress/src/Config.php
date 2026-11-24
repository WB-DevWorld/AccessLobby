<?php
namespace AccessLobby\WordPress;

final class Config {
	public static function get(): array {
		return array_merge(
			array(
				'issuer'              => '',
				'api'                 => '',
				'client_id'           => '',
				'mode'                => 'hybrid',
				'jit'                 => false,
				'default_role'        => 'subscriber',
				'machine_auth'        => true,
				'migration_reference' => '',
				'ack_unlinked'        => false,
				'login_pages'         => array(),
			),
			(array) get_option( 'accesslobby_sso', array() )
		);
	}

	public static function fingerprint( array $c ): string {
		return hash( 'sha256', wp_json_encode( array( $c['issuer'], $c['api'], $c['client_id'], site_url(), home_url() ) ) );
	}

	public static function validate( array $c ): void {
		Security::endpoint( $c['issuer'] );
		Security::endpoint( $c['api'] );
		Security::endpoint( site_url() );
		Security::endpoint( home_url() );
		if ( ! preg_match( '/^[a-z][a-z0-9_-]{2,79}$/D', $c['client_id'] ) || ! in_array( $c['mode'], array( 'hybrid', 'enforced' ), true ) ) {
			throw new Failure( 'invalid_configuration' );
		}
		if ( is_multisite() ) {
			throw new Failure( 'multisite_not_supported' );
		}
		$pages = $c['login_pages'] ?? array();
		if ( ! is_array( $pages ) || count( $pages ) > 50 ) {
			throw new Failure( 'invalid_login_pages' );
		}
		foreach ( $pages as $id ) {
			if ( ! is_int( $id ) || $id < 1 ) {
				throw new Failure( 'invalid_login_pages' );
			}
		}
		self::safe_role( $c['default_role'] );
	}

	public static function elevating_capability( string $capability ): bool {
		// Wordfence Login Security adds these to every role so a person can open their own
		// login-security screen and enroll their own second factor. They do not grant content,
		// user, shop, or settings management. This is not a firewall or cache allowlist.
		return ! in_array( $capability, array( 'read', 'level_0', 'wfls_show_login_security', 'wf2fa_activate_2fa_self' ), true );
	}

	public static function safe_role( string $name ): void {
		$role = get_role( $name );
		if ( ! in_array( $name, array( 'subscriber', 'customer' ), true ) || ! $role ) {
			throw new Failure( 'unsafe_default_role' );
		}
		foreach ( $role->capabilities as $cap => $enabled ) {
			if ( $enabled && self::elevating_capability( $cap ) ) {
				throw new Failure( 'unsafe_default_role' );
			}
		}
	}

	public static function route( string $action ): string {
		return add_query_arg( 'action', 'al_' . $action, site_url( 'wp-login.php', 'login' ) );
	}
}
