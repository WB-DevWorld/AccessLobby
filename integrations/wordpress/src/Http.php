<?php
namespace AccessLobby\WordPress;

final class Http {
	public function json( string $url, array $args = array() ): array {
		$scheme = parse_url( $url, PHP_URL_SCHEME );
		Security::endpoint( strtok( $url, '?' ) );
		$defaults = array(
			'timeout'             => 12,
			'redirection'         => 0,
			'sslverify'           => true,
			'limit_response_size' => 262144,
			'headers'             => array( 'Accept' => 'application/json' ),
		);
		$args     = array_replace( $defaults, $args );
		// Local HTTP exists only for explicit local fixtures, never staging/production.
		$response = Security::local_fixture( $url ) ? wp_remote_request( $url, $args ) : wp_safe_remote_request( $url, $args );
		if ( is_wp_error( $response ) || 200 !== wp_remote_retrieve_response_code( $response ) ) {
			throw new Failure( 'upstream_unavailable_or_denied' );
		}
		try {
			$data = json_decode( wp_remote_retrieve_body( $response ), true, 32, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $e ) {
			throw new Failure( 'upstream_invalid_response' );
		}
		if ( ! is_array( $data ) ) {
			throw new Failure( 'upstream_invalid_response' );
		}
		return $data;
	}
}
