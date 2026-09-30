# First-party app onboarding staging handoff — 2026-09-29

**Current checkpoint, 2026-09-30:** staging now runs qualified Build B `91e1a66167aa4a74dea44062e41849f8e8efb02c`, including this onboarding code. See [current B evidence](../qa/pwa-2026-09-30/build-b-acceptance.md) and [B publication pins](../../infra/releases/staging-2026-09-30-pwa-build-b.json). The separate pilot consumer was retained. The rollout commands and `aadfad3…` pins below are a historical handoff, not an instruction to downgrade current staging or replace that consumer. Continue #44 by confirming current private inventory/schema and executing [application admission acceptance](app-onboarding-staging-acceptance.md) on the selected release after its approved hostname/people/review are available. No app-entry result is implied by the completed PWA acceptance.

Source `aadfad381b3f43d8c93cce1ba84805aead4efb52` merged [PR #42](https://github.com/WB-DevWorld/AccessLobby/pull/42). It adds migration 004, the `/apps` request and DNS proof UI, registry-backed first-party client admission, a private client provision/suspend runner, and opt-in entry checks in the reference consumer. Routine application creation reuses the existing `accesslobby-first-party` realm; the public request does not create a realm or IAM client. External third-party activation remains closed pending its separate pairwise ID, scope and consent contract.

The matching five image digests are pinned in [the release manifest](../../infra/releases/staging-2026-09-29-app-onboarding.json). Source main [CI](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36629974878) and [Keycloak theme](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36629974855) passed. The [application publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36630209514) and [IAM publisher](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36630147344) succeeded and recorded those image references. Publishing is not staging deployment or signed-in acceptance.

## Controlled rollout

1. In the protected Dokploy operator environment, record the **actual** running digests, Compose checkout, current API `/health/live` SHA, backup/restore state and tested rollback target. On 2026-09-29 the public health route reported older `936aae12571346920923ed392731611eaa0ecf8a`; the new commit was not observed running. Existing account-routing, organization and peer-local role behavior must remain intact.
2. Set the main staging Compose checkout to `main` at or after source `aadfad3`. Review the rendered `compose.dokploy.yaml` and set `GIT_SHA`, `IAM_IMAGE`, `IAM_GATEWAY_IMAGE`, `API_IMAGE` and `WEB_IMAGE` together from the manifest. Keep the current issuer, domains, networks, persistent volumes, secret values and registration/recovery policy. Verify the identity database backup and isolated restore before the additive migration 004. Run the `migrate` one-shot job successfully **before** shifting API/web traffic; confirm API readiness and existing pilot sign-in. `iam-config` still reconciles the existing realm; do not create another one.
3. In the separate reference-consumer project, set `CONSUMER_IMAGE` to the manifest digest after the main API is ready. Preserve `OIDC_CLIENT_ID=reference-consumer` and leave `APP_ENTRY_REQUIRED` unset/false for this legacy client. A newly activated disposable client needs its own independently configured peer deployment before enabling the flag. Keep `GRANTED_PERSON_IDS` empty for broad-entry tests unless deliberately testing that peer-local fixture.
4. Compare the protected container inventory to the manifest without exporting environment values:

   ```sh
   python3 infra/scripts/inspect_staging_runtime.py \
     --main-project accesslobby-accesslobbystaging-beass9 \
     --consumer-project accesslobby-referenceconsumerstaging-yuxqwo \
     --manifest infra/releases/staging-2026-09-29-app-onboarding.json \
     --output /var/tmp/accesslobby-app-onboarding-runtime.json
   ```

5. Run the credential-free preflight with `--expected-sha aadfad381b3f43d8c93cce1ba84805aead4efb52`, then perform the signed-in [ordered first-party acceptance](app-onboarding-staging-acceptance.md). That pass requires an owned disposable hostname, a private scoped IAM provisioning token and a recorded human first-party review. Verify the packaged CLI against staging IAM, open admission for two people without an ID environment list, restricted grant/revoke, peer-local resource denial, shared sign-out if implemented, outage denial and registry-first suspension. Record only categorical results and identifiers permitted by the acceptance runbook.

6. If migration, sign-in or IAM reconciliation fails, stop traffic shift and return the app images to the observed, tested baseline. Migration 004 is additive; do not drop its tables as a rollback shortcut. A created disposable IAM client should remain inactive in the registry on a failed activation; resolve the mismatch before retry. A suspension that reached the registry already denies API access, and the same reference retries IAM disable. Capture private logs and the rollback result before declaring acceptance.

## Public baseline before rollout

The credential-free preflight against the older `936aae1` API passed 22 of 23 checks on 2026-09-29. Web, API live/ready, unauthenticated identity, issuer/JWKS, five restricted gateway paths, five consumer-home samples, consumer live/ready/private/invalid-callback, branded login and branded error passed. The registration form check yielded an unavailable/invalid response after 16.5 seconds. One bounded fresh OIDC registration request then returned HTTP 200 with HTML, the branded heading and registration form ID. This retry does not erase the intermittent response or prove account creation/email delivery. Repeat the complete preflight after deployment; investigate repeated auth-page timeouts with private proxy/IAM evidence.

No production promotion follows from this handoff. Organization seats, delegated app administrators, bulk/customer entitlements and third-party publishers remain separate product and implementation decisions.
