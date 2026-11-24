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
		if ( '2' === get_option( 'accesslobby_schema' ) ) {
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
			reference_hash char(64) NOT NULL DEFAULT '',
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
		$this->verify_schema();
		update_option( 'accesslobby_schema', '2', false );
	}

	private function verify_schema(): void {
		$definitions = array(
			'links'    => array(
				'columns' => array( 'id', 'identity_key', 'subject_key', 'issuer', 'subject', 'identity', 'user_id', 'link_state', 'provenance', 'created_at', 'updated_at' ),
				'unique'  => array(
					'PRIMARY'      => 'id',
					'identity_key' => 'identity_key',
					'subject_key'  => 'subject_key',
					'user_id'      => 'user_id',
				),
			),
			'state'    => array(
				'columns' => array( 'state_key', 'kind', 'payload', 'expires' ),
				'unique'  => array( 'PRIMARY' => 'state_key' ),
			),
			'sessions' => array(
				'columns' => array( 'token_key', 'sid_key', 'subject_key', 'user_id', 'sealed_token', 'expires' ),
				'unique'  => array( 'PRIMARY' => 'token_key' ),
			),
			'audit'    => array(
				'columns' => array( 'id', 'event', 'user_id', 'request_id', 'reference_hash', 'created_at' ),
				'unique'  => array( 'PRIMARY' => 'id' ),
			),
		);
		foreach ( $definitions as $suffix => $definition ) {
			$table   = $this->table( $suffix );
			$columns = $this->db->get_col( $this->db->prepare( 'SHOW COLUMNS FROM %i', $table ) );
			if ( array_diff( $definition['columns'], $columns ) ) {
				throw new Failure( 'incomplete_schema_migration' );
			}
			$indexes = array();
			foreach ( $this->db->get_results( $this->db->prepare( 'SHOW INDEX FROM %i', $table ), ARRAY_A ) as $index ) {
				$indexes[ $index['Key_name'] ][] = $index;
			}
			foreach ( $definition['unique'] as $name => $column ) {
				$rows = $indexes[ $name ] ?? array();
				if ( 1 !== count( $rows ) || '0' !== (string) $rows[0]['Non_unique'] || $column !== $rows[0]['Column_name'] ) {
					throw new Failure( 'incomplete_schema_migration' );
				}
			}
		}
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
		if ( false === $this->db->query( 'START TRANSACTION' ) ) {
			throw new Failure( 'storage_unavailable' );
		}
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
		if ( '' !== $this->db->last_error ) {
			throw new Failure( 'storage_unavailable' );
		}
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
			if ( 'expired_or_replayed_flow' === $e->getMessage() ) {
				return false;
			}
			throw $e;
		}
	}

	public function audit( string $event, int $user = 0, string $reference = '' ): void {
		$event          = preg_replace( '/[^a-z0-9_]/', '', $event );
		$id             = wp_generate_uuid4();
		$reference_hash = '' === $reference ? '' : hash( 'sha256', $reference );
		if ( false === $this->db->insert(
			$this->table( 'audit' ),
			array(
				'event'          => substr( $event, 0, 64 ),
				'user_id'        => $user,
				'request_id'     => $id,
				'reference_hash' => $reference_hash,
				'created_at'     => time(),
			)
		) ) {
			throw new Failure( 'audit_storage_unavailable' );
		}
		do_action(
			'accesslobby_audit',
			array(
				'event'         => $event,
				'userId'        => $user,
				'requestId'     => $id,
				'referenceHash' => $reference_hash,
				'clientId'      => Config::get()['client_id'],
				'version'       => ACCESSLOBBY_WP_VERSION,
			)
		);
	}

	public function link_for_user( int $user ): ?array {
		$table = $this->table( 'links' );
		$row   = $this->db->get_row( $this->db->prepare( 'SELECT * FROM %i WHERE user_id=%d', $table, $user ), ARRAY_A );
		return $row ? $row : null;
	}

	public function resolve( array $identity, array $config, int $local_user = 0 ): int {
		$created_user = 0;
		try {
			return $this->lock(
				'links',
				function () use ( $identity, $config, $local_user, &$created_user ) {
					return $this->transaction(
						function () use ( $identity, $config, $local_user, &$created_user ) {
							$table   = $this->table( 'links' );
							$ik      = hash( 'sha256', $identity['issuer'] . "\0" . $identity['identity'] );
							$sk      = hash( 'sha256', $identity['issuer'] . "\0" . $identity['subject'] );
							$by_id   = $this->db->get_row( $this->db->prepare( 'SELECT * FROM %i WHERE identity_key=%s', $table, $ik ), ARRAY_A );
							$by_sub  = $this->db->get_row( $this->db->prepare( 'SELECT * FROM %i WHERE subject_key=%s', $table, $sk ), ARRAY_A );
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
								if ( $local_user ) {
									$this->audit( 'account_link_confirmed', $local_user );
								}
								return (int) $by_id['user_id'];
							}
							$provenance = 'dual_proof';
							if ( ! $local_user ) {
								if ( ! $config['jit'] ) {
									throw new Failure( 'account_link_required' ); }
								Config::safe_role( $config['default_role'] );
								if ( ! $identity['email_verified'] || ! is_email( $identity['email'] ) ) {
									throw new Failure( 'verified_email_required' );
								}
								if ( email_exists( $identity['email'] ) ) {
									throw new Failure( 'account_link_required' ); }
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
									throw new Failure( 'local_account_creation_failed' ); }
								$created_user = $local_user;
								$new_user     = get_userdata( $local_user );
								// Late insertion/registration hooks run after core's initial login checks.
								if ( ! $new_user || '' === trim( (string) $new_user->user_login ) ||
									array( $config['default_role'] ) !== $new_user->roles || self::privileged( $new_user ) ) {
									throw new Failure( 'unsafe_provisioning_result' );
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
								throw new Failure( 'account_link_conflict' ); }
							$this->audit( 'dual_proof' === $provenance ? 'account_linked' : 'account_provisioned', $local_user );
							return $local_user;
						}
					);
				}
			);
		} catch ( \Throwable $error ) {
			if ( $created_user ) {
				clean_user_cache( $created_user ); }
			throw $error;
		}
	}

	public static function privileged( \WP_User $user ): bool {
		foreach ( $user->allcaps as $capability => $enabled ) {
			if ( $enabled && ! in_array( $capability, array( 'read', 'level_0' ), true ) &&
				! in_array( $capability, $user->roles, true ) ) {
				return true; }
		}
		return false;
	}

	public function unlink( int $user, array $identity ): void {
		$this->lock(
			'links',
			fn() => $this->transaction(
				function () use ( $user, $identity ) {
					$link = $this->link_for_user( $user );
					if ( ! $link || $link['issuer'] !== $identity['issuer'] || $link['identity'] !== $identity['identity'] ) {
						throw new Failure( 'account_link_conflict' );
					}
				if ( false === $this->db->update(
					$this->table( 'links' ),
					array(
						'link_state' => 'unlinked',
						'updated_at' => time(),
					),
					array( 'user_id' => $user )
				) ) {
					throw new Failure( 'storage_unavailable' );
					}
					$this->audit( 'account_unlinked', $user );
				}
			)
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

	public function session_for_token( string $key ): ?array {
		$row = $this->db->get_row( $this->db->prepare( 'SELECT * FROM %i WHERE token_key=%s', $this->table( 'sessions' ), $key ), ARRAY_A );
		if ( '' !== $this->db->last_error ) {
			throw new Failure( 'session_storage_unavailable' );
		}
		return $row ? $row : null;
	}

	public function update_session_private( string $key, array $data ): bool {
		$result = $this->db->update( $this->table( 'sessions' ), array( 'sealed_token' => Security::seal( $data ) ), array( 'token_key' => $key ) );
		if ( false === $result ) {
			throw new Failure( 'session_storage_unavailable' );
		}
		return $result > 0;
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
		$total               = (int) $this->db->get_var( $this->db->prepare( 'SELECT COUNT(*) FROM %i', $this->db->users ) );
		$linked_ids          = $this->db->get_col(
			$this->db->prepare(
				"SELECT l.user_id FROM %i l JOIN %i u ON l.user_id=u.ID WHERE l.link_state='active'",
				$table,
				$this->db->users
			)
		);
		$linked              = array_fill_keys( $linked_ids, true );
		$unlinked_privileged = 0;
		$page                = 1;
		do {
			$users = get_users(
				array(
					'number' => 200,
					'paged'  => $page++,
					'fields' => 'all',
				)
			);
			foreach ( $users as $user ) {
				if ( ! isset( $linked[ $user->ID ] ) && self::privileged( $user ) ) {
					++$unlinked_privileged; }
			}
		} while ( count( $users ) === 200 );
		return array(
			'total'               => $total,
			'linked'              => count( $linked ),
			'unlinked'            => $total - count( $linked ),
			'unlinked_privileged' => $unlinked_privileged,
		);
	}
}
