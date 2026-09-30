# AccessLobby app checks — plain instructions

The public server checks are done. The owner deployed the first PWA version and reported **23/23 public checks** and **11/11 PWA file checks** passing on September 30. The first “file not found” error came from running the commands one folder too high; moving into `code` fixed it.

The **PWA staging browser qualification** GitHub workflow checks the background worker, cache, offline pages, installation in a temporary Linux Chromium profile and screen widths without account credentials. Sign-in in an installed window and the next-version update still need a device and a protected deployment.

## Install this version on one device

1. Open **https://accesslobby.realjanelove.com** in Chrome on your computer or Android phone, or Safari on your iPhone.
2. Install it:
   - Computer Chrome: use the install icon beside the website address, or the browser menu's option to install the page as an app.
   - Android Chrome: open the three-dot menu and choose **Install app** or **Add to Home screen**.
   - iPhone Safari: tap **Share**, then **Add to Home Screen**.
3. Open **AccessLobby** from its new desktop/start-menu/home-screen icon. It should have its own app window. Sign in. You should reach your account or context chooser.
4. Close AccessLobby. Turn off Wi-Fi and mobile data, then open AccessLobby from its icon again. It should say **Connection required**. It must not show old account details as if they were still verified.
5. Turn the connection back on and press **Retry connection**. Sign in again if asked.

Report the device and browser, and what happened at steps 3–5. Keep AccessLobby installed for the update test. There is no need to inspect browser caches or paste passwords, codes or cookies into chat.

## Check sign-out in that app window

1. From your account, choose **Sign out of this app**. Return to the account page: it should ask you to sign in. Pressing **Sign in** may return you without a password because the shared session remains active.
2. Choose **Sign out of AccessLobby and supported apps**. Confirm **Sign out** on the sign-in service's page. Reopen the app and try signing in: it should ask for credentials again.

## Check the next-version update

Keep the first version installed. The release engineer must deploy the next qualified version to the same website. Reopen AccessLobby afterward. It should show **Update ready**. While you are on an account or access-management step, it must let you finish. Return home and choose **Update now**. Your normal sign-in session and display preference should survive unless the server session expired independently.

Exact release pins and technical checks are in [the rollout handoff](pwa-staging-handoff-2026-09-30.md) and [the staging runbook](pwa-staging-acceptance.md).

## Only if asked for the running web image

Copy this one command into the server terminal. It prints only the web image reference and no secrets:

```bash
docker ps -q --filter label=com.docker.compose.project=accesslobby-accesslobbystaging-beass9 --filter label=com.docker.compose.service=web | xargs -r docker inspect --format '{{.Config.Image}}'
```

Before running repository scripts on this host, enter the code folder:

```bash
cd /etc/dokploy/compose/accesslobby-accesslobbystaging-beass9/code
```
