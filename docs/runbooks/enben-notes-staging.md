# Enben Notes: connect a small test app

The owner approved `enben.realjanelove.com` as an empty test-app hostname on October 1, 2026. Enben is a small notes app, deployed separately from the working consumer pilot. It lets us test one simple rule: **you can open your own private note; a different account cannot**. It also tests app entry and the two sign-out choices. This is partial progress on [#44](https://github.com/WB-DevWorld/AccessLobby/issues/44).

Notes, app accounts and sessions live in server memory. Restarting Enben deletes them. This is a disposable test app: do not use it for important notes. It creates no new IAM realm, database, offline authority or public-post system. It uses the existing independent consumer's Code + PKCE and signed token checks, with opaque HttpOnly cookies. The API checks app entry; Enben owns its note permissions. Every note response is `no-store`. All writes require a signed-in session, the exact Enben Origin header and a successful current app-entry check. There is no offline write queue.

## 1. Put Enben on the server

Create a **new Compose application** in Dokploy, named `enben-notes-staging`. Leave the current AccessLobby and consumer applications alone.

Use repository `WB-DevWorld/AccessLobby`, the qualified merged revision containing this app, and Compose file `compose.enben-staging.dokploy.yaml`. Turn automatic deployment off for this test. Set only this image variable using the digest from the successful publication linked on #44:

```text
CONSUMER_IMAGE=ghcr.io/wb-devworld/accesslobby-reference-consumer@sha256:<qualified-notes-image-digest>
```

An older image does not contain Notes. Do not replace the digest with `latest`. The checked-in Compose file supplies the public origins and requires app-entry checking. Add the Dokploy domain `enben.realjanelove.com` to service **consumer**, container port **4000**, with HTTPS. Deploy. Opening `https://enben.realjanelove.com/` should show **Enben Notes** and **Sign in with AccessLobby**. Sign-in is expected to be unavailable until the exact app client is reviewed and activated below. `/health/live` checks the notes process; `/health/ready` checks issuer discovery and API readiness, not client activation.

## 2. Request the app in AccessLobby

Sign into AccessLobby with the designated first-party app owner. Open `https://accesslobby.realjanelove.com/apps`. On the refined UI, choose **Developer tools** to reach `/apps/manage`; older qualified builds show the request form directly on `/apps`. Request an app with these exact values:

| Field | Value |
| --- | --- |
| App name | Enben Notes staging |
| Client ID | `enben-staging-open` |
| Callback / redirect URL | `https://enben.realjanelove.com/callback` |
| Return URL after sign-out | `https://enben.realjanelove.com/` |
| Backchannel sign-out URL | `https://enben.realjanelove.com/backchannel-logout` |
| Visibility | Discoverable |
| Entry policy | Any authenticated active person (`authenticated_open`) |

If the client ID is already taken, stop and check who owns it. Do not repurpose another app. The request creates an inactive record, not an IAM client or permission to use the app.

AccessLobby shows a unique DNS TXT record. Copy the **name and value shown there** into the domain's DNS provider, then choose Verify in AccessLobby. Do not invent a value or substitute the web-server address. Verification proves control of the hostname; it is separate from publisher review.

## 3. Review and activate through the protected runner

An independent reviewer must approve this exact app as first party, its entry policy and all three URLs. Record the review reference. The protected operator then follows steps 1–4 of the [app onboarding acceptance runbook](app-onboarding-staging-acceptance.md): verify the database recovery baseline and current schema, run the plan, compare it with this request, activate, and read back the exact IAM client. Keep the scoped operator credential and review details private. Do not add this new client to an environment allowlist as a shortcut. DNS proof alone is insufficient for activation.

### Copy-and-paste protected runner

After the actual review and isolated restore pass, run `infra/scripts/activate-enben-staging.py` from the root VPS terminal with `--activate`, `--review-reference <actual-recorded-reference>` and `--backup <private-restored-backup-file>`. Keep `private-client-token.mjs` beside the Python script. Use files from the exact qualified source, not changing `main` downloads. The command is restricted to the known staging project and Enben request; it checks the current private backup, API baseline, entry policy, exact URLs and plan before using any IAM credential. It does not manufacture an independent review or reclassify an unrelated publisher.

The root process reads only the two existing operator credential variables inside the IAM container and passes them privately to a separate short-lived process inside the API container. It never sets them on the public API service, prints them, stores them, edits Compose or opens an IAM port. If that existing account is unavailable or retired, it stops; do not paste a password or token into chat. The bootstrap token creates one temporary service account with full scope disabled and a 90-second non-refreshing token. Its only realm-management roles are `manage-clients`, `query-clients` and `view-clients`: Keycloak's Admin REST creation endpoint requires `manage-clients`, not just `create-client`. This permission covers all client management in this realm; it is not an IAM-enforced one-client restriction. The runner limits the operation to the reviewed Enben request. No human-user, realm-administration, organization or federation role is granted. Only this scoped token reaches the normal provisioner. The provisioner rechecks live TXT proof and exact IAM readback before committing the active registry row. The temporary client is removed even after ordinary failures, and the separate bootstrap session is logged out. A cleanup failure needs protected investigation; it is not a successful operator pass. The command does not restart or replace an existing service. It stops on an already-active request rather than granting again.

An identity backup on the VPS plus an isolated restore is a local recovery checkpoint. It does not establish off-host storage, full IAM/control-plane restore, retention or production recovery. Record those operational gates separately.

## 4. Test the app with two accounts

1. Open Enben in one browser. Sign in as test account A. After the callback, choose **Create my account for this app** if shown. This creates an Enben account, not another AccessLobby identity.
2. Save a note called **Private test A**. Open it and change its text. Save changes and reopen it. The changed text should be there. Copy that note's address.
3. Use a private/incognito window or a second browser to sign in as test account B. Its notes list must not contain A's note. Paste A's note address. Expect **Note not found** with an explanation that only the owning account can open a note. A missing note and an inaccessible note intentionally give the same response. There must be no private text or edit/delete form. Save B's own note and verify A cannot open it either.
4. In A's window choose **Sign out of Enben**. Reopening the private note must require sign-in. Sign in again: the shared AccessLobby session may complete this without asking for a password, and A's note should return while Enben has not restarted.
5. Choose **Sign out of AccessLobby and supported apps** and complete AccessLobby's sign-out confirmation. Reopening Enben must require sign-in; IAM must ask for authentication again. If the same person is signed into a second supported app, verify its matching session ends after processing the signed backchannel event. Account B's independent session should stay active.
6. Follow the protected runbook to suspend this disposable app. With a previously signed-in Enben window, reload `/notes` and try to save a note. Access must be denied. App admission cannot be bypassed by a local note session. An API outage must likewise show an unavailable check, with no private note content or claimed successful write.

Keep the exact source revision, running consumer image digest, UTC time, browser/device and categorical results with #44. Do not attach note contents, tokens, cookies or DNS credentials. Keep the app inactive after the controlled pass unless the owner decides to retain it.

## Qualification boundaries

The HTTP integration test uses a signed, one-use Code/PKCE/JWKS fixture and two independent local accounts. It checks ownership, escaping, missing/foreign Origin, input/storage limits, denial/outage, retained notes after local sign-out, the shared logout destination and signed/replayed backchannel events. The browser UI test uses that fixture for create/edit/delete, account isolation, outage/reconnect, keyboard focus, 44px controls and six viewport widths.

The joined IAM CI job runs the actual Enben server against disposable Keycloak, PostgreSQL, the API and an activated registry app. It exercises real browser IAM sign-in, Code/PKCE and the peer callback/token validation, real `/v1/me` and app entry, two-person private notes over HTTP, local logout/SSO return and shared sign-out. It captures IAM redirects to the fixture HTTPS hostname and delivers them to the actual peer over loopback HTTP, with explicit opaque cookies. It checks Secure/HttpOnly/Host cookie attributes but does not qualify deployed HTTPS browser cookie transport. DNS proof and independent review remain fixtures. This is CI evidence, not a deployed Enben or live DNS/review/backchannel acceptance result. The existing consumer's behavior and AccessLobby's PWA regression remain in the normal suite.

At branch creation, the hostname resolved through Cloudflare, but this workspace's HTTP request received edge 403/1010 and the cloud browser returned `ERR_BLOCKED_BY_CLIENT`. These observations do not establish the site's origin content or a deployment failure. The owner confirmed there was no app there yet. Protected Dokploy/DNS/operator access is not available in this workspace; live deployment and acceptance remain BLOCKED or NOT RUN until performed.
