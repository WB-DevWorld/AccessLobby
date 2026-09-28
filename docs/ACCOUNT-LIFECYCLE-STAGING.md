# Account lifecycle and staging promise states

AccessLobby must show only account capabilities that are actually enabled in the current environment.

## Public registration

`PUBLIC_REGISTRATION_ENABLED` controls whether AccessLobby and the reference consumer show a create-account action. It defaults to `false`.

The Keycloak realm is reconciled after startup by `infra/keycloak/reconcile-realm.sh`. This is required because importing a realm creates a missing realm but does not update the settings of an existing realm.

The runtime settings are:

- `PUBLIC_REGISTRATION_ENABLED`: enable or disable self-registration;
- `IAM_VERIFY_EMAIL`: require a verified email before the account is usable;
- `IAM_RESET_PASSWORD_ENABLED`: enable the forgot-password flow.

Email verification and password reset must remain disabled until SMTP is configured and tested. Enabling the UI without reconciling the realm is not an accepted deployment.

## Reference consumer account states

The reference consumer demonstrates four separate conditions:

1. not signed into AccessLobby;
2. signed into AccessLobby but not linked to a local app account;
3. linked to a new local app account;
4. linked to an explicitly authenticated existing app account.

An AccessLobby account is never merged with an existing app account merely because email addresses match.

When no local app account is linked, the user can:

- create a local account for the reference app;
- connect an existing app account when the legacy test account is configured;
- sign out of AccessLobby.

The reference app continues to decide access to its protected resource locally.

## Staging acceptance

Before registration is described as working, staging must prove:

- the create-account action is visible only when enabled;
- the live realm opens the registration form;
- a new account can be submitted;
- the user can return through the OIDC callback;
- the same AccessLobby person is returned on repeat sign-in;
- the reference app can create its own local account after AccessLobby authentication;
- current-app and shared-session sign-out are both available;
- email verification and password reset are claimed only after SMTP-backed tests pass.
