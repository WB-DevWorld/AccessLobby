# ACCESSLOBBY DEV — Use the open Jane inbox and complete both tests

Current owner decision, 2026-11-25: **jane@cetechbpa.com is open in Cursor’s qualification Edge profile. Use that inbox and make both tests work.** This supersedes the earlier distinct-address plan. No second inbox, plus-addressing, alias creation, mailbox password generation or provider change is required. Continue through results, not another plan.

## Reconcile and preserve

Fetch current main/qualification branch without disturbing other working trees. Last verified main de71ec978d9c5dcc2eaa4e3076eb7a7da94ed223; accepted delivery/Join a83634f3e7c228014449c0269c9a01d4ddcc1d79; mailbox blocker ee3dee9f65c3876f04197e97bb7d9f29e3e888f9. The owner’s newly open Jane inbox supplies the missing receiving route; that does not claim either qualification flow has run.

Read repository instructions, CURRENT-WORK.md, consumer contract and wordpress-verified-join-qualification.md. Operator PR73/75/77 and migrations009–015 stay with the parallel lane; coordinate shared ledger/contracts with the integrator.

Preserve official/al-qual-join, subscriber47, customer45, the original shared qualification identity, their mappings, order50402 and guest checkout. Training baseline40users/twoactive mappings/hybrid/JIToff. Preserve staging3212/order54346/users2921 and FLAIROC122/order4043/users49. Preserve alpha.9, enforcedoff,300second tokens, issuer, image pins, realm verification/duplicate-email policy, SMTP587/auth/STARTTLS/certificate verification and accepted SSO/logout evidence. Do not change mail settings or credentials.

## 1. Collision first

Confirm Jane is still unused by IAM/training. Record current recoverable backup/settings/counts. Create one NEW disposable IAM fixture with Jane, recording its exact ID/unique fixture name; complete genuine delivered email verification without an administrative verified override. New synthetic IAM/WordPress credentials may be randomly generated and retained only through the protected fixture route; do not change any mailbox or accepted-account credential.

Create ONE empty unlinked synthetic WordPress subscriber with email Jane and private random local password; record its exact ID. Expected40→41users, mappings remain2. Confirm no active/inactive link, orders or content belongs to this local fixture.

Temporarily enable training-only JIT with the accepted subscriber role. In a clean authentication context, start a NEW WordPress login as the verified disposable IAM identity. Require fresh validated verified-email claims and successful normal admission. Never replay a callback.

PASS requires the EMAIL-COLLISION account_link_required/HTTP400 path, no WordPress sign-in/new account/link/session,41users and unchanged twoactive mappings. Preserve all accepted data and the local collision fixture. Unverified-email, admission or JIToff refusal does not count. /v1/me may resolve a durable person/receipt before refusal; do not claim zero central effects. Restore JIT off.

## 2. Remove only the newly created throwaway fixtures

To reuse this one address for genuinely new registration:

- Verify the recorded local fixture remains empty/unlinked with no orders/content; remove only that new fixture through supported tooling.
- End only the NEW disposable IAM fixture’s sessions, then remove only that recorded disposable IAM user through the protected administrative route.
- Keep AccessLobby durable person/provider-link/audit history intact. Do not delete database records to make the address available.
- Never delete a pre-existing IAM user, original qualification identity, subscriber47/customer45, Forward Email mailbox/password, realm, client, order or database. No whole-site restore as cleanup.
- Confirm Jane is free for normal IAM registration, training returns to40users and the twoaccepted mappings are unchanged. If exact ownership/empty state/cleanup safety cannot be established, stop dependent work and report the concrete reason.

Disconnecting an accepted or newly linked account is not a substitute: Store.unlink retains an inactive mapping and Store.resolve rejects it before email_exists. That would not prove email-collision refusal. Collision-first avoids creating a mapping to clean up.

## 3. Genuinely new WordPress-originated registration

In a clean browser, start WordPress Join with Jane. Register through the NORMAL IAM UI, genuinely complete delivered verification and follow the supported fresh return/login. Temporarily enable training JIT with the accepted safe subscriber role as needed.

With realm-wide verification off, record exactly how the new user initiates verification. A supported user-facing action is preferred; if an operator must assign a required action, report an assisted registration journey and keep unassisted public signup separate. If a supported user journey is missing, implement a bounded normal-user verification flow through PR/CI without changing realm-wide policy or weakening guards.

Prove this is a newly created IAM account, not reuse of the deleted fixture; record categorical new-account/person distinction without publishing subjects/tokens. Prove admission before local provisioning, exactly one new subscriber/mapping, no privileged role and repeat-login reuse. Restore JIT off. Expected final41users/3active mappings if successful; record actual IDs/counts, preserving45/47/order50402/guest policy. Retain the successful synthetic account for evidence unless separately cleaned through the established safe route.

## Delivery

Commit/push sanitized full-SHA/runtime/plugin results, separate collision/cleanup/registration PASS/FAIL/BLOCKED, before/after users/mappings/roles/sessions, audits/UTC times, accepted-account preservation and final hybrid/JIToff/enforcedoff. Do not publish passwords, mailbox contents, cookies, tokens, codes or verification links. Keep Issue59open until every acceptance gate passes. Enforced migration, emergency recovery, production and arbitrary external activation remain outside this step.
