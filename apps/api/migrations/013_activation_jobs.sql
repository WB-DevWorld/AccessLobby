-- An old pending approval is never silently rebound to a new operator grant.
ALTER TABLE application_reviews ADD COLUMN IF NOT EXISTS reviewer_grant_version bigint;
ALTER TABLE application_reviews ADD COLUMN IF NOT EXISTS reviewer_person_version bigint;
-- Pending approvals from the earlier contract cannot be rebound to current
-- grants. Invalidate their proof once, retaining immutable review history.
UPDATE applications a SET origin_verified_at=NULL,origin_verified_host=NULL
WHERE a.status='requested' AND a.trust_class='unreviewed'
  AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='013_activation_jobs')
  AND EXISTS(SELECT 1 FROM application_reviews r WHERE r.id=(SELECT max(latest.id)
    FROM application_reviews latest WHERE latest.application_id=a.id)
    AND r.decision='approved' AND (r.reviewer_grant_version IS NULL OR r.reviewer_person_version IS NULL));
-- Jobs contain reviewed configuration references, never IAM credentials.
CREATE TABLE IF NOT EXISTS application_activation_jobs (
  id uuid PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  review_id bigint NOT NULL REFERENCES application_reviews(id) ON DELETE RESTRICT,
  configuration_hash text NOT NULL CHECK (configuration_hash ~ '^[a-f0-9]{64}$'),
  review_reference text NOT NULL CHECK (review_reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  requested_by uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  requester_grant_version bigint NOT NULL,
  requester_person_version bigint NOT NULL,
  reviewer_grant_version bigint NOT NULL,
  reviewer_person_version bigint NOT NULL,
  owner_person_version bigint NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 5),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 5),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text CHECK (last_error ~ '^activation_[a-z_]+$'),
  retryable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (attempt <= max_attempts),
  CHECK (requester_grant_version>=1 AND requester_person_version>=0 AND reviewer_grant_version>=1 AND reviewer_person_version>=0 AND owner_person_version>=0),
  CHECK ((status = 'running') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  UNIQUE(application_id, configuration_hash, review_id, requested_by,
    requester_grant_version, requester_person_version, reviewer_grant_version, reviewer_person_version, owner_person_version)
);
CREATE INDEX IF NOT EXISTS activation_jobs_claim_idx ON application_activation_jobs(status, created_at);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS activation_job_id uuid
  REFERENCES application_activation_jobs(id) ON DELETE RESTRICT;
INSERT INTO schema_migrations(version) VALUES ('013_activation_jobs') ON CONFLICT (version) DO NOTHING;
