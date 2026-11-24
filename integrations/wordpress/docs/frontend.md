# Frontend and membership integration

The primary modes remain WordPress + AccessLobby and AccessLobby only. Theme source edits are unnecessary.

Select dedicated published login pages in Settings → AccessLobby → Frontend login pages. Enforced mode redirects unauthenticated entry server-side with private/no-store headers, preserving a safe site-local `redirect_to`. Without one, it returns to the site home. Authenticated people may open the page normally. Deleting/unpublishing a selected page does not disable unrelated SSO routes.

A login shortcode or block may appear on a public page or in a footer. Its presence alone does not force authentication. Supported visible credential forms retain the frontend adapter; unregistered custom forms should use the API below or register their dedicated login page. Pages/CDN responses used for authentication must be excluded from caching; an origin no-store header cannot purge an already cached CDN object.

Membership or custom plugin adapters may filter `accesslobby_is_login_page` during `template_redirect` after WordPress has resolved its query. Return true only for a dedicated interactive login page. Do not return true for the whole site or machine routes. `accesslobby_is_auth_surface` marks other dynamic account pages private without forcing sign-in. Neither filter grants membership, a WordPress role or protected-content entitlement.

Use `[accesslobby_login]`, `[accesslobby_login intent="join"]`, `[accesslobby_account]`, the AccessLobby login block, existing template helpers or `do_action( 'accesslobby_login' )` where a manual action is appropriate. These work across themes. Register exact callback/logout URLs from settings; never construct root-only URLs.

The root and subdirectory fixtures exercise selected shortcode/block pages without JavaScript, protected return targets, foreign-return rejection and unselected public entry pages. Actual WoodMart/B2BKing/membership plugin certification requires its installed runtime; a generic adapter test is not that certification.
