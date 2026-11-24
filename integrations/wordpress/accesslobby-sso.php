<?php
/**
 * Plugin Name: AccessLobby SSO for WordPress
 * Description: AccessLobby authentication with explicit local account linking and site-owned authorization.
 * Version: 0.1.0-alpha.8
 * Requires at least: 6.9
 * Requires PHP: 8.3
 * Author: AccessLobby
 * License: GPL-2.0-or-later
 * Text Domain: accesslobby-sso
 */

defined( 'ABSPATH' ) || exit;

define( 'ACCESSLOBBY_WP_VERSION', '0.1.0-alpha.8' );
define( 'ACCESSLOBBY_WP_FILE', __FILE__ );

require_once __DIR__ . '/autoload.php';
require_once __DIR__ . '/functions.php';

register_activation_hook( __FILE__, array( AccessLobby\WordPress\Plugin::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( AccessLobby\WordPress\Plugin::class, 'deactivate' ) );
add_action(
	'plugins_loaded',
	static function () {
		AccessLobby\WordPress\Plugin::boot();
	}
);
