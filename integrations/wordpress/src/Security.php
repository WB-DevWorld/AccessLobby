<?php
namespace AccessLobby\WordPress;

final class Security {
	public static function random(): string {
		return rtrim( strtr( base64_encode( random_bytes( 32 ) ), '+/', '-_' ), '=' );
	}

	public static function origin( string $url ): string {
		$p = parse_url( $url );
		if ( ! is_array( $p ) || empty( $p['scheme'] ) || empty( $p['host'] ) || isset( $p['user'] ) || isset( $p['pass'] ) ) {
			throw new Failure( 'invalid_url' );
		}
		return strtolower( $p['scheme'] . '://' . $p['host'] ) . ( isset( $p['port'] ) ? ':' . $p['port'] : '' );
	}

	public static function endpoint( string $url ): string {
		$p = parse_url( $url );
		self::origin( $url );
		$local = defined( 'ACCESSLOBBY_ALLOW_LOCAL_HTTP' ) && ACCESSLOBBY_ALLOW_LOCAL_HTTP &&
			'local' === wp_get_environment_type() && in_array( $p['host'], array( 'localhost', '127.0.0.1', '[::1]' ), true );
		if ( ( 'https' !== $p['scheme'] && ! ( $local && 'http' === $p['scheme'] ) ) || isset( $p['fragment'] ) || isset( $p['query'] ) ) {
			throw new Failure( 'https_required' );
		}
		return $url;
	}

	/** No allowed_redirect_hosts hook can widen this trust boundary. */
	public static function destination( string $candidate, string $home, string $site ): string {
		foreach ( array( $home, $site ) as $base ) {
			try {
				if ( self::origin( $candidate ) !== self::origin( $base ) ) {
					continue;
				}
				$p         = parse_url( $candidate );
				$path      = rawurldecode( $p['path'] ?? '/' );
				$base_path = parse_url( $base, PHP_URL_PATH );
				$prefix    = rtrim( is_string( $base_path ) ? $base_path : '', '/' ) . '/';
				if ( ! str_starts_with( $path . '/', $prefix ) || preg_match( '~[\\\\\x00-\x20]|(?:^|/)\.\.(?:/|$)|%[0-9a-f]{2}~i', $path ) ||
					str_contains( $path, 'wp-login.php' ) || str_contains( $path, 'admin-post.php' ) || str_contains( $path, '/accesslobby/' ) ) {
					continue;
				}
				return $candidate;
			} catch ( Failure $e ) {
				continue;
			}
		}
		return $home;
	}

	public static function seal( array $data ): string {
		$nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$key   = hash( 'sha256', wp_salt( 'auth' ) . '|accesslobby-wp-v1', true );
		return base64_encode( $nonce . sodium_crypto_secretbox( wp_json_encode( $data ), $nonce, $key ) );
	}

	public static function open( string $sealed ): array {
		$raw = base64_decode( $sealed, true );
		if ( false === $raw || strlen( $raw ) < 40 ) {
			throw new Failure( 'invalid_private_state' );
		}
		$key   = hash( 'sha256', wp_salt( 'auth' ) . '|accesslobby-wp-v1', true );
		$clear = sodium_crypto_secretbox_open( substr( $raw, 24 ), substr( $raw, 0, 24 ), $key );
		if ( false === $clear ) {
			throw new Failure( 'invalid_private_state' );
		}
		$data = json_decode( $clear, true, 16, JSON_THROW_ON_ERROR );
		if ( ! is_array( $data ) ) {
			throw new Failure( 'invalid_private_state' );
		}
		return $data;
	}

	public static function private_headers(): void {
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
		nocache_headers();
		header( 'Cache-Control: private, no-store, max-age=0' );
		header( 'Referrer-Policy: no-referrer' );
		header( 'X-Robots-Tag: noindex, nofollow' );
	}

	public static function fingerprint( string $token ): string {
		return hash_hmac( 'sha256', $token, wp_salt( 'nonce' ) );
	}

	public static function post(): void {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			throw new Failure( 'post_required' );
		}
	}
}
