<?php
namespace AccessLobby\WordPress;

use AccessLobby\WordPress\Vendor\JWT\JWK;
use AccessLobby\WordPress\Vendor\JWT\JWT;

final class TokenValidator {
	public function verify( string $token, array $jwks, string $issuer, string $audience ): array {
		if ( strlen( $token ) > 32768 ) {
			throw new Failure( 'invalid_token' );
		}
		try {
			// Filter before passing keys to the library: no algorithm or token-supplied key negotiation.
			$jwks['keys'] = array_values(
				array_filter(
					$jwks['keys'] ?? array(),
					static fn( $k ) =>
					is_array( $k ) && 'RSA' === ( $k['kty'] ?? '' ) && 'RS256' === ( $k['alg'] ?? 'RS256' ) &&
					'sig' === ( $k['use'] ?? 'sig' ) && ! empty( $k['kid'] ) && empty( $k['d'] )
				)
			);
			$keys         = JWK::parseKeySet( $jwks, 'RS256' );
			$old          = JWT::$leeway;
			try {
				JWT::$leeway = 5;
				$claims      = (array) JWT::decode( $token, $keys );
			} finally {
				JWT::$leeway = $old;
			}
		} catch ( \Throwable $e ) {
			throw new Failure( 'invalid_token' );
		}
		$aud = $claims['aud'] ?? null;
		if ( ( $claims['iss'] ?? null ) !== $issuer || ! in_array( $audience, is_array( $aud ) ? $aud : array( $aud ), true ) ||
			! is_int( $claims['iat'] ?? null ) || $claims['iat'] > time() + 5 ||
			( isset( $claims['exp'] ) && ( ! is_int( $claims['exp'] ) || $claims['exp'] <= time() - 5 ) ) ) {
			throw new Failure( 'invalid_token_claims' );
		}
		return $claims;
	}

	public function authentication( array $id, array $access, string $client, string $nonce ): void {
		if ( ! is_int( $id['exp'] ?? null ) || ! is_int( $access['exp'] ?? null ) ||
			! is_string( $id['sub'] ?? null ) || '' === $id['sub'] || strlen( $id['sub'] ) > 512 ||
			( $access['sub'] ?? null ) !== $id['sub'] || ( $access['azp'] ?? null ) !== $client ||
			( isset( $id['azp'] ) && $id['azp'] !== $client ) ||
			( is_array( $id['aud'] ) && count( $id['aud'] ) > 1 && ( $id['azp'] ?? null ) !== $client ) ||
			! is_string( $id['nonce'] ?? null ) || ! hash_equals( $nonce, $id['nonce'] ) ||
			! is_string( $id['sid'] ?? null ) || '' === $id['sid'] || strlen( $id['sid'] ) > 512 ||
			( $access['sid'] ?? null ) !== $id['sid'] ) {
			throw new Failure( 'invalid_authentication_claims' );
		}
	}

	public function logout( array $c ): void {
		$events = isset( $c['events'] ) ? (array) $c['events'] : array();
		$event  = 'http://schemas.openid.net/event/backchannel-logout';
		if ( count( $events ) !== 1 || ! isset( $events[ $event ] ) || ! is_object( $events[ $event ] ) ||
			count( (array) $events[ $event ] ) !== 0 || array_key_exists( 'nonce', $c ) ||
			! is_int( $c['iat'] ?? null ) || $c['iat'] < time() - 300 || $c['iat'] > time() + 5 ||
			! is_string( $c['sid'] ?? null ) || '' === $c['sid'] || strlen( $c['sid'] ) > 512 ||
			! is_string( $c['jti'] ?? null ) || '' === $c['jti'] || strlen( $c['jti'] ) > 512 ) {
			throw new Failure( 'invalid_logout_claims' );
		}
	}
}
