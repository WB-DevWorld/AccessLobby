<?php
use AccessLobby\WordPress\Config;
use PHPUnit\Framework\TestCase;

final class ConfigTest extends TestCase {
	public function testTrailingSlashDoesNotChangeConfigurationFingerprint(): void {
		$c = array(
			'issuer'    => 'https://iam.example.test/realms/test',
			'api'       => 'https://api.example.test',
			'client_id' => 'example-wp',
		);
		$GLOBALS['alwp_site_url'] = 'https://example.test';
		$GLOBALS['alwp_home_url'] = 'https://example.test/';
		$slashed = Config::fingerprint( $c );
		$GLOBALS['alwp_home_url'] = 'https://example.test';
		$this->assertSame( $slashed, Config::fingerprint( $c ) );
		$legacy = hash( 'sha256', wp_json_encode( array( $c['issuer'], $c['api'], $c['client_id'], 'https://example.test', 'https://example.test/' ) ) );
		$GLOBALS['alwp_home_url'] = 'https://example.test/';
		$this->assertTrue( Config::recognizes( $c, $legacy ) );
		$GLOBALS['alwp_home_url'] = 'https://other.example.test/';
		$this->assertNotSame( $slashed, Config::fingerprint( $c ) );
		$this->assertFalse( Config::recognizes( $c, $legacy ) );
	}
}
