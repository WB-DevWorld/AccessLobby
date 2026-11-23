<?php
namespace AccessLobby\WordPress;

final class Plugin {
	public static function activate( bool $network_wide = false ): void {
		if ( $network_wide || is_multisite() || ! extension_loaded( 'sodium' ) || ! extension_loaded( 'openssl' ) ) {
			wp_die( esc_html__( 'AccessLobby requires a standalone WordPress installation, PHP 8.3+, OpenSSL and Sodium. Network/multisite activation is not supported yet.', 'accesslobby-sso' ) );
		}
		global $wpdb;
		$store = new Store( $wpdb );
		$store->migrate();
		$store->audit( 'plugin_activated', get_current_user_id() );
		if ( 'enforced' === Config::get()['mode'] ) {
			// Local sessions created during an authorized rollback cannot bypass re-enabled SSO.
			\WP_Session_Tokens::destroy_all_for_all_users();
			$store->audit( 'reactivation_sessions_invalidated', get_current_user_id() );
		}
		if ( ! wp_next_scheduled( 'accesslobby_cleanup' ) ) {
			wp_schedule_event( time() + 3600, 'hourly', 'accesslobby_cleanup' );
		}
	}

	public static function deactivate(): void {
		global $wpdb;
		( new Store( $wpdb ) )->audit( 'plugin_deactivated', get_current_user_id() );
		wp_clear_scheduled_hook( 'accesslobby_cleanup' );
	}

	public static function boot(): void {
		if ( is_multisite() || ! extension_loaded( 'sodium' ) || ! extension_loaded( 'openssl' ) ) {
			add_action(
				'admin_notices',
				static function () {
					echo '<div class="notice notice-error"><p>' . esc_html__( 'AccessLobby is inactive on this unsupported environment. Review its PHP extension and standalone-site requirements.', 'accesslobby-sso' ) . '</p></div>';
				}
			);
			if ( 'enforced' === Config::get()['mode'] ) {
				// Missing runtime prerequisites must never reopen interactive local passwords.
				global $wpdb;
				$policy = new Surfaces( new Store( $wpdb ) );
				add_filter( 'authenticate', array( $policy, 'password_policy' ), PHP_INT_MAX, 3 );
				if ( ! Config::get()['machine_auth'] ) {
					add_filter( 'wp_is_application_passwords_available', '__return_false' );
				}
				add_action(
					'login_init',
					static function () {
						Security::private_headers();
						wp_die( esc_html__( 'Authentication is unavailable on this environment. Contact the host operator for recovery.', 'accesslobby-sso' ), '', array( 'response' => 503 ) );
					},
					0
				);
			}
			return;
		}
		global $wpdb;
		$store = new Store( $wpdb );
		$store->migrate();
		$oidc       = new Oidc( new Http(), new TokenValidator() );
		$sessions   = new Sessions( $store );
		$controller = new Controller( $store, $oidc, $sessions );
		add_action( 'login_init', array( $controller, 'dispatch' ), 0 );
		add_action( 'accesslobby_cleanup', array( $store, 'purge' ) );
		add_action(
			'rest_api_init',
			static function () use ( $controller ) {
				register_rest_route(
					'accesslobby/v1',
					'/backchannel-logout',
					array(
						'methods'             => 'POST',
						'callback'            => array(
							$controller,
							'backchannel',
						),
						'permission_callback' => '__return_true',
					)
				);
			}
		);
		add_filter(
			'wp_is_application_passwords_available',
			static function ( $available ) {
				$c = Config::get();
				return 'enforced' === $c['mode'] && ! $c['machine_auth'] ? false : $available;
			}
		);
		( new Surfaces( $store ) )->register();
		( new Admin( $store, $oidc ) )->register();
		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			Cli::register( $store );
		}
	}
}
