# Backup, restore and rollback

Back up **both** Keycloak and AccessLobby PostgreSQL independently with encrypted off-host retention and tested credentials. Realm JSON is configuration, not a backup of users, events or sessions. Capture a consistent `pg_dump -Fc` from each database; verify nonzero output and archive checksums outside the service host. Backups and recovery access must not depend on AccessLobby login.

Restore drill: create isolated empty staging databases; restore each dump with `pg_restore --clean --if-exists --no-owner` to its corresponding store; launch the pinned IAM and API versions against these isolated copies without public routing; verify person/link counts, issuer mapping and login with a test account. Never restore production dumps into a public test endpoint. Record date, source backup ID, checksum, versions, test results and elapsed recovery time.

Rollback: retain previous image digests and versioned migrations. Confirm compatibility of the previous binary with new schema before rolling back. No destructive migration is allowed without a rehearsed restoration and owner decision. If identity service fails, isolate ingress, retain audit/log evidence, restore from out-of-band access and requalify login and peer authorization before traffic returns.
