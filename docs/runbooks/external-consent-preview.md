# Inactive external consent preview

This is a controlled development/testing feature, not external WordPress onboarding. Never activate a prepared external client, give a publisher IAM privileges, admit it to the first-party API or describe a saved approval as a working integration.

Apply API migrations through008 before deploying the matching API/web images by the existing immutable staging process. Default `EXTERNAL_PROFILE_PREVIEW_ENABLED=false` on both services. Enable exact `true` only in an explicitly isolated preview after the release checks pass. The two flags must agree; mismatch must produce an unavailable/404 UI, not a fabricated approval.

1. An authenticated publisher uses existing Developer tools to request its typed WordPress application and copy the exact callback/logout routes.
2. Prove its current callback hostname using the existing DNS TXT process. This does not prove first-party status or authorize client activation.
3. On the private API runtime, use `prepare-external-app APPLICATION_UUID --plan` to review the inactive plan, then `--prepare REVIEW_REFERENCE` for a separately reviewed external request. Current origin proof is rechecked. No IAM secret is required.
4. Give the reviewed application's `/connections/APPLICATION_UUID` URL to the controlled tester. Sign-in resumes that exact review after normal identity/context validation. The tester sees the site origin, separate site identifier category, absent email/profile/organization sharing and inactive status, then explicitly approves or cancels.
5. The tester manages its own approval at `/connections` or Account → Site connections. Withdrawal is always possible for an existing approval, including a suspended/changed publisher. It does not erase app-local orders or other data already held by an application.
6. Registration name/owner/domain/routes/admission/visibility changes invalidate review and grants durably, even if later reverted. Use `--reverify REVIEW_REFERENCE` with fresh current origin proof, then require a fresh tester approval. Use `--suspend REVIEW_REFERENCE` to suspend. Resuming uses `--resume-preview REVIEW_REFERENCE`, requires new proof/review and never restores old consent or activates a client.

After rollout, earlier preview rows without fingerprints are unavailable until reverified and re-consented. Do not backfill fingerprints with an SQL shortcut. Review fingerprints and opaque app identity mappings are not email mappings. Preserve mapping/audit records for continuity pending the approved retention policy; no password/hash copying or Person duplication is involved.

Rollback: set both flags false to hide routes and stop preview operations. It is safe to retain additive migrations, inactive profiles and withdrawn consent audit. Do not revert to a prior preview API that can resolve old consent without checking the review context. Production first-party applications and WordPress plugin authentication do not depend on this preview flag. No external JWT/token issuance exists to roll out.

Evidence must name source/CI/image revisions and distinguish database tests, real-IAM/browser fixtures and real publisher qualification. Follow ADR012 for exact0.2 API/body/error semantics. Remaining external issuance, scoped session privacy, provisioning, retention and independent pilot gates stay open under issue59.
