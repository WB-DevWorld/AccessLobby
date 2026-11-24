<?php
namespace AccessLobby\WordPress;

final class Admin {
	public function __construct( private readonly Store $store, private readonly Oidc $oidc ) {}

	public function register(): void {
		add_action( 'admin_menu', fn() => add_options_page( 'AccessLobby', 'AccessLobby', 'manage_options', 'accesslobby-sso', array( $this, 'page' ) ) );
		add_action( 'admin_init', fn() => register_setting( 'accesslobby_sso', 'accesslobby_sso', array( 'sanitize_callback' => array( $this, 'sanitize' ) ) ) );
		add_action( 'admin_post_alwp_test', array( $this, 'test' ) );
		add_action( 'update_option_accesslobby_sso', array( $this, 'after_save' ), 10, 2 );
	}

	public function sanitize( mixed $input ): array {
		$old = Config::get();
		if ( ! current_user_can( 'manage_options' ) || ! is_array( $input ) ) {
			return $old;
		}
		$c = $old;
		foreach ( array( 'issuer', 'api', 'client_id', 'mode', 'default_role', 'migration_reference', 'recovery_reference' ) as $key ) {
			$c[ $key ] = isset( $input[ $key ] ) && is_string( $input[ $key ] ) ? sanitize_text_field( $input[ $key ] ) : '';
		}
		foreach ( array( 'jit', 'machine_auth', 'ack_unlinked', 'ack_privileged', 'ack_invalidate' ) as $key ) {
			$c[ $key ] = ! empty( $input[ $key ] );
		}
		try {
			$pages = $input['login_pages'] ?? array();
			if ( ! is_array( $pages ) || count( $pages ) > 51 ) {
				throw new Failure( 'invalid_login_pages' );
			}
			$c['login_pages'] = array();
			foreach ( $pages as $id ) {
				if ( '' === $id ) {
					continue;
				}
				if ( ( ! is_string( $id ) && ! is_int( $id ) ) || ! ctype_digit( (string) $id ) ||
					'page' !== get_post_type( (int) $id ) || 'publish' !== get_post_status( (int) $id ) ) {
					throw new Failure( 'invalid_login_pages' );
				}
				$c['login_pages'][] = (int) $id;
			}
			$c['login_pages'] = array_values( array_unique( $c['login_pages'] ) );
			Config::validate( $c );
			if ( Config::fingerprint( $c ) !== Config::fingerprint( $old ) ) {
				global $wpdb;
				if ( $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $this->store->table( 'links' ) ) ) ) {
					throw new Failure( 'linked_configuration_requires_host_migration' );
				}
			}
			if ( 'enforced' === $c['mode'] && 'enforced' !== $old['mode'] ) {
				$health = get_option( 'accesslobby_connection_test', array() );
				$link   = $this->store->link_for_user( get_current_user_id() );
				$counts = $this->store->readiness_counts();
				if ( ! $link || 'active' !== $link['link_state'] || ! Emergency::configured() ||
					( $health['fingerprint'] ?? '' ) !== Config::fingerprint( $c ) || ( $health['time'] ?? 0 ) < time() - 600 ||
					strlen( $c['migration_reference'] ) < 8 || strlen( $c['recovery_reference'] ) < 8 || ! $c['ack_invalidate'] ||
					( $counts['unlinked'] && ! $c['ack_unlinked'] ) || ( $counts['unlinked_privileged'] && ! $c['ack_privileged'] ) ) {
					throw new Failure( 'migration_readiness_gate_not_met' );
				}
			}
			return $c;
		} catch ( Failure $e ) {
			add_settings_error( 'accesslobby_sso', 'invalid', __( 'Settings were not changed: ', 'accesslobby-sso' ) . $e->getMessage() );
			return $old;
		}
	}

	public function after_save( array $old, array $updated ): void {
		$this->store->audit( 'configuration_changed', get_current_user_id() );
		if ( 'enforced' === $updated['mode'] && 'enforced' !== ( $old['mode'] ?? 'hybrid' ) ) {
			foreach ( get_users( array( 'fields' => 'ID' ) ) as $id ) {
				\WP_Session_Tokens::get_instance( (int) $id )->destroy_all();
			}
			$this->store->audit( 'migration_sessions_invalidated', get_current_user_id() );
		}
	}

	public function test(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Forbidden', 'accesslobby-sso' ), '', array( 'response' => 403 ) );
		}
		check_admin_referer( 'alwp_test' );
		Security::private_headers();
		$result = 'failed';
		try {
			Security::post();
			$c = Config::get();
			$this->oidc->discovery( $c );
			$health = ( new Http() )->json( rtrim( $c['api'], '/' ) . '/health/ready' );
			if ( 'ready' !== ( $health['status'] ?? null ) ) {
				throw new Failure( 'upstream_not_ready' );
			}
			$peer_sessions = false;
			try {
				$capabilities  = ( new Http() )->json( rtrim( $c['api'], '/' ) . '/v1/consumer-capabilities' );
				$peer_sessions = 'accesslobby.peer-session.v0.1' === ( $capabilities['peerSessions'] ?? '' );
			} catch ( \Throwable $error ) {
				// Older APIs continue the documented bounded-session/backchannel contract.
			}
			update_option(
				'accesslobby_connection_test',
				array(
					'fingerprint'   => Config::fingerprint( $c ),
					'time'          => time(),
					'peer_sessions' => $peer_sessions,
				),
				false
			);
			$result = 'metadata_validated';
		} catch ( \Throwable $e ) {
			delete_option( 'accesslobby_connection_test' );
		}
		$this->store->audit( 'connection_test_' . $result, get_current_user_id() );
		wp_safe_redirect( add_query_arg( 'connection', $result, admin_url( 'options-general.php?page=accesslobby-sso' ) ), 303 );
		exit;
	}

	public function page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		Security::private_headers();
		$c      = Config::get();
		$counts = $this->store->readiness_counts();
		echo '<div class="wrap"><h1>' . esc_html__( 'AccessLobby', 'accesslobby-sso' ) . '</h1>';
		settings_errors( 'accesslobby_sso' );
		echo '<p>' . esc_html__( 'First-party pilot connector. External publishers require a separate AccessLobby privacy and onboarding approval.', 'accesslobby-sso' ) . '</p><table class="widefat striped"><tbody>';
		$health = get_option( 'accesslobby_connection_test', array() );
		$state  = ( $health['fingerprint'] ?? '' ) === Config::fingerprint( $c ) ? __( 'Metadata checked; complete a real login to qualify the connection.', 'accesslobby-sso' ) : __( 'Not tested', 'accesslobby-sso' );
		$rows   = array(
			'Connection'                => $state,
			'Version / environment'     => ACCESSLOBBY_WP_VERSION . ' / ' . wp_get_environment_type(),
			'WordPress site'            => site_url(),
			'Callback URL'              => Config::route( 'callback' ),
			'Logout return URL'         => Config::route( 'signed_out' ),
			'Backchannel logout URL'    => rest_url( 'accesslobby/v1/backchannel-logout' ),
			'Admission'                 => 'Required: /v1/application-entry; roles and resource access stay local',
			'Session reconciliation'    => ! empty( $health['peer_sessions'] ) ? 'Available for fresh SSO sessions; 30-second checks, bounded outage grace' : 'API capability not confirmed; legacy sessions keep their original bounded expiry',
			'Account links'             => $counts['linked'] . ' / ' . $counts['total'],
			'Unlinked privileged users' => $counts['unlinked_privileged'],
			'Emergency recovery'        => Emergency::configured() ? 'Host-configured; rehearsal reference required' : 'Not configured',
		);
		foreach ( $rows as $label => $value ) {
			echo '<tr><th>' . esc_html( $label ) . '</th><td><code>' . esc_html( (string) $value ) . '</code></td></tr>';
		}
		echo '</tbody></table><form method="post" action="options.php">';
		settings_fields( 'accesslobby_sso' );
		echo '<table class="form-table">';
		foreach ( array(
			'issuer'              => 'AccessLobby issuer',
			'api'                 => 'AccessLobby API base URL',
			'client_id'           => 'Client / application ID',
			'migration_reference' => 'Backup and rollback evidence reference',
			'recovery_reference'  => 'Emergency recovery rehearsal reference',
		) as $key => $label ) {
			echo '<tr><th><label for="alwp_' . esc_attr( $key ) . '">' . esc_html( $label ) . '</label></th><td><input class="regular-text" id="alwp_' . esc_attr( $key ) . '" name="accesslobby_sso[' . esc_attr( $key ) . ']" value="' . esc_attr( $c[ $key ] ?? '' ) . '"></td></tr>';
		}
		echo '<tr><th>' . esc_html__( 'Authentication mode', 'accesslobby-sso' ) . '</th><td><select name="accesslobby_sso[mode]">';
		foreach ( array(
			'hybrid'   => 'WordPress + AccessLobby',
			'enforced' => 'AccessLobby only',
		) as $value => $label ) {
			echo '<option value="' . esc_attr( $value ) . '" ' . selected( $c['mode'], $value, false ) . '>' . esc_html( $label ) . '</option>';
		}
		echo '</select></td></tr><tr><th><label for="alwp_login_pages">' . esc_html__( 'Frontend login pages', 'accesslobby-sso' ) . '</label></th><td>';
		echo '<input type="hidden" name="accesslobby_sso[login_pages][]" value=""><select multiple size="5" id="alwp_login_pages" name="accesslobby_sso[login_pages][]" aria-describedby="alwp_login_pages_help">';
		foreach ( get_pages( array( 'post_status' => 'publish' ) ) as $page ) {
			echo '<option value="' . esc_attr( (string) $page->ID ) . '" ' . selected( in_array( $page->ID, $c['login_pages'], true ), true, false ) . '>' . esc_html( $page->post_title ) . '</option>';
		}
		echo '</select><p id="alwp_login_pages_help">' . esc_html__( 'Select dedicated login pages. In AccessLobby only mode, opening one starts SSO automatically, including without JavaScript. Other pages with a login button remain public.', 'accesslobby-sso' ) . '</p></td></tr><tr><th>' . esc_html__( 'JIT local role', 'accesslobby-sso' ) . '</th><td><select name="accesslobby_sso[default_role]">';
		foreach ( array( 'subscriber', 'customer' ) as $role ) {
			if ( get_role( $role ) ) {
				echo '<option value="' . esc_attr( $role ) . '" ' . selected( $c['default_role'], $role, false ) . '>' . esc_html( $role ) . '</option>';
			}
		}
		echo '</select></td></tr>';
		foreach ( array(
			'jit'            => 'Allow validated new identities to create local accounts',
			'machine_auth'   => 'Preserve machine authentication (REST, XML-RPC, Application Passwords, CLI, cron)',
			'ack_unlinked'   => 'I have a migration plan for all remaining unlinked accounts',
			'ack_privileged' => 'I explicitly accept the listed unlinked privileged accounts cannot sign in locally in enforced mode',
			'ack_invalidate' => 'When enabling enforced mode, end existing local sessions and require AccessLobby sign-in',
		) as $key => $label ) {
			echo '<tr><th></th><td><label><input type="checkbox" name="accesslobby_sso[' . esc_attr( $key ) . ']" value="1" ' . checked( ! empty( $c[ $key ] ), true, false ) . '> ' . esc_html( $label ) . '</label></td></tr>';
		}
		echo '</table>';
		submit_button();
		echo '</form><form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '"><input type="hidden" name="action" value="alwp_test">';
		wp_nonce_field( 'alwp_test' );
		submit_button( __( 'Test connection metadata', 'accesslobby-sso' ), 'secondary' );
		echo '</form><p>' . esc_html__( 'No client secret is stored or displayed here. Registration and app admission must be approved in AccessLobby. Guest checkout and local roles are controlled by this site.', 'accesslobby-sso' ) . '</p></div>';
	}
}
