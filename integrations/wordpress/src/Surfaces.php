<?php
namespace AccessLobby\WordPress;

final class Surfaces {
	public function __construct( private readonly Store $store ) {}

	public function register(): void {
		add_action( 'login_form', array( $this, 'button' ) );
		add_action( 'register_form', array( $this, 'join_button' ) );
		add_filter( 'login_form_top', fn( $content ) => $content . $this->button_html() );
		add_action( 'woocommerce_login_form_start', array( $this, 'button' ) );
		add_action( 'woocommerce_register_form_start', array( $this, 'join_button' ) );
		add_action( 'woocommerce_account_dashboard', array( $this, 'account_actions' ) );
		add_action( 'show_user_profile', array( $this, 'own_profile' ) );
		add_action( 'admin_footer-profile.php', array( $this, 'profile_form' ) );
		add_action( 'accesslobby_login', array( $this, 'button' ) );
		add_action( 'accesslobby_account_actions', array( $this, 'account_actions' ) );
		add_shortcode( 'accesslobby_login', fn( $atts ) => $this->button_html( 'join' === ( $atts['intent'] ?? '' ) ? 'join' : 'login' ) );
		add_shortcode(
			'accesslobby_account',
			function () {
				ob_start();
				$this->account_actions();
				return ob_get_clean();
			}
		);
		add_filter( 'logout_url', static fn() => Config::route( 'logout' ) );
		add_filter( 'login_url', array( $this, 'login_url' ), 20, 3 );
		add_filter( 'register_url', fn( $url ) => 'enforced' === Config::get()['mode'] ? add_query_arg( 'intent', 'join', Config::route( 'start' ) ) : $url );
		add_filter( 'lostpassword_url', fn( $url ) => 'enforced' === Config::get()['mode'] ? Config::route( 'start' ) : $url );
		add_action( 'template_redirect', array( $this, 'frontend_redirect' ), 1 );
		add_action( 'template_redirect', array( $this, 'private_surfaces' ), 0 );
		add_filter( 'authenticate', array( $this, 'password_policy' ), PHP_INT_MAX, 3 );
		add_action( 'wp_enqueue_scripts', array( $this, 'assets' ) );
		add_action( 'login_enqueue_scripts', array( $this, 'assets' ) );
		add_action(
			'init',
			function () {
				wp_register_script( 'accesslobby-block', plugins_url( 'blocks/login/editor.js', ACCESSLOBBY_WP_FILE ), array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n' ), ACCESSLOBBY_WP_VERSION, true );
				register_block_type( dirname( ACCESSLOBBY_WP_FILE ) . '/blocks/login', array( 'render_callback' => fn( $atts ) => $this->button_html( 'join' === ( $atts['intent'] ?? '' ) ? 'join' : 'login' ) ) );
			}
		);
	}

	public function button_html( string $intent = 'login' ): string {
		if ( is_user_logged_in() ) {
			return '';
		}
		$destination = home_url( '/' );
		if ( ! empty( $_SERVER['REQUEST_URI'] ) && is_string( $_SERVER['REQUEST_URI'] ) ) {
			$destination = Security::destination( Security::origin( home_url() ) . wp_unslash( $_SERVER['REQUEST_URI'] ), home_url( '/' ), site_url( '/' ) );
		}
		if ( isset( $_REQUEST['redirect_to'] ) && is_string( $_REQUEST['redirect_to'] ) ) {
			$destination = Security::destination( wp_unslash( $_REQUEST['redirect_to'] ), home_url( '/' ), site_url( '/' ) );
		}
		$url = add_query_arg(
			array(
				'intent'      => $intent,
				'redirect_to' => $destination,
			),
			Config::route( 'start' )
		);
		return '<p class="accesslobby-login"><a class="button accesslobby-button" data-accesslobby-start href="' . esc_url( $url ) . '">' . esc_html__( 'Continue with AccessLobby', 'accesslobby-sso' ) . '</a></p>';
	}

	public function button(): void {
		echo wp_kses_post( $this->button_html() ); }
	public function join_button(): void {
		echo wp_kses_post( $this->button_html( 'join' ) ); }

	public function own_profile( \WP_User $user ): void {
		if ( get_current_user_id() === $user->ID ) {
			$this->render_account( true );
		}
	}

	public function account_actions(): void {
		$this->render_account( false );
	}

	private function render_account( bool $profile ): void {
		if ( ! is_user_logged_in() ) {
			return;
		}
		$link   = $this->store->link_for_user( get_current_user_id() );
		$active = $link && 'active' === $link['link_state'];
		echo '<section class="accesslobby-account"><h2>' . esc_html__( 'AccessLobby', 'accesslobby-sso' ) . '</h2><p>' . esc_html( $active ? __( 'Connected. Your site account and permissions stay here.', 'accesslobby-sso' ) : __( 'Connect your existing account to use AccessLobby next time.', 'accesslobby-sso' ) ) . '</p>';
		if ( ! $active || 'hybrid' === Config::get()['mode'] ) {
			$intent = $active ? 'unlink' : 'link';
			if ( $profile ) {
				// Native form association avoids nesting a second form inside WordPress's profile form.
				echo '<button type="submit" class="button" form="alwp-profile-link">' . esc_html( $active ? __( 'Disconnect AccessLobby', 'accesslobby-sso' ) : __( 'Connect AccessLobby', 'accesslobby-sso' ) ) . '</button>';
			} else {
				$destination = Security::origin( home_url() ) . ( $_SERVER['REQUEST_URI'] ?? '/' );
				$this->link_form( $intent, '', Security::destination( $destination, home_url( '/' ), site_url( '/' ) ) );
			}
		}
		echo '</section>';
	}

	public function profile_form(): void {
		if ( ! is_user_logged_in() ) {
			return; }
		$link   = $this->store->link_for_user( get_current_user_id() );
		$active = $link && 'active' === $link['link_state'];
		if ( ! $active || 'hybrid' === Config::get()['mode'] ) {
			$this->link_form( $active ? 'unlink' : 'link', 'alwp-profile-link', get_edit_profile_url() );
		}
	}

	private function link_form( string $intent, string $id, string $destination ): void {
		$external = '' !== $id;
		echo '<form method="post" action="' . esc_url( Config::route( 'start' ) ) . '"' . ( $external ? ' id="' . esc_attr( $id ) . '" hidden' : '' ) . '>';
		echo '<input type="hidden" name="intent" value="' . esc_attr( $intent ) . '"><input type="hidden" name="redirect_to" value="' . esc_url( $destination ) . '">';
		wp_nonce_field( 'alwp_' . $intent );
		if ( ! $external ) {
			echo '<button class="button">' . esc_html( 'unlink' === $intent ? __( 'Disconnect AccessLobby', 'accesslobby-sso' ) : __( 'Connect AccessLobby', 'accesslobby-sso' ) ) . '</button>';
		}
		echo '</form>';
	}

	public function login_url( string $url, string $redirect = '', bool $reauth = false ): string {
		if ( 'enforced' !== Config::get()['mode'] ) {
			return $url;
		}
		return add_query_arg( 'redirect_to', Security::destination( $redirect, home_url( '/' ), site_url( '/' ) ), Config::route( 'start' ) );
	}

	public function frontend_redirect(): void {
		if ( function_exists( 'is_wc_endpoint_url' ) && is_wc_endpoint_url( 'customer-logout' ) ) {
			wp_safe_redirect( Config::route( 'logout' ), 303 );
			exit;
		}
		if ( is_user_logged_in() || 'enforced' !== Config::get()['mode'] || wp_doing_ajax() ) {
			return;
		}
		// Do not intercept checkout: anonymous purchasing remains a local WooCommerce policy.
		if ( function_exists( 'is_account_page' ) && is_account_page() ) {
			Security::private_headers();
			$destination = Security::origin( home_url() ) . ( $_SERVER['REQUEST_URI'] ?? '/' );
			wp_safe_redirect( add_query_arg( 'redirect_to', Security::destination( $destination, home_url( '/' ), site_url( '/' ) ), Config::route( 'start' ) ), 303 );
			exit;
		}
	}

	public function private_surfaces(): void {
		$post    = get_queried_object();
		$account = function_exists( 'is_account_page' ) && is_account_page();
		$content = $post instanceof \WP_Post ? $post->post_content : '';
		$known   = $account || has_shortcode( $content, 'accesslobby_account' ) ||
			has_shortcode( $content, 'accesslobby_login' ) || has_block( 'accesslobby/login', $content );
		if ( apply_filters( 'accesslobby_is_auth_surface', $known ) ) {
			Security::private_headers();
		}
	}

	public function password_policy( mixed $user, string $username = '', string $password = '' ): mixed {
		$c = Config::get();
		if ( 'enforced' !== $c['mode'] ) {
			return $user;
		}
		$machine = ( defined( 'REST_REQUEST' ) && REST_REQUEST ) || ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) ||
			( defined( 'WP_CLI' ) && WP_CLI ) || wp_doing_cron();
		if ( $machine && $c['machine_auth'] ) {
			return $user;
		}
		return new \WP_Error( 'accesslobby_sso_required', __( 'Use AccessLobby to sign in to this site.', 'accesslobby-sso' ) );
	}

	public function assets(): void {
		wp_enqueue_style( 'accesslobby-sso', plugins_url( 'assets/login.css', ACCESSLOBBY_WP_FILE ), array(), ACCESSLOBBY_WP_VERSION );
		if ( ! is_user_logged_in() ) {
			wp_enqueue_script( 'accesslobby-sso', plugins_url( 'assets/login.js', ACCESSLOBBY_WP_FILE ), array(), ACCESSLOBBY_WP_VERSION, true );
			wp_add_inline_script(
				'accesslobby-sso',
				'window.accessLobbyWordPress=' . wp_json_encode(
					array(
						'mode'  => Config::get()['mode'],
						'start' => Config::route( 'start' ),
						'label' => __( 'Continue with AccessLobby', 'accesslobby-sso' ),
					)
				) . ';',
				'before'
			);
		}
	}
}
