<?php
namespace AccessLobby\WordPress;

final class Oidc {
	public function __construct( private readonly Http $http, private readonly TokenValidator $validator ) {}

	public function discovery( array $c ): array {
		Config::validate( $c );
		$key  = 'alwp_discovery_' . Config::fingerprint( $c );
		$data = get_transient( $key );
		if ( ! is_array( $data ) ) {
			$data = $this->http->json( rtrim( $c['issuer'], '/' ) . '/.well-known/openid-configuration' );
			$this->check_discovery( $data, $c );
			set_transient( $key, $data, 300 );
		}
		$this->check_discovery( $data, $c );
		return $data;
	}

	private function check_discovery( array $data, array $c ): void {
		if ( ( $data['issuer'] ?? null ) !== $c['issuer'] ||
			! in_array( 'S256', $data['code_challenge_methods_supported'] ?? array(), true ) ||
			! in_array( 'RS256', $data['id_token_signing_alg_values_supported'] ?? array(), true ) ) {
			throw new Failure( 'invalid_discovery' );
		}
		foreach ( array( 'authorization_endpoint', 'token_endpoint', 'jwks_uri', 'end_session_endpoint' ) as $name ) {
			$url = $data[ $name ] ?? '';
			Security::endpoint( $url );
			if ( Security::origin( $url ) !== Security::origin( $c['issuer'] ) ) {
				throw new Failure( 'untrusted_discovery_endpoint' );
			}
		}
	}

	public function authorize( array $c, array $flow ): string {
		$d    = $this->discovery( $c );
		$args = array(
			'client_id'             => $c['client_id'],
			'response_type'         => 'code',
			'response_mode'         => 'query',
			'redirect_uri'          => Config::route( 'callback' ),
			'scope'                 => 'openid profile email',
			'state'                 => $flow['state'],
			'nonce'                 => $flow['nonce'],
			'code_challenge'        => rtrim( strtr( base64_encode( hash( 'sha256', $flow['verifier'], true ) ), '+/', '-_' ), '=' ),
			'code_challenge_method' => 'S256',
		);
		if ( 'join' === $flow['intent'] ) {
			$args['prompt'] = 'create';
		} elseif ( in_array( $flow['intent'], array( 'link', 'unlink' ), true ) ) {
			$args['prompt']  = 'login';
			$args['max_age'] = '0';
		}
		return $d['authorization_endpoint'] . '?' . http_build_query( $args, '', '&', PHP_QUERY_RFC3986 );
	}

	private function verify( string $token, array $c, string $audience ): array {
		$d   = $this->discovery( $c );
		$key = 'alwp_jwks_' . hash( 'sha256', $d['jwks_uri'] );
		$set = get_transient( $key );
		if ( ! is_array( $set ) ) {
			$set = $this->http->json( $d['jwks_uri'] );
			set_transient( $key, $set, 300 );
		}
		try {
			return $this->validator->verify( $token, $set, $c['issuer'], $audience );
		} catch ( Failure $e ) {
			// One bounded refresh on rotation; transient lock bounds invalid-token refresh traffic.
			$refresh = 'alwp_key_refresh_' . hash( 'sha256', $d['jwks_uri'] );
			if ( get_transient( $refresh ) ) {
				throw $e;
			}
			set_transient( $refresh, 1, 15 );
			$set = $this->http->json( $d['jwks_uri'] );
			set_transient( $key, $set, 300 );
			return $this->validator->verify( $token, $set, $c['issuer'], $audience );
		}
	}

	public function callback( array $c, array $flow, string $code ): array {
		if ( '' === $code || strlen( $code ) > 4096 ) {
			throw new Failure( 'invalid_authorization_response' );
		}
		$d    = $this->discovery( $c );
		$body = array(
			'grant_type'    => 'authorization_code',
			'client_id'     => $c['client_id'],
			'code'          => $code,
			'redirect_uri'  => Config::route( 'callback' ),
			'code_verifier' => $flow['verifier'],
		);
		if ( defined( 'ACCESSLOBBY_CLIENT_SECRET' ) && '' !== ACCESSLOBBY_CLIENT_SECRET ) {
			$body['client_secret'] = ACCESSLOBBY_CLIENT_SECRET;
		}
		$t = $this->http->json(
			$d['token_endpoint'],
			array(
				'method' => 'POST',
				'body'   => $body,
			)
		);
		if ( ! is_string( $t['id_token'] ?? null ) || ! is_string( $t['access_token'] ?? null ) || 'bearer' !== strtolower( $t['token_type'] ?? '' ) ) {
			throw new Failure( 'invalid_token_response' );
		}
		$id     = $this->verify( $t['id_token'], $c, $c['client_id'] );
		$access = $this->verify( $t['access_token'], $c, 'accesslobby-api' );
		$this->validator->authentication( $id, $access, $c['client_id'], $flow['nonce'] );
		if ( in_array( $flow['intent'], array( 'link', 'unlink' ), true ) &&
			( ! is_int( $id['auth_time'] ?? null ) || $id['auth_time'] < $flow['started'] - 5 || $id['auth_time'] > time() + 5 ) ) {
			throw new Failure( 'fresh_authentication_required' );
		}
		$headers = array(
			'Authorization' => 'Bearer ' . $t['access_token'],
			'Accept'        => 'application/json',
			'x-request-id'  => wp_generate_uuid4(),
		);
		$me      = $this->http->json( rtrim( $c['api'], '/' ) . '/v1/me', array( 'headers' => $headers ) );
		if ( 'accesslobby.identity.v0.1' !== ( $me['contract'] ?? null ) || 'active' !== ( $me['person']['status'] ?? null ) ||
			! is_string( $me['person']['id'] ?? null ) || ! preg_match( '/^[0-9a-f-]{36}$/Di', $me['person']['id'] ) ) {
			throw new Failure( 'invalid_identity_response' );
		}
		$entry = $this->http->json( rtrim( $c['api'], '/' ) . '/v1/application-entry', array( 'headers' => $headers ) );
		if ( 'accesslobby.app-entry.v0.1' !== ( $entry['contract'] ?? null ) || true !== ( $entry['admitted'] ?? null ) ||
			( $entry['clientId'] ?? null ) !== $c['client_id'] || empty( $entry['applicationId'] ) ) {
			throw new Failure( 'application_entry_denied' );
		}
		return array(
			'issuer'         => $c['issuer'],
			'subject'        => $id['sub'],
			'identity'       => $me['person']['id'],
			'sid'            => $id['sid'],
			'email'          => is_string( $id['email'] ?? null ) ? $id['email'] : '',
			'email_verified' => true === ( $id['email_verified'] ?? false ),
			'expires'        => min( time() + 3600, $id['exp'], $access['exp'] ),
		);
	}

	public function logout_token( string $token, array $c ): array {
		$claims = $this->verify( $token, $c, $c['client_id'] );
		$this->validator->logout( $claims );
		return $claims;
	}
}
