<?php
define( 'ACCESSLOBBY_WP_VERSION', 'analysis' );
define( 'ACCESSLOBBY_WP_FILE', __DIR__ . '/../accesslobby-sso.php' );
define( 'ACCESSLOBBY_ALLOW_LOCAL_HTTP', (bool) getenv('ALWP_ANALYSIS_HTTP') );
define( 'ACCESSLOBBY_CLIENT_SECRET', (string) getenv('ALWP_ANALYSIS_SECRET') );
define( 'ACCESSLOBBY_EMERGENCY_ENABLED', (bool) getenv('ALWP_ANALYSIS_EMERGENCY') );
define( 'ACCESSLOBBY_EMERGENCY_IPS', json_decode((string) getenv('ALWP_ANALYSIS_IPS'), true) );
class WP_CLI {
	public static function add_command( $name, $callable ) {}
	public static function line( $line ) {}
	public static function error( $line ) {}
}
function is_account_page() { return false; }
function is_wc_endpoint_url( $endpoint = '' ) { return false; }
function is_checkout() { return false; }
class WC_Checkout {
	public static function instance(): self { return new self(); }
	public function is_registration_required(): bool { return false; }
}

define('ABSPATH', __DIR__ . '/');
define('DB_NAME', 'analysis');
define('ARRAY_A', 'ARRAY_A');
define('DAY_IN_SECONDS', 86400);
