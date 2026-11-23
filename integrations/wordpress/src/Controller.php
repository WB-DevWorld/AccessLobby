<?php
namespace AccessLobby\WordPress;

final class Controller {
	public function __construct( private readonly Store $store, private readonly Oidc $oidc, private readonly Sessions $sessions ) {}

	public function dispatch(): void {
		$action = isset( $_REQUEST['action'] ) && is_string( $_REQUEST['action'] ) ? sanitize_key( wp_unslash( $_REQUEST['action'] ) ) : 'login';
		if ( str_starts_with( $action, 'al_' ) ) {
			Security::private_headers();
			try {
				switch ( $action ) {
					case 'al_start':
						$this->start();
						break;
					case 'al_callback':
						$this->callback();
						break;
					case 'al_logout':
						$this->logout();
						break;
					case 'al_signed_out':
						$this->signed_out();
						break;
					case 'al_emergency':
						Emergency::redeem( $this->store );
						break;
					default:
						throw new Failure( 'unknown_action' );
				}
			} catch ( \Throwable $e ) {
				$this->fail( $e );
			}
			exit;
		}
		$c = Config::get();
		if ( 'enforced' === $c['mode'] &&
			in_array( $action, array( 'login', 'register', 'lostpassword', 'retrievepassword', 'resetpass', 'rp' ), true ) ) {
			Security::private_headers();
			try {
				$this->start( 'register' === $action ? 'join' : 'login' );
			} catch ( \Throwable $e ) {
				$this->fail( $e ); }
			exit;
		}
		if ( 'logout' === $action ) {
			Security::private_headers();
			$this->logout();
			exit;
		}
	}

	private function input( string $key ): string {
		return isset( $_REQUEST[ $key ] ) && is_string( $_REQUEST[ $key ] ) ? wp_unslash( $_REQUEST[ $key ] ) : '';
	}

	private function destination(): string {
		return Security::destination( $this->input( 'redirect_to' ), home_url( '/' ), site_url( '/' ) );
	}

	private function cookie_name( string $state ): string {
		return 'alwp_' . substr( hash( 'sha256', site_url() . $state ), 0, 24 );
	}

	private function cookie( string $state, string $value, int $expires ): void {
		setcookie(
			$this->cookie_name( $state ),
			$value,
			array(
				'expires'  => $expires,
				'path'     => rtrim( (string) parse_url( site_url(), PHP_URL_PATH ), '/' ) . '/',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
	}

	public function start( ?string $forced_intent = null ): void {
		$c      = Config::get();
		$intent = $forced_intent ?? $this->input( 'intent' );
		$intent = in_array( $intent, array( 'join', 'link', 'unlink' ), true ) ? $intent : 'login';
		$local  = 0;
		if ( in_array( $intent, array( 'link', 'unlink' ), true ) ) {
			Security::post();
			if ( ! is_user_logged_in() || ! wp_verify_nonce( $this->input( '_wpnonce' ), 'alwp_' . $intent ) ) {
				throw new Failure( 'invalid_local_proof' );
			}
			if ( 'unlink' === $intent && 'enforced' === $c['mode'] ) {
				throw new Failure( 'host_recovery_required' );
			}
			$local = get_current_user_id();
		} elseif ( is_user_logged_in() ) {
			wp_safe_redirect( $this->destination(), 303 );
			exit;
		}
		$state = Security::random();
		$bind  = Security::random();
		$flow  = array(
			'state'         => $state,
			'nonce'         => Security::random(),
			'verifier'      => Security::random(),
			'intent'        => $intent,
			'destination'   => $this->destination(),
			'started'       => time(),
			'local_user'    => $local,
			'local_session' => $local ? Security::fingerprint( wp_get_session_token() ) : '',
			'binding'       => hash( 'sha256', $bind ),
			'configuration' => Config::fingerprint( $c ),
		);
		$url   = $this->oidc->authorize( $c, $flow );
		$this->store->state_put( $state, 'auth_flow', $flow, 300 );
		$this->cookie( $state, $bind, time() + 300 );
		$this->store->audit( 'auth_started', $local );
		// The destination is a validated discovery endpoint on the pinned issuer origin.
		wp_redirect( $url, 303, 'AccessLobby' );
		exit;
	}

	private function callback(): void {
		if ( 'GET' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			throw new Failure( 'invalid_authorization_response' );
		}
		$state = $this->input( 'state' );
		if ( ! preg_match( '/^[A-Za-z0-9_-]{43}$/D', $state ) ) {
			throw new Failure( 'invalid_state' );
		}
		$flow   = $this->store->state_get( $state, 'auth_flow' );
		$cookie = $_COOKIE[ $this->cookie_name( $state ) ] ?? '';
		if ( ! is_string( $cookie ) || ! hash_equals( $flow['binding'], hash( 'sha256', $cookie ) ) ) {
			throw new Failure( 'invalid_browser_binding' );
		}
		$this->store->state_get( $state, 'auth_flow', true );
		$this->cookie( $state, '', time() - 3600 );
		$c = Config::get();
		if ( ! hash_equals( $flow['configuration'], Config::fingerprint( $c ) ) || $this->input( 'error' ) ||
			( $this->input( 'iss' ) && $this->input( 'iss' ) !== $c['issuer'] ) ) {
			throw new Failure( 'invalid_authorization_response' );
		}
		if ( $flow['local_user'] ) {
			if ( get_current_user_id() !== $flow['local_user'] ||
				! hash_equals( $flow['local_session'], Security::fingerprint( wp_get_session_token() ) ) ||
				! \WP_Session_Tokens::get_instance( $flow['local_user'] )->verify( wp_get_session_token() ) ) {
				throw new Failure( 'invalid_local_proof' );
			}
		} elseif ( is_user_logged_in() ) {
			throw new Failure( 'local_session_changed' );
		}
		$identity = $this->oidc->callback( $c, $flow, $this->input( 'code' ) );
		if ( 'unlink' === $flow['intent'] ) {
			$this->store->unlink( $flow['local_user'], $identity );
			$this->sessions->invalidate_user_links( $flow['local_user'] );
		} else {
			$user = $this->store->resolve( $identity, $c, $flow['local_user'] );
			if ( ! $flow['local_user'] ) {
				$this->sessions->establish( $user, $identity, $c );
			}
			do_action( 'accesslobby_authenticated', $user, array( 'provenance' => $flow['intent'] ) );
		}
		$this->store->audit( 'callback_succeeded', get_current_user_id() );
		wp_safe_redirect( Security::destination( $flow['destination'], home_url( '/' ), site_url( '/' ) ), 303 );
		exit;
	}

	public function backchannel( \WP_REST_Request $request ): \WP_REST_Response {
		Security::private_headers();
		try {
			$token = $request->get_body_params()['logout_token'] ?? '';
			if ( ! is_string( $token ) || '' === $token || strlen( $request->get_body() ) > 40000 ) {
				throw new Failure( 'invalid_logout_token' );
			}
			$c = Config::get();
			$this->sessions->backchannel( $this->oidc->logout_token( $token, $c ), $c );
			return new \WP_REST_Response( null, 200, array( 'Cache-Control' => 'no-store' ) );
		} catch ( \Throwable $e ) {
			$this->store->audit( 'backchannel_rejected' );
			return new \WP_REST_Response( array( 'error' => 'invalid_logout' ), 400, array( 'Cache-Control' => 'no-store' ) );
		}
	}

	private function logout(): void {
		if ( ! is_user_logged_in() ) {
			$this->signed_out();
			return;
		}
		if ( 'POST' === ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			if ( ! wp_verify_nonce( $this->input( '_wpnonce' ), 'alwp_logout' ) || ! in_array( $this->input( 'scope' ), array( 'site', 'all' ), true ) ) {
				throw new Failure( 'invalid_logout_request' );
			}
			$c     = Config::get();
			$scope = $this->input( 'scope' );
			$url   = Config::route( 'signed_out' );
			if ( 'all' === $scope ) {
				// Resolve discovery before clearing local state, so outage is explained honestly.
				$d     = $this->oidc->discovery( $c );
				$state = Security::random();
				$bind  = Security::random();
				$this->store->state_put( $state, 'logout_flow', array( 'binding' => hash( 'sha256', $bind ) ), 300 );
				$this->cookie( $state, $bind, time() + 300 );
				$url = $d['end_session_endpoint'] . '?' . http_build_query(
					array(
						'client_id'                => $c['client_id'],
						'post_logout_redirect_uri' => Config::route( 'signed_out' ),
						'state'                    => $state,
					),
					'',
					'&',
					PHP_QUERY_RFC3986
				);
				$this->store->audit( 'logout_all_requested', get_current_user_id() );
			}
			$this->sessions->local_logout();
			wp_redirect( $url, 303, 'AccessLobby' );
			exit;
		}
		login_header( __( 'Sign out', 'accesslobby-sso' ) );
		echo '<form method="post" action="' . esc_url( Config::route( 'logout' ) ) . '">';
		wp_nonce_field( 'alwp_logout' );
		echo '<p><button class="button button-primary" name="scope" value="site">' . esc_html__( 'Sign out of this site', 'accesslobby-sso' ) . '</button></p>';
		echo '<p>' . esc_html__( 'Other apps and AccessLobby stay signed in. Returning here can sign you in again without another credential prompt.', 'accesslobby-sso' ) . '</p>';
		echo '<p><button class="button" name="scope" value="all">' . esc_html__( 'Sign out of all connected apps', 'accesslobby-sso' ) . '</button></p>';
		echo '<p>' . esc_html__( 'Ends the shared browser session and notifies participating apps. This does not sign out every device. Unavailable apps may remain signed in until their sessions expire.', 'accesslobby-sso' ) . '</p></form>';
		login_footer();
	}

	private function signed_out(): void {
		if ( $this->input( 'state' ) ) {
			$state = $this->input( 'state' );
			$flow  = $this->store->state_get( $state, 'logout_flow' );
			$bind  = $_COOKIE[ $this->cookie_name( $state ) ] ?? '';
			if ( ! is_string( $bind ) || ! hash_equals( $flow['binding'], hash( 'sha256', $bind ) ) ) {
				throw new Failure( 'invalid_logout_state' );
			}
			$this->store->state_get( $state, 'logout_flow', true );
			$this->cookie( $state, '', time() - 3600 );
		}
		login_header( __( 'Signed out', 'accesslobby-sso' ) );
		echo '<p>' . esc_html__( 'You are signed out of this site.', 'accesslobby-sso' ) . '</p><p><a href="' . esc_url( Config::route( 'start' ) ) . '">' . esc_html__( 'Continue with AccessLobby', 'accesslobby-sso' ) . '</a></p>';
		login_footer();
	}

	private function fail( \Throwable $error ): void {
		$code = $error instanceof Failure ? $error->getMessage() : 'authentication_failed';
		$this->store->audit( $code, get_current_user_id() );
		$message = 'account_link_required' === $code ?
			__( 'This identity needs an explicit account link. Sign in with your existing site account in hybrid mode, then choose Connect AccessLobby, or contact the site administrator.', 'accesslobby-sso' ) :
			__( 'AccessLobby could not complete this request. No new sign-in was established. Try again or contact the site administrator.', 'accesslobby-sso' );
		wp_die( esc_html( $message ) . '<p>' . esc_html( $code ) . '</p>', esc_html__( 'AccessLobby', 'accesslobby-sso' ), array( 'response' => 400 ) );
	}
}
