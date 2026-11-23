<?php
/** Disposable browser fixture. Contains no production access or real personal data. */
if ( ! defined( 'ACCESSLOBBY_FIXTURE' ) || ! ACCESSLOBBY_FIXTURE ) { throw new RuntimeException( 'Fixture required' ); }
$password = getenv( 'ALWP_FIXTURE_PASSWORD' );
$local = wp_insert_user( array( 'user_login' => 'legacy_shopper', 'user_pass' => $password,
	'user_email' => getenv( 'ALWP_FIXTURE_EMAIL' ) ?: 'shopper@example.test', 'role' => class_exists( 'WooCommerce' ) ? 'customer' : ( 'shopper@example.test' === getenv( 'ALWP_FIXTURE_EMAIL' ) ? 'editor' : 'subscriber' ) ) );
update_user_meta( $local, 'billing_address_1', 'Preserved fixture address' );
update_user_meta( $local, 'fixture_b2b_approved', 'yes' );
$order_id = 0;
if ( function_exists( 'wc_create_order' ) ) {
	$order = wc_create_order( array( 'customer_id' => $local ) ); $order->set_total( 73 ); $order->save(); $order_id = $order->get_id();
}
$account = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture account',
	'post_content' => '[accesslobby_account]' ) );
$protected = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture protected', 'post_content' => 'Fixture protected content' ) );
$restricted = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture local authorization', 'post_content' => 'Staff-only local resource' ) );
$frontend = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture frontend login', 'post_content' => '[fixture_local_login]' ) );
$woo_account = 0;
$checkout = 0;
$product_id = 0;
if ( class_exists( 'WooCommerce' ) ) {
	$woo_account = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'My account', 'post_content' => '[woocommerce_my_account]' ) );
	update_option( 'woocommerce_myaccount_page_id', $woo_account );
	$checkout = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture checkout', 'post_content' => '[woocommerce_checkout]' ) );
	$cart = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Fixture cart', 'post_content' => '[woocommerce_cart]' ) );
	update_option( 'woocommerce_checkout_page_id', $checkout );
	update_option( 'woocommerce_cart_page_id', $cart );
	update_option( 'woocommerce_enable_guest_checkout', 'yes' );
	update_option( 'woocommerce_enable_signup_and_login_from_checkout', 'yes' );
	update_option( 'woocommerce_enable_signup_from_checkout', 'no' );
	update_option( 'woocommerce_calc_taxes', 'no' );
	update_option( 'woocommerce_cod_settings', array( 'enabled' => 'yes', 'title' => 'Fixture payment on delivery', 'enable_for_virtual' => 'yes' ) );
	$product = new WC_Product_Simple();
	$product->set_name( 'Disposable virtual fixture product' );
	$product->set_status( 'publish' );
	$product->set_regular_price( '19.95' );
	$product->set_virtual( true );
	$product_id = $product->save();
}
update_option( 'alwp_fixture_protected', $protected );
update_option( 'alwp_fixture_restricted', $restricted );
$data = array( 'legacyUser' => $local, 'orderId' => $order_id, 'account' => get_permalink( $account ),
	'protected' => get_permalink( $protected ), 'restricted' => get_permalink( $restricted ), 'frontend' => get_permalink( $frontend ),
	'checkout' => $checkout ? get_permalink( $checkout ) : null, 'productId' => $product_id,
	'wooAccount' => $woo_account ? get_permalink( $woo_account ) : null );
update_option( 'alwp_fixture_data', $data );
WP_CLI::line( wp_json_encode( $data ) );
