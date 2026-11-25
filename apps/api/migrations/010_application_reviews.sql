-- 007/008 are reserved by the preserved external-privacy development line.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS review_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION bump_application_review_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.client_id, NEW.name, NEW.owner_person_id, NEW.redirect_uri, NEW.logout_uri,
         NEW.backchannel_logout_uri, NEW.visibility, NEW.admission, NEW.platform,
         NEW.origin_challenge, NEW.origin_verified_at, NEW.origin_verified_host)
     IS DISTINCT FROM
     ROW(OLD.client_id, OLD.name, OLD.owner_person_id, OLD.redirect_uri, OLD.logout_uri,
         OLD.backchannel_logout_uri, OLD.visibility, OLD.admission, OLD.platform,
         OLD.origin_challenge, OLD.origin_verified_at, OLD.origin_verified_host) THEN
    NEW.review_revision := OLD.review_revision + 1;
  ELSE
    NEW.review_revision := OLD.review_revision;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS applications_review_revision ON applications;
CREATE TRIGGER applications_review_revision BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION bump_application_review_revision();

CREATE TABLE IF NOT EXISTS application_reviews (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  reviewer_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  configuration_hash text NOT NULL CHECK (configuration_hash ~ '^[a-f0-9]{64}$'),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, configuration_hash)
);
CREATE INDEX IF NOT EXISTS application_reviews_application_idx ON application_reviews(application_id, id DESC);

CREATE OR REPLACE FUNCTION reject_application_review_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Application review records are append-only';
END;
$$;
DROP TRIGGER IF EXISTS application_reviews_append_only ON application_reviews;
CREATE TRIGGER application_reviews_append_only BEFORE UPDATE OR DELETE ON application_reviews
  FOR EACH ROW EXECUTE FUNCTION reject_application_review_changes();

INSERT INTO schema_migrations(version) VALUES ('010_application_reviews') ON CONFLICT (version) DO NOTHING;
