<?php
namespace AccessLobby\WordPress;

final class Cli {
	public static function register( Store $store ): void {
		\WP_CLI::add_command(
			'accesslobby status',
			static function () use ( $store ) {
				$c = Config::get();
				\WP_CLI::line(
					wp_json_encode(
						array(
							'version'              => ACCESSLOBBY_WP_VERSION,
							'mode'                 => $c['mode'],
							'site'                 => site_url(),
							'callback'             => Config::route( 'callback' ),
							'logout'               => Config::route( 'signed_out' ),
							'backchannel'          => rest_url( 'accesslobby/v1/backchannel-logout' ),
							'migration'            => $store->readiness_counts(),
							'emergency_configured' => Emergency::configured(),
						),
						JSON_PRETTY_PRINT
					)
				);
			}
		);
		\WP_CLI::add_command(
			'accesslobby emergency-ticket',
			static function ( $args, $assoc ) use ( $store ) {
				try {
					$ticket = Emergency::issue( $store, (int) ( $assoc['user'] ?? 0 ), $assoc['ip'] ?? '', $assoc['reason'] ?? '' );
					// Intentional secret output to the authenticated host operator only. Never audit its value.
					\WP_CLI::line( $ticket );
				} catch ( Failure $e ) {
					\WP_CLI::error( $e->getMessage() );
				}
			}
		);
	}
}
