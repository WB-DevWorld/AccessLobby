<?php
/** Test-only prerequisite fault injection; never packaged. */
namespace AccessLobby\WordPress;

function extension_loaded( string $name ): bool {
	return \extension_loaded( $name ) && ! ( \defined( 'ACCESSLOBBY_FIXTURE' ) && ACCESSLOBBY_FIXTURE &&
		'sodium' === $name && \get_option( 'alwp_fixture_unavailable' ) );
}
