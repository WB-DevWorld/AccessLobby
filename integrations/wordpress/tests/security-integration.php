<?php
/** Adversarial database/hook/recovery checks on disposable real WordPress only. */
use AccessLobby\WordPress\Admin;
use AccessLobby\WordPress\Config;
use AccessLobby\WordPress\Emergency;
use AccessLobby\WordPress\Failure;
use AccessLobby\WordPress\Http;
use AccessLobby\WordPress\Oidc;
use AccessLobby\WordPress\Security;
use AccessLobby\WordPress\Store;
use AccessLobby\WordPress\TokenValidator;

if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE || 'local' !== wp_get_environment_type() ) {
	throw new RuntimeException( 'Disposable fixture required' );
}
global $wpdb;
$store = new Store( $wpdb );
$passed = array();
$check = static function ( bool $condition, string $name ) use ( &$passed ): void {
	if ( ! $condition ) { throw new RuntimeException( 'FAIL: ' . $name ); }
	$passed[] = $name;
};
$denied = static function ( callable $operation, string $name ) use ( $check ): void {
	try { $operation(); } catch ( Failure $error ) { $check( true, $name ); return; }
	$check( false, $name );
};
$config = Config::get();
$config['jit'] = true;
$identity = static fn() => array( 'issuer' => $config['issuer'], 'identity' => wp_generate_uuid4(),
	'subject' => wp_generate_uuid4(), 'email' => wp_generate_uuid4() . '@example.test', 'email_verified' => true );

$count = count_users()['total_users'];
$escalate = static function ( int $id ): void { ( new WP_User( $id ) )->set_role( 'administrator' ); };
add_action( 'user_register', $escalate );
try { $denied( fn() => $store->resolve( $identity(), $config ), 'post-registration hook cannot elevate JIT user' ); }
finally { remove_action( 'user_register', $escalate ); }
$check( $count === count_users()['total_users'], 'unsafe JIT transaction leaves no orphan user' );

$audit_table = $store->table( 'audit' );
$disable_audit = static function ( string $sql ) use ( $audit_table ): string {
	return str_starts_with( $sql, 'INSERT INTO `' . $audit_table . '`' ) ? str_replace( $audit_table, 'missing_fixture_audit', $sql ) : $sql;
};
$prior_suppression = $wpdb->suppress_errors( true );
add_filter( 'query', $disable_audit );
try { $denied( fn() => $store->resolve( $identity(), $config ), 'missing durable audit denies account creation' ); }
finally { remove_filter( 'query', $disable_audit ); $wpdb->suppress_errors( $prior_suppression ); }
$check( $count === count_users()['total_users'], 'audit failure rolls back account and mapping' );

$item = $identity();
$user = $store->resolve( $item, $config );
$prior_suppression = $wpdb->suppress_errors( true );
add_filter( 'query', $disable_audit );
try { $denied( fn() => $store->unlink( $user, $item ), 'missing durable audit denies unlink' ); }
finally { remove_filter( 'query', $disable_audit ); $wpdb->suppress_errors( $prior_suppression ); }
$check( 'active' === $store->link_for_user( $user )['link_state'], 'unlink audit failure preserves active mapping' );

$before = $store->readiness_counts()['unlinked_privileged'];
add_role( 'fixture_custom_staff', 'Fixture custom staff', array( 'read' => true, 'edit_others_posts' => true ) );
$custom = wp_insert_user( array( 'user_login' => 'custom_' . substr( wp_generate_uuid4(), 0, 8 ),
	'user_pass' => wp_generate_password(), 'role' => 'fixture_custom_staff' ) );
$check( $store->readiness_counts()['unlinked_privileged'] === $before + 1, 'readiness identifies custom privileged capabilities' );
$denied( fn() => Emergency::issue( $store, $user, '127.0.0.1', 'fixture incident' ), 'ordinary shopper cannot receive emergency admin ticket' );
$denied( fn() => Emergency::issue( $store, 1, '203.0.113.8', 'fixture incident' ), 'non-allowlisted IP cannot receive emergency ticket' );
$ticket = Emergency::issue( $store, 1, '127.0.0.1', 'fixture-recovery-reference' );
$data = $store->state_get( 'emergency:' . $ticket, 'emergency', true );
$check( 1 === $data['user'] && '127.0.0.1' === $data['ip'], 'host ticket binds exact existing administrator and IP' );
$denied( fn() => $store->state_get( 'emergency:' . $ticket, 'emergency', true ), 'emergency ticket can be consumed only once' );
$audit = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM %i WHERE event=%s ORDER BY id DESC LIMIT 1', $audit_table, 'emergency_ticket_issued' ), ARRAY_A );
$check( hash( 'sha256', 'fixture-recovery-reference' ) === $audit['reference_hash'], 'emergency issuance retains incident reference hash' );
$check( ! str_contains( wp_json_encode( $audit ), $ticket ), 'emergency ticket excluded from audit values' );

wp_set_current_user( 1 );
$admin = new Admin( $store, new Oidc( new Http(), new TokenValidator() ) );
$attempt = Config::get(); $attempt['mode'] = 'enforced';
$result = $admin->sanitize( $attempt );
$check( 'hybrid' === $result['mode'], 'enforcement fails closed before migration readiness' );

$link_before = $store->link_for_user( $user );
$wpdb->query( $wpdb->prepare( 'ALTER TABLE %i DROP COLUMN reference_hash', $audit_table ) );
update_option( 'accesslobby_schema', '1' );
$store->migrate(); $store->migrate();
$columns = $wpdb->get_col( $wpdb->prepare( 'SHOW COLUMNS FROM %i', $audit_table ) );
$check( in_array( 'reference_hash', $columns, true ) && '2' === get_option( 'accesslobby_schema' ), 'version-one schema upgrades idempotently' );
$check( $link_before === $store->link_for_user( $user ), 'schema upgrade preserves existing identity ownership' );

$report = array( 'assertions' => count( $passed ), 'passed' => $passed );
if ( getenv( 'ALWP_SECURITY_RESULT' ) ) { file_put_contents( getenv( 'ALWP_SECURITY_RESULT' ), wp_json_encode( $report, JSON_PRETTY_PRINT ) ); }
WP_CLI::line( wp_json_encode( $report, JSON_PRETTY_PRINT ) );
