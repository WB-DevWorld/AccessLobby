# Logout and availability

Supported core/WooCommerce logout URLs open a choice. Both operations require a valid current WP session and POST nonce.

**Sign out of this site** ends only the current local WordPress session. AccessLobby and other applications stay signed in. Re-entering can reuse SSO without credentials. The signed-out page never automatically re-enters.

**Sign out of all connected apps** clears the initiating local session and requests issuer logout for this browser. It sends client ID, exact registered return URL and state; no token is put into a URL. The issuer can ask for confirmation without an ID-token hint. Returning verifies state/browser binding. Cancellation/interruption does not prove shared logout completed. The UI does not claim every device was signed out.

The exact public REST backchannel endpoint permits unauthenticated transport because its authority is the signed logout JWT, not a WordPress nonce. It verifies pinned keys/RS256, issuer, audience, fresh iat, valid expiry if supplied, exact empty event object, sid/jti and absence of nonce. Replay is durably rejected. sid tombstones serialize with local session creation. Only matching session associations are destroyed; other devices/local sessions stay valid. WordPress session tokens needed for targeted destruction are encrypted with WordPress salts.

A missed notification to an unavailable site cannot instantly remove its local session. Connector-issued sessions last at most one hour and never longer than the validated ID/access tokens. No refresh tokens are retained. Admission is checked at sign-in; immediate mid-session admission revocation is not promised. Restricted/high-risk deployments need an approved continuing admission/revocation check or durable delivery mechanism before production.

If AccessLobby is unavailable, hybrid local login remains usable. New SSO login fails closed in either mode. Enforced mode retains only configured host recovery, while existing WP sessions expire normally. If shared logout discovery fails, no false shared-logout success is reported; choose site-only or retry when connectivity returns.
