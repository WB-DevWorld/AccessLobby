<?php
/** Isolated runtime autoloader: never imports another plugin's JWT dependency. */
spl_autoload_register(
	static function ( string $class_name ): void {
		$prefix = 'AccessLobby\\WordPress\\';
		if ( ! str_starts_with( $class_name, $prefix ) ) {
			return;
		}
		$relative = substr( $class_name, strlen( $prefix ) );
		$base     = __DIR__ . '/src/';
		if ( str_starts_with( $relative, 'Vendor\\JWT\\' ) ) {
			$relative = substr( $relative, strlen( 'Vendor\\JWT\\' ) );
			$base     = __DIR__ . '/vendor-prefixed/jwt/';
		}
		$file = $base . str_replace( '\\', '/', $relative ) . '.php';
		if ( is_file( $file ) ) {
			require_once $file;
		}
	}
);
