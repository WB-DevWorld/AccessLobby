<?php
use AccessLobby\WordPress\Failure;
use AccessLobby\WordPress\TokenValidator;
use AccessLobby\WordPress\Vendor\JWT\JWT;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class TokenValidatorTest extends TestCase {
	private static string $private = '';
	private static array $jwks;

	public static function setUpBeforeClass(): void {
		$key = openssl_pkey_new( array( 'private_key_bits' => 2048 ) );
		openssl_pkey_export( $key, self::$private );
		$rsa = openssl_pkey_get_details( $key )['rsa'];
		$b64 = static fn( $x ) => rtrim( strtr( base64_encode( $x ), '+/', '-_' ), '=' );
		self::$jwks = array( 'keys' => array( array( 'kid' => 'fixture', 'kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'n' => $b64( $rsa['n'] ), 'e' => $b64( $rsa['e'] ) ) ) );
	}

	private function claims(): array {
		return array( 'iss' => 'https://issuer.example/realm', 'aud' => 'wp-a', 'iat' => time(), 'exp' => time() + 60,
			'sub' => 'subject-a', 'sid' => 'browser-session-a', 'nonce' => 'flow-nonce' );
	}

	public function testValidSignatureAndClaims(): void {
		$c = $this->claims();
		$t = JWT::encode( $c, self::$private, 'RS256', 'fixture' );
		$this->assertSame( $c, ( new TokenValidator() )->verify( $t, self::$jwks, $c['iss'], 'wp-a' ) );
	}

	public static function invalidTokens(): array {
		return array( array( 'issuer' ), array( 'audience' ), array( 'expired' ), array( 'future' ), array( 'signature' ), array( 'algorithm' ), array( 'missing_iat' ) );
	}

	#[DataProvider( 'invalidTokens' )]
	public function testInvalidTokenRejected( string $case ): void {
		$c = $this->claims();
		if ( 'issuer' === $case ) { $c['iss'] = 'https://wrong.example'; }
		if ( 'audience' === $case ) { $c['aud'] = 'other-client'; }
		if ( 'expired' === $case ) { $c['exp'] = time() - 60; }
		if ( 'future' === $case ) { $c['iat'] = time() + 60; }
		if ( 'missing_iat' === $case ) { unset( $c['iat'] ); }
		$token = 'algorithm' === $case ? JWT::encode( $c, str_repeat( 'a', 32 ), 'HS256', 'fixture' ) : JWT::encode( $c, self::$private, 'RS256', 'fixture' );
		if ( 'signature' === $case ) { $parts = explode( '.', $token ); $parts[2][0] = 'a' === $parts[2][0] ? 'b' : 'a'; $token = implode( '.', $parts ); }
		$this->expectException( Failure::class );
		( new TokenValidator() )->verify( $token, self::$jwks, 'https://issuer.example/realm', 'wp-a' );
	}

	public static function invalidAuthentication(): array {
		return array( array( 'nonce' ), array( 'sid' ), array( 'subject' ), array( 'azp' ), array( 'missing_exp' ), array( 'id_azp' ), array( 'multiple_aud' ) );
	}

	#[DataProvider( 'invalidAuthentication' )]
	public function testAuthenticationBindings( string $case ): void {
		$id = $this->claims();
		$access = $id; $access['aud'] = 'accesslobby-api'; $access['azp'] = 'wp-a';
		if ( 'nonce' === $case ) { $id['nonce'] = 'other'; }
		if ( 'sid' === $case ) { $access['sid'] = 'other'; }
		if ( 'subject' === $case ) { $access['sub'] = 'other'; }
		if ( 'azp' === $case ) { $access['azp'] = 'other'; }
		if ( 'id_azp' === $case ) { $id['azp'] = 'other'; }
		if ( 'multiple_aud' === $case ) { $id['aud'] = array( 'wp-a', 'other' ); }
		if ( 'missing_exp' === $case ) { unset( $access['exp'] ); }
		$this->expectException( Failure::class );
		( new TokenValidator() )->authentication( $id, $access, 'wp-a', 'flow-nonce' );
	}

	private function logoutClaims(): array {
		$c = $this->claims(); unset( $c['nonce'], $c['exp'] );
		$c['jti'] = 'unique-event'; $c['events'] = (object) array( 'http://schemas.openid.net/event/backchannel-logout' => new stdClass() );
		return $c;
	}

	public function testLogoutWithoutExpiryIsValidPerContract(): void {
		( new TokenValidator() )->logout( $this->logoutClaims() );
		$this->addToAssertionCount( 1 );
	}

	public static function invalidLogout(): array {
		return array_map( static fn( $x ) => array( $x ), array( 'nonce', 'old', 'sid', 'jti', 'event', 'extra_event', 'event_payload' ) );
	}

	#[DataProvider( 'invalidLogout' )]
	public function testLogoutConfusionRejected( string $case ): void {
		$c = $this->logoutClaims();
		if ( 'nonce' === $case ) { $c['nonce'] = 'id-token-confusion'; }
		if ( 'old' === $case ) { $c['iat'] = time() - 400; }
		if ( 'sid' === $case ) { unset( $c['sid'] ); }
		if ( 'jti' === $case ) { unset( $c['jti'] ); }
		if ( 'event' === $case ) { $c['events'] = new stdClass(); }
		if ( 'extra_event' === $case ) { $c['events']->other = new stdClass(); }
		if ( 'event_payload' === $case ) { $c['events'] = (object) array( 'http://schemas.openid.net/event/backchannel-logout' => 'invalid' ); }
		$this->expectException( Failure::class );
		( new TokenValidator() )->logout( $c );
	}
}
