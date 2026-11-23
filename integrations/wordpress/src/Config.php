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
		if ( ! preg_match( '/^[a-z][a-z0-9_-]{2,79}$/D', $c['client_id'] ) || ! in_array( $c['mode'], array( 'hybrid', 'enforced' ), true ) ) {
			throw new Failure( 'invalid_configuration' );
		}
		if ( is_multisite() ) {
			throw new Failure( 'multisite_not_supported' );
		}
		self::safe_role( $c['default_role'] );
	}

	public static function safe_role( string $name ): void {
		$role = get_role( $name );
		if ( ! in_array( $name, array( 'subscriber', 'customer' ), true ) || ! $role ) {
			throw new Failure( 'unsafe_default_role' );
		}
		foreach ( $role->capabilities as $cap => $enabled ) {
			if ( $enabled && ! in_array( $cap, array( 'read', 'level_0' ), true ) ) {
				throw new Failure( 'unsafe_default_role' );
			}
		}
	}

	public static function route( string $action ): string {
		return add_query_arg( 'action', 'al_' . $action, site_url( 'wp-login.php', 'login' ) );
	}
}
