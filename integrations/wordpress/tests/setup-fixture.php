<?php
/** Disposable browser fixture. Contains no production access or real personal data. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) { throw new RuntimeException( 'Fixture required' ); }
$password = getenv( 'ALWP_FIXTURE_PASSWORD' );
$local = wp_insert_user( array( 'user_login' => 'legacy_shopper', 'user_pass' => $password,
	'user_email' => getenv( 'ALWP_FIXTURE_EMAIL' ) ?: 'shopper@example.test', 'role' => class_exists( 'WooCommerce' ) ? 'customer' : 'subscriber' ) );
update_user_meta( $local, 'billing_address_1', 'Preserved fixture address' );
update_user_meta( $local, 'fixture_b2b_approved', 'yes' );
$order_id = 0;
if ( function_exists( 'wc_create_order' ) ) {
	$order = wc_create_order( array( 'customer_id' => $local ) ); $order->set_total( 73 ); $order->save(); $order_id = $order->get_id();
}
$account = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture account',
	'post_content' => '[accesslobby_account]' ) );
$protected = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture protected', 'post_content' => 'Fixture protected content' ) );
$frontend = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture frontend login', 'post_content' => '[fixture_local_login]' ) );
$woo_account = 0;
if ( class_exists( 'WooCommerce' ) ) {
	$woo_account = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'My account', 'post_content' => '[woocommerce_my_account]' ) );
	update_option( 'woocommerce_myaccount_page_id', $woo_account );
}
update_option( 'alwp_fixture_protected', $protected );
$data = array( 'legacyUser' => $local, 'orderId' => $order_id, 'account' => get_permalink( $account ),
	'protected' => get_permalink( $protected ), 'frontend' => get_permalink( $frontend ),
	'wooAccount' => $woo_account ? get_permalink( $woo_account ) : null );
update_option( 'alwp_fixture_data', $data );
WP_CLI::line( wp_json_encode( $data ) );
