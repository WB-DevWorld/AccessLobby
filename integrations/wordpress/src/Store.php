<?php
namespace AccessLobby\WordPress;

/** Site-local durable mapping, bounded private state and non-sensitive audit. */
final class Store {
	public function __construct( private readonly \wpdb $db ) {}

	public function table( string $suffix ): string {
		if ( ! in_array( $suffix, array( 'links', 'state', 'sessions', 'audit' ), true ) ) {
			throw new Failure( 'invalid_table' );
		}
		return $this->db->prefix . 'accesslobby_' . $suffix;
	}

	public function migrate(): void {
		if ( '1' === get_option( 'accesslobby_schema' ) ) {
			return;
		}
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset = $this->db->get_charset_collate();
		$links   = $this->table( 'links' );
		$state   = $this->table( 'state' );
		$session = $this->table( 'sessions' );
		$audit   = $this->table( 'audit' );
		dbDelta(
			"CREATE TABLE $links (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			identity_key char(64) NOT NULL,
			subject_key char(64) NOT NULL,
			issuer text NOT NULL,
			subject text NOT NULL,
			identity varchar(160) NOT NULL,
			user_id bigint unsigned NOT NULL,
			link_state varchar(16) NOT NULL,
			provenance varchar(32) NOT NULL,
			created_at bigint unsigned NOT NULL,
			updated_at bigint unsigned NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY identity_key (identity_key),
			UNIQUE KEY subject_key (subject_key),
			UNIQUE KEY user_id (user_id)
		) ENGINE=InnoDB $charset;"
		);
		dbDelta(
			"CREATE TABLE $state (
			state_key char(64) NOT NULL,
			kind varchar(24) NOT NULL,
			payload longtext NOT NULL,
			expires bigint unsigned NOT NULL,
			PRIMARY KEY  (state_key),
			KEY expires (expires)
		) ENGINE=InnoDB $charset;"
		);
		dbDelta(
			"CREATE TABLE $session (
			token_key char(64) NOT NULL,
			sid_key char(64) NOT NULL,
			subject_key char(64) NOT NULL,
			user_id bigint unsigned NOT NULL,
			sealed_token longtext NOT NULL,
			expires bigint unsigned NOT NULL,
			PRIMARY KEY  (token_key),
			KEY sid_key (sid_key),
			KEY user_id (user_id),
			KEY expires (expires)
		) ENGINE=InnoDB $charset;"
		);
		dbDelta(
			"CREATE TABLE $audit (
			id bigint unsigned NOT NULL AUTO_INCREMENT,
			event varchar(64) NOT NULL,
			user_id bigint unsigned NOT NULL DEFAULT 0,
			request_id char(36) NOT NULL,
			created_at bigint unsigned NOT NULL,
			PRIMARY KEY  (id),
			KEY created_at (created_at)
		) ENGINE=InnoDB $charset;"
		);
		foreach ( array( $links, $state, $session, $audit, $this->db->users, $this->db->usermeta ) as $table ) {
			$engine = $this->db->get_var( $this->db->prepare( 'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s', $table ) );
			if ( 'InnoDB' !== $engine ) {
				throw new Failure( 'transactional_tables_required' );
			}
		}
		update_option( 'accesslobby_schema', '1', false );
	}

	public function lock( string $name, callable $operation ): mixed {
		$key = 'alwp:' . hash( 'sha256', DB_NAME . $this->db->prefix . $name );
		$key = substr( $key, 0, 64 );
		if ( '1' !== (string) $this->db->get_var( $this->db->prepare( 'SELECT GET_LOCK(%s, 5)', $key ) ) ) {
			throw new Failure( 'retry_concurrent_operation' );
		}
		try {
			return $operation();
		} finally {
			$this->db->get_var( $this->db->prepare( 'SELECT RELEASE_LOCK(%s)', $key ) );
		}
	}

	public function transaction( callable $operation ): mixed {
		$this->db->query( 'START TRANSACTION' );
		try {
			$result = $operation();
			if ( false === $this->db->query( 'COMMIT' ) ) {
				throw new Failure( 'storage_unavailable' );
			}
			return $result;
		} catch ( \Throwable $e ) {
			$this->db->query( 'ROLLBACK' );
			throw $e;
		}
	}

	public function state_put( string $key, string $kind, array $data, int $seconds ): void {
		if ( false === $this->db->insert(
			$this->table( 'state' ),
			array(
				'state_key' => hash( 'sha256', $key ),
				'kind'      => $kind,
				'payload'   => Security::seal( $data ),
				'expires'   => time() + $seconds,
			)
		) ) {
			throw new Failure( 'storage_unavailable_or_replay' );
		}
	}

	public function state_get( string $key, string $kind, bool $consume = false ): array {
		$table = $this->table( 'state' );
		$row   = $this->db->get_row( $this->db->prepare( "SELECT * FROM $table WHERE state_key=%s AND kind=%s AND expires>%d", hash( 'sha256', $key ), $kind, time() ), ARRAY_A );
		if ( ! $row ) {
			throw new Failure( 'expired_or_replayed_flow' );
		}
		if ( $consume && 1 !== $this->db->delete(
			$table,
			array(
				'state_key' => $row['state_key'],
				'kind'      => $kind,
			)
		) ) {
			throw new Failure( 'expired_or_replayed_flow' );
		}
		return Security::open( $row['payload'] );
	}

	public function has_state( string $key, string $kind ): bool {
		try {
			$this->state_get( $key, $kind );
			return true;
		} catch ( Failure $e ) {
			return false;
		}
	}

	public function audit( string $event, int $user = 0 ): void {
		$event = preg_replace( '/[^a-z0-9_]/', '', $event );
		$id    = wp_generate_uuid4();
		$this->db->insert(
			$this->table( 'audit' ),
			array(
				'event'      => substr( $event, 0, 64 ),
				'user_id'    => $user,
				'request_id' => $id,
				'created_at' => time(),
			)
		);
		do_action(
			'accesslobby_audit',
			array(
				'event'     => $event,
				'userId'    => $user,
				'requestId' => $id,
				'clientId'  => Config::get()['client_id'],
				'version'   => ACCESSLOBBY_WP_VERSION,
			)
		);
	}

	public function link_for_user( int $user ): ?array {
		$table = $this->table( 'links' );
		$row   = $this->db->get_row( $this->db->prepare( 'SELECT * FROM %i WHERE user_id=%d', $table, $user ), ARRAY_A );
		return $row ? $row : null;
	}

	public function resolve( array $identity, array $config, int $local_user = 0 ): int {
		return $this->lock(
			'links',
			fn() => $this->transaction(
				function () use ( $identity, $config, $local_user ) {
					$table   = $this->table( 'links' );
					$ik      = hash( 'sha256', $identity['issuer'] . "\0" . $identity['identity'] );
					$sk      = hash( 'sha256', $identity['issuer'] . "\0" . $identity['subject'] );
					$by_id   = $this->db->get_row( $this->db->prepare( "SELECT * FROM $table WHERE identity_key=%s", $ik ), ARRAY_A );
					$by_sub  = $this->db->get_row( $this->db->prepare( "SELECT * FROM $table WHERE subject_key=%s", $sk ), ARRAY_A );
					$by_user = $local_user ? $this->link_for_user( $local_user ) : null;
					if ( ( $by_sub && ( $by_sub['identity_key'] !== $ik || $by_sub['subject'] !== $identity['subject'] ) ) ||
						( $by_user && $by_user['identity_key'] !== $ik ) ||
						( $by_id && ( $by_id['issuer'] !== $identity['issuer'] || $by_id['identity'] !== $identity['identity'] ||
							( $local_user && (int) $by_id['user_id'] !== $local_user ) ) ) ) {
						throw new Failure( 'account_link_conflict' );
					}
				if ( $by_id ) {
					if ( ! get_userdata( (int) $by_id['user_id'] ) || ( 'active' !== $by_id['link_state'] && ! $local_user ) ) {
						throw new Failure( 'account_link_required' );
					}
					if ( false === $this->db->update(
						$table,
						array(
							'subject_key' => $sk,
							'subject'     => $identity['subject'],
							'link_state'  => 'active',
							'updated_at'  => time(),
						),
						array( 'id' => $by_id['id'] )
					) ) {
						throw new Failure( 'account_link_conflict' );
					}
					if ( $by_id['subject'] !== $identity['subject'] ) {
						$this->audit( 'subject_continuity_verified', (int) $by_id['user_id'] );
					}
					return (int) $by_id['user_id'];
					}
					$provenance = 'dual_proof';
				if ( ! $local_user ) {
					if ( ! $config['jit'] ) {
						throw new Failure( 'account_link_required' );
					}
					Config::safe_role( $config['default_role'] );
					if ( ! $identity['email_verified'] || ! is_email( $identity['email'] ) ) {
						throw new Failure( 'verified_email_required' );
					}
					if ( email_exists( $identity['email'] ) ) {
						throw new Failure( 'account_link_required' );
					}
					// No attribute-derived login names and no password/hash synchronization.
					$local_user = wp_insert_user(
						array(
							'user_login'   => 'al_' . substr( $ik, 0, 28 ),
							'user_pass'    => wp_generate_password( 64, true, true ),
							'user_email'   => $identity['email'],
							'role'         => $config['default_role'],
							'display_name' => __(
								'AccessLobby user',
								'accesslobby-sso'
							),
						)
					);
					if ( is_wp_error( $local_user ) ) {
						throw new Failure( 'local_account_creation_failed' );
					}
					$provenance = 'validated_jit';
					}
					if ( ! get_userdata( $local_user ) || false === $this->db->insert(
						$table,
						array(
							'identity_key' => $ik,
							'subject_key'  => $sk,
							'issuer'       => $identity['issuer'],
							'subject'      => $identity['subject'],
							'identity'     => $identity['identity'],
							'user_id'      => $local_user,
							'link_state'   => 'active',
							'provenance'   => $provenance,
							'created_at'   => time(),
							'updated_at'   => time(),
						)
					) ) {
						throw new Failure( 'account_link_conflict' );
						}
					$this->audit( 'dual_proof' === $provenance ? 'account_linked' : 'account_provisioned', $local_user );
					return $local_user;
					}
			)
		);
	}

	public function unlink( int $user, array $identity ): void {
		$this->lock(
			'links',
			function () use ( $user, $identity ) {
				$link = $this->link_for_user( $user );
				if ( ! $link || $link['issuer'] !== $identity['issuer'] || $link['identity'] !== $identity['identity'] ) {
					throw new Failure( 'account_link_conflict' );
				}
				$this->db->update(
					$this->table( 'links' ),
					array(
						'link_state' => 'unlinked',
						'updated_at' => time(),
					),
					array( 'user_id' => $user )
				);
				$this->audit( 'account_unlinked', $user );
			}
		);
	}

	public function sessions( string $sid_key ): array {
		$table = $this->table( 'sessions' );
		return $this->db->get_results( $this->db->prepare( "SELECT * FROM $table WHERE sid_key=%s", $sid_key ), ARRAY_A );
	}

	public function save_session( array $row ): void {
		if ( false === $this->db->insert( $this->table( 'sessions' ), $row ) ) {
			throw new Failure( 'session_storage_failed' );
		}
	}

	public function remove_session( string $key ): void {
		$this->db->delete( $this->table( 'sessions' ), array( 'token_key' => $key ) );
	}

	public function purge(): void {
		foreach ( array( 'state', 'sessions' ) as $suffix ) {
			$table = $this->table( $suffix );
			$this->db->query( $this->db->prepare( "DELETE FROM $table WHERE expires<%d", time() ) );
		}
		$table = $this->table( 'audit' );
		$this->db->query( $this->db->prepare( "DELETE FROM $table WHERE created_at<%d", time() - 90 * DAY_IN_SECONDS ) );
	}

	public function readiness_counts(): array {
		$table               = $this->table( 'links' );
		$total               = (int) $this->db->get_var( "SELECT COUNT(*) FROM {$this->db->users}" );
		$linked              = (int) $this->db->get_var( "SELECT COUNT(*) FROM $table WHERE link_state='active'" );
		$privileged          = get_users(
			array(
				'role__in' => array( 'administrator', 'editor', 'shop_manager' ),
				'fields'   => 'ID',
			)
		);
		$unlinked_privileged = 0;
		foreach ( $privileged as $id ) {
			$l = $this->link_for_user( (int) $id );
			if ( ! $l || 'active' !== $l['link_state'] ) {
				++$unlinked_privileged;
			}
		}
		return array(
			'total'               => $total,
			'linked'              => $linked,
			'unlinked'            => max( 0, $total - $linked ),
			'unlinked_privileged' => $unlinked_privileged,
		);
	}
}
