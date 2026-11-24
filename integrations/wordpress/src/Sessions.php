<?php
namespace AccessLobby\WordPress;

final class Sessions {
	public function __construct( private readonly Store $store ) {}

	public static function sid_key( array $c, string $sid ): string {
		return hash( 'sha256', $c['issuer'] . "\0" . $c['client_id'] . "\0" . $sid );
	}

	public function establish( int $user, array $identity, array $c ): void {
		$sid_key = self::sid_key( $c, $identity['sid'] );
		$this->store->lock(
			'sid:' . $sid_key,
			function () use ( $user, $identity, $sid_key ) {
				if ( $this->store->has_state( 'revoked:' . $sid_key, 'revoked_sid' ) || $identity['expires'] <= time() ) {
					throw new Failure( 'ended_issuer_session' );
				}
				$manager = \WP_Session_Tokens::get_instance( $user );
				$token   = $manager->create( $identity['expires'] );
				try {
					$this->store->save_session(
						array(
							'token_key'    => Security::fingerprint( $token ),
							'sid_key'      => $sid_key,
							'subject_key'  => hash( 'sha256', $identity['issuer'] . "\0" . $identity['subject'] ),
							'user_id'      => $user,
							'sealed_token' => Security::seal( array( 'token' => $token ) ),
							'expires'      => $identity['expires'],
						)
					);
					wp_set_current_user( $user );
					$expiration_filter = static fn() => max( 1, $identity['expires'] - time() );
					add_filter( 'auth_cookie_expiration', $expiration_filter );
					try {
						wp_set_auth_cookie( $user, false, is_ssl(), $token );
					} finally {
						remove_filter( 'auth_cookie_expiration', $expiration_filter );
					}
					do_action( 'wp_login', get_userdata( $user )->user_login, get_userdata( $user ) );
					$this->store->audit( 'session_started', $user );
				} catch ( \Throwable $e ) {
					$manager->destroy( $token );
					$this->store->remove_session( Security::fingerprint( $token ) );
					throw $e;
				}
			}
		);
	}

	public function backchannel( array $claims, array $c ): void {
		$sid_key = self::sid_key( $c, $claims['sid'] );
		$this->store->lock(
			'sid:' . $sid_key,
			function () use ( $claims, $c, $sid_key ) {
				$jti = 'logout:' . hash( 'sha256', $c['issuer'] . "\0" . $c['client_id'] . "\0" . $claims['jti'] );
				if ( $this->store->has_state( $jti, 'logout_jti' ) ) {
					throw new Failure( 'logout_replay' );
				}
				$this->store->state_put( $jti, 'logout_jti', array(), 600 );
				if ( ! $this->store->has_state( 'revoked:' . $sid_key, 'revoked_sid' ) ) {
					$this->store->state_put( 'revoked:' . $sid_key, 'revoked_sid', array(), 3900 );
				}
				foreach ( $this->store->sessions( $sid_key ) as $row ) {
					if ( isset( $claims['sub'] ) && ! hash_equals( $row['subject_key'], hash( 'sha256', $c['issuer'] . "\0" . $claims['sub'] ) ) ) {
						continue;
					}
					$token = Security::open( $row['sealed_token'] )['token'];
					\WP_Session_Tokens::get_instance( (int) $row['user_id'] )->destroy( $token );
					$this->store->remove_session( $row['token_key'] );
				}
				$this->store->audit( 'backchannel_accepted' );
			}
		);
	}

	public function local_logout(): void {
		$uid   = get_current_user_id();
		$token = wp_get_session_token();
		wp_logout();
		$this->store->remove_session( Security::fingerprint( $token ) );
		$this->store->audit( 'logout_this_site', $uid );
	}

	public function invalidate_user_links( int $user ): void {
		global $wpdb;
		$table = $this->store->table( 'sessions' );
		$rows  = $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM %i WHERE user_id=%d', $table, $user ), ARRAY_A );
		foreach ( $rows as $row ) {
			$token = Security::open( $row['sealed_token'] )['token'];
			\WP_Session_Tokens::get_instance( $user )->destroy( $token );
			$this->store->remove_session( $row['token_key'] );
		}
	}
}
