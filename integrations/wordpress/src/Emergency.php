<?php
namespace AccessLobby\WordPress;

/** Out-of-band administrator recovery. Never a local-password fallback. */
final class Emergency {
	private static function ips(): array {
		$ips = defined( 'ACCESSLOBBY_EMERGENCY_IPS' ) ? constant( 'ACCESSLOBBY_EMERGENCY_IPS' ) : array();
		if ( ! is_array( $ips ) ) {
			return array();
		}
		return array_values( array_filter( $ips, static fn( $ip ) => is_string( $ip ) && false !== filter_var( $ip, FILTER_VALIDATE_IP ) ) );
	}

	public static function configured(): bool {
		return defined( 'ACCESSLOBBY_EMERGENCY_ENABLED' ) && true === ACCESSLOBBY_EMERGENCY_ENABLED &&
			count( self::ips() ) > 0;
	}

	public static function issue( Store $store, int $user, string $ip, string $reason ): string {
		if ( ! self::configured() || ! filter_var( $ip, FILTER_VALIDATE_IP ) || ! in_array( $ip, self::ips(), true ) ||
			! user_can( $user, 'manage_options' ) || strlen( trim( $reason ) ) < 8 ) {
			throw new Failure( 'emergency_not_configured' );
		}
		$ticket = Security::random();
		$store->state_put(
			'emergency:' . $ticket,
			'emergency',
			array(
				'user' => $user,
				'ip'   => $ip,
			),
			300
		);
		$store->audit( 'emergency_ticket_issued', $user, $reason );
		return $ticket;
	}

	public static function redeem( Store $store ): void {
		$ip = $_SERVER['REMOTE_ADDR'] ?? '';
		if ( ! self::configured() || ! in_array( $ip, self::ips(), true ) || ! is_ssl() ) {
			status_header( 404 );
			exit;
		}
		if ( 'POST' === ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			$ticket = isset( $_POST['ticket'] ) && is_string( $_POST['ticket'] ) ? wp_unslash( $_POST['ticket'] ) : '';
			if ( ! preg_match( '/^[A-Za-z0-9_-]{43}$/D', $ticket ) ) {
				throw new Failure( 'invalid_emergency_ticket' );
			}
			$data = $store->state_get( 'emergency:' . $ticket, 'emergency' );
			if ( ! hash_equals( $data['ip'], $ip ) || ! user_can( $data['user'], 'manage_options' ) ) {
				throw new Failure( 'invalid_emergency_ticket' );
			}
			$store->state_get( 'emergency:' . $ticket, 'emergency', true );
			wp_clear_auth_cookie();
			$expiration = static fn() => 900;
			add_filter( 'auth_cookie_expiration', $expiration );
			wp_set_auth_cookie( $data['user'], false, true );
			remove_filter( 'auth_cookie_expiration', $expiration );
			$store->audit( 'emergency_session_started', $data['user'] );
			wp_safe_redirect( admin_url(), 303 );
			exit;
		}
		login_header( __( 'Administrator recovery', 'accesslobby-sso' ) );
		echo '<form method="post" autocomplete="off"><p><label>' . esc_html__( 'One-use host-issued ticket', 'accesslobby-sso' ) . '<input name="ticket" type="password" required autocomplete="off"></label></p><button class="button button-primary">' . esc_html__( 'Recover administrator access', 'accesslobby-sso' ) . '</button></form>';
		login_footer();
	}
}
