# Logout and availability

Supported core/WooCommerce logout URLs open a choice. Both operations require a valid current WP session and POST nonce.

**Sign out of this site** ends only the current local WordPress session. AccessLobby and other applications stay signed in. Re-entering can reuse SSO without credentials. The signed-out page never automatically re-enters.

**Sign out of all connected apps** records shared-browser revocation when the negotiated receipt is available, clears the initiating local session and requests issuer logout. It sends client ID, exact registered return URL and state; no token is put into a URL. The issuer can ask for confirmation without an ID-token hint. Returning verifies state/browser binding. Cancellation after the marker can already end participating app access; interruption does not prove issuer SSO ended. The UI does not claim every device was signed out.

The exact public REST backchannel endpoint permits unauthenticated transport because its authority is the signed logout JWT, not a WordPress nonce. It verifies pinned keys/RS256, issuer, audience, fresh iat, valid expiry if supplied, exact empty event object, sid/jti and absence of nonce. Replay is durably rejected. sid tombstones serialize with local session creation. Only matching session associations are destroyed; other devices/local sessions stay valid. WordPress session tokens needed for targeted destruction are encrypted with WordPress salts.

A missed notification cannot instantly remove an unavailable site's cookie. Alpha.4 negotiates an opaque receipt, stores it encrypted server-side and normally rechecks every 30 seconds. The API checks durable shared logout, token/receipt expiry, active person/client and current app admission. Confirmed denial removes only that matching WordPress token. Replies expose no person/subject/session identifier. The source app must record a marker or the API must receive the issuer event; an unupdated initiator cannot provide this guarantee.

During status-service failure, receipt-backed sessions receive at most 90 seconds since the last successful validation, then authenticated access fails closed. The cookie is retained for recovery and never extended; restoring the service can resume the same still-valid session. Local/emergency and machine authentication retain separate policy. Sessions last at most one hour and never longer than validated ID/access tokens; no refresh token is retained. This is bounded request-time reconciliation, not immediate push revocation.

Older APIs without the optional receipt and pre-upgrade sessions retain expiry/backchannel behavior until reauthentication. Malformed advertised receipts fail closed. Diagnostics report availability. Keep additive server tables through rollback; restore the previous plugin if the API is rolled back and fresh receipt checks become unavailable.

If AccessLobby is unavailable, hybrid local login remains usable. New SSO login fails closed in either mode. Enforced mode retains only configured host recovery. Receipt-backed sessions follow the grace above; legacy sessions expire normally. If shared logout discovery/marker fails, no false shared-logout success is reported; choose site-only or retry when connectivity returns.
