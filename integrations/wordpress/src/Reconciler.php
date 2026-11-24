<?php
namespace AccessLobby\WordPress;

/** Authenticated server-to-server receipt checks supplement, never replace, signed backchannel logout. */
final class Reconciler {
	private static bool $checking = false;
	public function __construct( private readonly Store $store, private readonly Http $http ) {}

	public function guard_current(): void {
		$user = get_current_user_id();
		if ( $user > 0 && $this->current_user( $user ) !== $user ) {
			wp_set_current_user( 0 );
		}
	}

	private function request( array $c, string $receipt, string $action ): array {
		return $this->http->json_response(
			rtrim( $c['api'], '/' ) . '/v1/peer-sessions/' . $action,
			array(
				'method'              => 'POST',
				'timeout'             => 3,
				'limit_response_size' => 4096,
				'headers'             => array(
					'Authorization'           => 'PeerSession ' . $receipt,
					'x-accesslobby-client-id' => $c['client_id'],
				),
			)
		);
	}

	public function current_user( mixed $user ): mixed {
		if ( ! is_int( $user ) || $user <= 0 || self::$checking || ( defined( 'WP_CLI' ) && WP_CLI ) ||
			wp_doing_cron() || did_action( 'application_password_did_authenticate' ) ) {
			return $user;
		}
		$token = wp_get_session_token();
		if ( '' === $token ) {
			return $user;
		}
		self::$checking = true;
		try {
			$key = Security::fingerprint( $token );
			$row = $this->store->session_for_token( $key );
			if ( ! $row ) {
				$meta = \WP_Session_Tokens::get_instance( $user )->get( $token );
				return ! empty( $meta['accesslobby_sso'] ) ? $this->retire( $user, $token ) : $user;
			}
			if ( (int) $row['user_id'] !== $user ) {
				return 0;
			}
			$data = Security::open( $row['sealed_token'] );
			$peer = $data['peer_session'] ?? null;
			// Previous connector/API versions retain their original bounded session life during rollout.
			if ( null === $peer ) {
				return $user;
			}
			$c = Config::get();
			if ( ! hash_equals( Config::fingerprint( $c ), $data['configuration'] ?? '' ) ||
				! is_string( $peer['receipt'] ?? null ) || ! preg_match( '/^[A-Za-z0-9_-]{43}$/D', $peer['receipt'] ) ) {
				return $this->retire( $user, $token );
			}
			$now = time();
			$age = $now - (int) ( $data['last_checked'] ?? 0 );
			if ( $age < 30 || $now - (int) ( $data['last_attempt'] ?? 0 ) < 15 ) {
				return time() - (int) ( $data['last_checked'] ?? 0 ) <= 90 ? $user : 0;
			}
			$data['last_attempt'] = $now;
			if ( ! $this->store->update_session_private( $key, $data ) ) {
				return 0;
			}
			try {
				$result = $this->request( $c, $peer['receipt'], 'status' );
			} catch ( \Throwable $error ) {
				// A short explicit grace never extends the cookie/token expiry; then protected access fails closed.
				return time() - (int) ( $data['last_checked'] ?? 0 ) <= 90 ? $user : 0;
			}
			if ( 401 === $result['status'] && 'invalid_peer_session' === ( $result['data']['error'] ?? '' ) ) {
				return $this->retire( $user, $token );
			}
			$body = $result['data'];
			if ( 200 !== $result['status'] || 'accesslobby.peer-session.v0.1' !== ( $body['contract'] ?? null ) ||
				! is_bool( $body['active'] ?? null ) ) {
				return time() - (int) ( $data['last_checked'] ?? 0 ) <= 90 ? $user : 0;
			}
			if ( ! $body['active'] ) {
				return $this->retire( $user, $token );
			}
			$data['last_checked'] = $now;
			return $this->store->update_session_private( $key, $data ) ? $user : 0;
		} catch ( \Throwable $error ) {
			return 0;
		} finally {
			self::$checking = false;
		}
	}

	private function retire( int $user, string $token ): int {
		\WP_Session_Tokens::get_instance( $user )->destroy( $token );
		$this->store->remove_session( Security::fingerprint( $token ) );
		wp_clear_auth_cookie();
		$this->store->audit( 'session_reconciled_ended', $user );
		return 0;
	}

	public function end_current( array $c ): bool {
		$row  = $this->store->session_for_token( Security::fingerprint( wp_get_session_token() ) );
		$data = $row ? Security::open( $row['sealed_token'] ) : array();
		$peer = $data['peer_session'] ?? null;
		if ( ! $peer ) {
			return false;
		}
		if ( ! hash_equals( Config::fingerprint( $c ), $data['configuration'] ?? '' ) ) {
			throw new Failure( 'session_configuration_changed' );
		}
		$result = $this->request( $c, $peer['receipt'], 'end' );
		if ( 200 !== $result['status'] || 'accesslobby.peer-session.v0.1' !== ( $result['data']['contract'] ?? null ) ||
			true !== ( $result['data']['ended'] ?? null ) ) {
			throw new Failure( 'shared_logout_marker_unavailable' );
		}
		$this->store->audit( 'shared_logout_recorded', get_current_user_id() );
		return true;
	}
}
