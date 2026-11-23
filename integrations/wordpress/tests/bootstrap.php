<?php
require_once dirname( __DIR__ ) . '/autoload.php';
function wp_salt( $scheme = 'auth' ) { return 'disposable-test-salt-' . $scheme; }
function wp_json_encode( $value ) { return json_encode( $value, JSON_THROW_ON_ERROR ); }
function wp_get_environment_type() { return 'production'; }
