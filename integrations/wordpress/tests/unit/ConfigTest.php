<?php
use AccessLobby\WordPress\Config;
use PHPUnit\Framework\TestCase;

final class ConfigTest extends TestCase {
	protected function tearDown(): void {
		unset( $GLOBALS['alwp_site_url'], $GLOBALS['alwp_home_url'] );
		parent::tearDown();
	}

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

	public function testEveryLegacySlashCombinationSurvivesARequestPhaseChange(): void {
		$c     = array( 'issuer' => 'https://iam.example.test/realms/test', 'api' => 'https://api.example.test', 'client_id' => 'example-wp' );
		$sites = array( 'https://example.test/gh', 'https://example.test/gh/' );
		$homes = array( 'https://example.test/store', 'https://example.test/store/' );
		foreach ( $sites as $old_site ) {
			foreach ( $homes as $old_home ) {
				$legacy = hash( 'sha256', wp_json_encode( array( $c['issuer'], $c['api'], $c['client_id'], $old_site, $old_home ) ) );
				foreach ( $sites as $current_site ) {
					foreach ( $homes as $current_home ) {
						$GLOBALS['alwp_site_url'] = $current_site;
						$GLOBALS['alwp_home_url'] = $current_home;
						$this->assertTrue( Config::recognizes( $c, $legacy ), 'Only the trailing-slash spelling changed between requests.' );
					}
				}
			}
		}
	}

	public function testCanonicalAndLegacyFingerprintsRejectActualTrustChanges(): void {
		$c = array( 'issuer' => 'https://iam.example.test/realms/test', 'api' => 'https://api.example.test', 'client_id' => 'example-wp' );
		$GLOBALS['alwp_site_url'] = 'https://example.test/gh/';
		$GLOBALS['alwp_home_url'] = 'https://example.test/store';
		$stored = array(
			Config::fingerprint( $c ),
			hash( 'sha256', wp_json_encode( array( $c['issuer'], $c['api'], $c['client_id'], $GLOBALS['alwp_site_url'], $GLOBALS['alwp_home_url'] ) ) ),
		);
		foreach ( array(
			array( 'issuer', 'https://iam.example.test/realms/other' ),
			array( 'api', 'https://other-api.example.test' ),
			array( 'client_id', 'other-wp' ),
			array( 'site', 'https://other.example.test/gh/' ),
			array( 'site', 'https://example.test/intl/' ),
			array( 'home', 'https://other.example.test/store' ),
			array( 'home', 'https://example.test/moved' ),
			array( 'site', 'http://example.test/gh/' ),
			array( 'home', 'https://example.test:8443/store' ),
		) as list( $field, $value ) ) {
			$changed = $c;
			$GLOBALS['alwp_site_url'] = 'https://example.test/gh/';
			$GLOBALS['alwp_home_url'] = 'https://example.test/store';
			if ( in_array( $field, array( 'site', 'home' ), true ) ) {
				$GLOBALS[ 'alwp_' . $field . '_url' ] = $value;
			} else {
				$changed[ $field ] = $value;
			}
			foreach ( $stored as $fingerprint ) {
				$this->assertFalse( Config::recognizes( $changed, $fingerprint ), 'A real issuer, API, client, host, path, scheme or port change must fail closed.' );
			}
		}
	}
}
