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

// Cursor's HTTPS Join probe exposed a late hook that runs after core validation.
// Exercise real wp_insert_user(), not a mocked WP_Error or an email collision.
foreach ( array( '', " \t " ) as $invalid_login ) {
	$probe = $identity();
	$before_users = count_users()['total_users'];
	$before_links = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $store->table( 'links' ) ) );
	$hook_called = false;
	$corrupt_login = static function ( array $data, bool $update, $user_id, array $userdata ) use ( $probe, $invalid_login, &$hook_called ): array {
		if ( ! $update && $probe['email'] === ( $userdata['user_email'] ?? '' ) ) {
			$hook_called = true;
			$data['user_login'] = $invalid_login;
		}
		return $data;
	};
	add_filter( 'wp_pre_insert_user_data', $corrupt_login, 10, 4 );
	$failure = '';
	try { $store->resolve( $probe, $config ); }
	catch ( Failure $error ) { $failure = $error->getMessage(); }
	finally { remove_filter( 'wp_pre_insert_user_data', $corrupt_login, 10 ); }
	$users_preserved = $before_users === count_users()['total_users'];
	$links_preserved = $before_links === (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $store->table( 'links' ) ) );
	WP_CLI::line( 'LATE_HOOK_PROBE ' . wp_json_encode( array(
		'hookCalled' => $hook_called, 'rejected' => 'unsafe_provisioning_result' === $failure,
		'usersPreserved' => $users_preserved, 'linksPreserved' => $links_preserved,
	) ) );
	$check( $hook_called && 'unsafe_provisioning_result' === $failure, 'late pre-insert blank username is rejected after hooks' );
	$check( $users_preserved && $links_preserved && ! email_exists( $probe['email'] ), 'late hook rejection rolls back user and mapping' );
}

// Legitimate site-local username customization must still work; the login name
// is not the external identity key and need not equal the connector suggestion.
$probe = $identity();
$custom_login = 'local_' . substr( wp_generate_uuid4(), 0, 12 );
$rename_login = static function ( array $data, bool $update, $user_id, array $userdata ) use ( $probe, $custom_login ): array {
	if ( ! $update && $probe['email'] === ( $userdata['user_email'] ?? '' ) ) { $data['user_login'] = $custom_login; }
	return $data;
};
add_filter( 'wp_pre_insert_user_data', $rename_login, 10, 4 );
try { $custom_user = $store->resolve( $probe, $config ); }
finally { remove_filter( 'wp_pre_insert_user_data', $rename_login, 10 ); }
$check( $custom_login === get_userdata( $custom_user )->user_login, 'valid site-local username customization survives JIT' );
$check( $custom_user === $store->resolve( $probe, $config ), 'custom username retains the same durable mapping on repeat' );

// A failure before insertion is a separate core error, not a malformed success.
$probe = $identity();
$before_users = count_users()['total_users'];
$before_links = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $store->table( 'links' ) ) );
$empty_core_login = static fn( string $login ): string => '';
add_filter( 'pre_user_login', $empty_core_login );
$failure = '';
try { $store->resolve( $probe, $config ); }
catch ( Failure $error ) { $failure = $error->getMessage(); }
finally { remove_filter( 'pre_user_login', $empty_core_login ); }
$check( 'local_account_creation_failed' === $failure, 'core user creation error remains fail-closed' );
$check( $before_users === count_users()['total_users'] &&
	$before_links === (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM %i', $store->table( 'links' ) ) ),
	'core creation failure leaves no user or mapping' );

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
$state_table = $store->table( 'state' );
$disable_state_read = static function ( string $sql ) use ( $state_table ): string {
	return str_starts_with( $sql, 'SELECT * FROM ' . $state_table . ' WHERE state_key=' ) ? str_replace( $state_table, 'missing_fixture_state', $sql ) : $sql;
};
$prior_suppression = $wpdb->suppress_errors( true );
add_filter( 'query', $disable_state_read );
try { $denied( fn() => $store->has_state( 'unreadable-fixture', 'revoked_sid' ), 'unreadable revocation state fails closed rather than meaning absent' ); }
finally { remove_filter( 'query', $disable_state_read ); $wpdb->suppress_errors( $prior_suppression ); }

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

$attempt = Config::get();
$page = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Dedicated login fixture' ) );
$attempt['login_pages'] = array( '', (string) $page, (string) $page );
$check( array( $page ) === $admin->sanitize( $attempt )['login_pages'], 'admin accepts only published unique page IDs' );
foreach ( array( array( 'not-a-page' ), array( array( $page ) ), array( '999999999' ), 'all-pages' ) as $invalid ) {
	$attempt['login_pages'] = $invalid;
	$check( Config::get()['login_pages'] === $admin->sanitize( $attempt )['login_pages'], 'malformed login page selection cannot alter settings' );
}
wp_set_current_user( $user );
$attempt['login_pages'] = array( $page );
$check( Config::get() === $admin->sanitize( $attempt ), 'ordinary local user cannot configure dedicated login pages' );
wp_set_current_user( 1 );
wp_delete_post( $page, true );
$link_before = $store->link_for_user( $user );
$wpdb->query( $wpdb->prepare( 'ALTER TABLE %i DROP COLUMN reference_hash', $audit_table ) );
update_option( 'accesslobby_schema', '1' );
$block_upgrade = static function ( string $sql ) use ( $audit_table ): string {
	return str_starts_with( $sql, 'ALTER TABLE ' . $audit_table ) && str_contains( $sql, 'reference_hash' ) ? 'SELECT 1' : $sql;
};
add_filter( 'query', $block_upgrade );
try { $denied( fn() => $store->migrate(), 'incomplete database upgrade cannot report successful schema' ); }
finally { remove_filter( 'query', $block_upgrade ); }
$check( '1' === get_option( 'accesslobby_schema' ), 'failed schema upgrade retains prior version for repair' );
$store->migrate(); $store->migrate();
$columns = $wpdb->get_col( $wpdb->prepare( 'SHOW COLUMNS FROM %i', $audit_table ) );
$check( in_array( 'reference_hash', $columns, true ) && '2' === get_option( 'accesslobby_schema' ), 'version-one schema upgrades idempotently' );
$check( $link_before === $store->link_for_user( $user ), 'schema upgrade preserves existing identity ownership' );

$report = array( 'assertions' => count( $passed ), 'passed' => $passed );
if ( getenv( 'ALWP_SECURITY_RESULT' ) ) { file_put_contents( getenv( 'ALWP_SECURITY_RESULT' ), wp_json_encode( $report, JSON_PRETTY_PRINT ) ); }
WP_CLI::line( wp_json_encode( $report, JSON_PRETTY_PRINT ) );
