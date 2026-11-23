<?php
use AccessLobby\WordPress\Security;
use AccessLobby\WordPress\Failure;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SecurityTest extends TestCase {
	public function testPrivateStateIsAuthenticatedAndUnpredictable(): void {
		$one = Security::seal( array( 'verifier' => 'private-value' ) );
		$two = Security::seal( array( 'verifier' => 'private-value' ) );
		$this->assertNotSame( $one, $two );
		$this->assertStringNotContainsString( 'private-value', $one );
		$this->assertSame( array( 'verifier' => 'private-value' ), Security::open( $one ) );
		$bytes = base64_decode( $one );
		$bytes[30] = chr( ord( $bytes[30] ) ^ 1 );
		$this->expectException( Failure::class );
		Security::open( base64_encode( $bytes ) );
	}

	public static function unsafeRedirects(): array {
		return array_map( static fn( $url ) => array( $url ), array(
			'https://evil.example/gh/', '//evil.example/gh/', 'javascript:alert(1)',
			'https://example.test/intl/orders', 'https://example.test/gh/../intl/',
			'https://example.test/gh/%2e%2e/intl/', 'https://example.test/gh/%252e%252e/intl/',
			'https://example.test/gh/wp-login.php?action=al_start', 'https://user@example.test/gh/',
			'https://example.test:444/gh/', 'http://example.test/gh/', 'https://example.test/gh/%5cevil',
			'https://example.test/gh/wp-admin/admin-post.php?action=al_start'
		) );
	}

	#[DataProvider( 'unsafeRedirects' )]
	public function testRedirectsStayInsideInstallation( string $url ): void {
		$this->assertSame( 'https://example.test/gh/', Security::destination( $url, 'https://example.test/gh/', 'https://example.test/gh/' ) );
	}

	public function testProtectedDestinationSurvives(): void {
		$url = 'https://example.test/gh/orders/?page=2';
		$this->assertSame( $url, Security::destination( $url, 'https://example.test/gh/', 'https://example.test/gh/' ) );
		$this->assertSame( 43, strlen( Security::random() ) );
		$this->assertNotSame( Security::random(), Security::random() );
	}

	public function testHttpsIsMandatoryInProduction(): void {
		$this->expectException( Failure::class );
		Security::endpoint( 'http://localhost:8888' );
	}
}
