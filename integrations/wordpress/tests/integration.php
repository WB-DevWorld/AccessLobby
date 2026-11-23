<?php
/** Real WordPress database/API checks. Run only in disposable fixtures via WP-CLI. */
use AccessLobby\WordPress\Config;
use AccessLobby\WordPress\Emergency;
use AccessLobby\WordPress\Failure;
use AccessLobby\WordPress\Security;
use AccessLobby\WordPress\Sessions;
use AccessLobby\WordPress\Store;
use AccessLobby\WordPress\Surfaces;

if ( 'local' !== wp_get_environment_type() || ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) {
	throw new RuntimeException( 'Disposable fixture only' );
}
global $wpdb;
$store = new Store( $wpdb );
$passed = array();
$check = static function ( $condition, $name ) use ( &$passed ) {
	if ( ! $condition ) { throw new RuntimeException( 'FAIL: ' . $name ); }
	$passed[] = $name;
};
$denied = static function ( callable $fn, $name ) use ( $check ) {
	try { $fn(); } catch ( Failure $e ) { $check( true, $name ); return; }
	$check( false, $name );
};
$c = Config::get();
$store->migrate();
$store->migrate();
$check( '2' === get_option( 'accesslobby_schema' ), 'versioned migration idempotent' );
$check( str_contains( Config::route( 'callback' ), parse_url( site_url(), PHP_URL_PATH ) ?: '/' ), 'callback preserves site path' );

$suffix = substr( wp_generate_uuid4(), 0, 8 );
$legacy = wp_insert_user( array( 'user_login' => 'legacy_' . $suffix, 'user_pass' => wp_generate_password( 40 ),
	'user_email' => 'legacy_' . $suffix . '@example.test', 'role' => class_exists( 'WooCommerce' ) ? 'customer' : 'editor' ) );
update_user_meta( $legacy, 'fixture_business_relationship', 'keep-b2b-data' );
update_user_meta( $legacy, 'billing_address_1', 'Existing address' );
$before = get_userdata( $legacy );
$roles = $before->roles;
$guest_before = get_option( 'woocommerce_enable_guest_checkout' );
$order_id = 0;
if ( function_exists( 'wc_create_order' ) ) {
	$order = wc_create_order( array( 'customer_id' => $legacy ) );
	$order->set_billing_address_1( 'Existing order address' );
	$order->set_total( 42 ); $order->save(); $order_id = $order->get_id();
}
$identity = array( 'issuer' => $c['issuer'], 'subject' => 'legacy-sub-' . $suffix, 'identity' => wp_generate_uuid4(),
	'sid' => 'legacy-browser-' . $suffix, 'email' => $before->user_email, 'email_verified' => true, 'expires' => time() + 1800 );
$jit = $c; $jit['jit'] = true;
$count = count_users()['total_users'];
$denied( fn() => $store->resolve( $identity, $jit ), 'matching email never links automatically' );
$check( count_users()['total_users'] === $count, 'email collision creates no duplicate' );
$check( $legacy === $store->resolve( $identity, $c, $legacy ), 'explicit proven local ID retained' );
$check( $legacy === $store->resolve( $identity, $c ), 'repeat sign-in same local user' );
$changed = $identity; $changed['email'] = 'changed_' . $suffix . '@example.test';
$check( $legacy === $store->resolve( $changed, $c ), 'email change keeps mapping' );
$changed['subject'] = 'replacement-sub-' . $suffix;
$check( $legacy === $store->resolve( $changed, $c ), 'same durable person provider-subject continuity' );
$other = $changed; $other['identity'] = wp_generate_uuid4();
$denied( fn() => $store->resolve( $other, $c, $legacy ), 'different person cannot acquire local user' );
$collision_user = wp_insert_user( array( 'user_login' => 'collision_' . $suffix, 'user_pass' => wp_generate_password(), 'user_email' => 'collision_' . $suffix . '@example.test', 'role' => 'subscriber' ) );
$denied( fn() => $store->resolve( $changed, $c, $collision_user ), 'mapping conflict fails closed' );
$check( get_userdata( $legacy )->roles === $roles, 'existing role preserved' );
$check( 'keep-b2b-data' === get_user_meta( $legacy, 'fixture_business_relationship', true ), 'business metadata preserved' );
$check( 'Existing address' === get_user_meta( $legacy, 'billing_address_1', true ), 'customer address preserved' );

$new = $identity; $new['identity'] = wp_generate_uuid4(); $new['subject'] = 'new-sub-' . $suffix; $new['email'] = 'new_' . $suffix . '@example.test';
$no_jit = $c; $no_jit['jit'] = false;
$denied( fn() => $store->resolve( $new, $no_jit ), 'JIT disabled denies unmapped identity' );
$new_id = $store->resolve( $new, $jit );
$check( $new_id > 0 && $new_id === $store->resolve( $new, $jit ), 'JIT exactly one local user' );
$check( ! user_can( $new_id, 'manage_options' ) && ! user_can( $new_id, 'edit_users' ), 'JIT never grants privileged capabilities' );
$check( get_userdata( $new_id )->roles === array( $c['default_role'] ), 'explicit safe local default role' );
$unsafe = $jit; $unsafe['default_role'] = 'administrator';
$unsafe_identity = $new; $unsafe_identity['identity'] = wp_generate_uuid4(); $unsafe_identity['subject'] = 'unsafe-' . $suffix;
$denied( fn() => $store->resolve( $unsafe_identity, $unsafe ), 'privileged JIT rejected' );
$unverified = $unsafe_identity; $unverified['email_verified'] = false;
$denied( fn() => $store->resolve( $unverified, $jit ), 'unverified email cannot JIT' );
$store->unlink( $legacy, $changed );
$denied( fn() => $store->resolve( $changed, $jit ), 'unlinked identity cannot silently re-provision' );
$store->resolve( $changed, $c, $legacy );

$flow_key = Security::random();
$store->state_put( $flow_key, 'auth_flow', array( 'private' => 'kept' ), 300 );
$check( 'kept' === $store->state_get( $flow_key, 'auth_flow', true )['private'], 'one-use state consumed' );
$denied( fn() => $store->state_get( $flow_key, 'auth_flow', true ), 'callback state replay rejected' );

$session_service = new Sessions( $store );
$session_service->establish( $legacy, $changed, $c );
$other_device = $changed; $other_device['sid'] = 'another-device-' . $suffix;
$session_service->establish( $legacy, $other_device, $c );
$first = $store->sessions( Sessions::sid_key( $c, $changed['sid'] ) )[0];
$second = $store->sessions( Sessions::sid_key( $c, $other_device['sid'] ) )[0];
$first_token = Security::open( $first['sealed_token'] )['token'];
$second_token = Security::open( $second['sealed_token'] )['token'];
$manager = WP_Session_Tokens::get_instance( $legacy );
$check( $manager->verify( $first_token ) && $manager->verify( $second_token ), 'independent WP sessions created' );
$_COOKIE[LOGGED_IN_COOKIE] = wp_generate_auth_cookie( $legacy, $changed['expires'], 'logged_in', $first_token );
$session_service->establish( $legacy, $changed, $c );
unset( $_COOKIE[LOGGED_IN_COOKIE] );
$rotated = $store->sessions( Sessions::sid_key( $c, $changed['sid'] ) );
$rotated_token = Security::open( $rotated[0]['sealed_token'] )['token'];
$check( 1 === count( $rotated ) && ! $manager->verify( $first_token ) && $manager->verify( $rotated_token ) && $manager->verify( $second_token ), 'link-session rotation removes previous token and preserves unrelated device' );
$first_token = $rotated_token;
$session_service->backchannel( array( 'sid' => 'unrelated-' . $suffix, 'jti' => 'unrelated-jti-' . $suffix ), $c );
$check( $manager->verify( $first_token ), 'unrelated sid cannot clear session' );
$event = array( 'sid' => $changed['sid'], 'jti' => 'event-' . $suffix );
$session_service->backchannel( $event, $c );
$check( ! $manager->verify( $first_token ), 'matching backchannel destroys corresponding WP session' );
$check( $manager->verify( $second_token ), 'another device remains signed in' );
$denied( fn() => $session_service->backchannel( $event, $c ), 'durable logout replay rejected' );
$denied( fn() => $session_service->establish( $legacy, $changed, $c ), 'logout/login race tombstone denies ended sid' );

$surfaces = new Surfaces( $store );
$old = get_option( 'accesslobby_sso' );
$c['mode'] = 'hybrid'; update_option( 'accesslobby_sso', $c );
$check( $surfaces->password_policy( $before ) === $before, 'hybrid preserves ordinary local authentication' );
$c['mode'] = 'enforced';
// Direct fixture update bypasses readiness only in the disposable fixture. Admin sanitizer is tested below.
remove_all_actions( 'update_option_accesslobby_sso' ); update_option( 'accesslobby_sso', $c );
$saved_cli = defined( 'WP_CLI' ) && WP_CLI;
// WP-CLI is a declared machine surface, so use explicit machine deny to check final password gate.
$c['machine_auth'] = false; update_option( 'accesslobby_sso', $c );
$check( is_wp_error( $surfaces->password_policy( $before ) ), 'enforced final authentication gate refuses local passwords' );
$c['machine_auth'] = true; update_option( 'accesslobby_sso', $c );
$check( $surfaces->password_policy( $before ) === $before, 'explicit machine policy preserves CLI authentication' );
update_option( 'accesslobby_sso', $old );

if ( $order_id ) {
	$order = wc_get_order( $order_id );
	$check( $order && $order->get_customer_id() === $legacy && '42.00' === $order->get_total(), 'Woo order and customer ownership preserved' );
	$check( 'Existing order address' === $order->get_billing_address_1(), 'Woo order address preserved' );
}
$check( get_option( 'woocommerce_enable_guest_checkout' ) === $guest_before, 'guest-checkout policy unchanged' );
$check( get_userdata( $legacy )->ID === $legacy && get_userdata( $legacy )->roles === $roles, 'local history and permissions survive session/link operations' );
$check( ! str_contains( wp_json_encode( $wpdb->get_results( 'SELECT * FROM ' . $store->table( 'audit' ), ARRAY_A ) ), $first_token ), 'session token never appears in audit' );

$result = array( 'wordpress' => get_bloginfo( 'version' ), 'php' => PHP_VERSION, 'woocommerce' => defined( 'WC_VERSION' ) ? WC_VERSION : null,
	'site' => site_url(), 'assertions' => count( $passed ), 'passed' => $passed );
if ( getenv( 'ALWP_INTEGRATION_RESULT' ) ) { file_put_contents( getenv( 'ALWP_INTEGRATION_RESULT' ), wp_json_encode( $result, JSON_PRETTY_PRINT ) ); }
WP_CLI::line( wp_json_encode( $result, JSON_PRETTY_PRINT ) );
