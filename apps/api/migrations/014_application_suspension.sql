-- Registry suspension is a platform control. It does not modify IAM clients.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS administration_version bigint NOT NULL DEFAULT 0
  CHECK (administration_version >= 0);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES persons(id) ON DELETE RESTRICT;

-- Include status and private activation bindings as well as reviewed settings.
-- The late trigger name observes the review revision produced by older triggers.
CREATE OR REPLACE FUNCTION bump_application_administration_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.status,NEW.trust_class,NEW.client_id,NEW.name,NEW.owner_person_id,
      NEW.redirect_uri,NEW.logout_uri,NEW.backchannel_logout_uri,NEW.platform,
      NEW.visibility,NEW.admission,NEW.origin_challenge,NEW.origin_verified_at,
      NEW.origin_verified_host,NEW.review_revision,NEW.lifecycle_revision,
      NEW.activated_at,NEW.review_reference,NEW.activation_job_id,
      NEW.suspended_at,NEW.suspension_reference,NEW.suspended_by)
    IS DISTINCT FROM
    ROW(OLD.status,OLD.trust_class,OLD.client_id,OLD.name,OLD.owner_person_id,
      OLD.redirect_uri,OLD.logout_uri,OLD.backchannel_logout_uri,OLD.platform,
      OLD.visibility,OLD.admission,OLD.origin_challenge,OLD.origin_verified_at,
      OLD.origin_verified_host,OLD.review_revision,OLD.lifecycle_revision,
      OLD.activated_at,OLD.review_reference,OLD.activation_job_id,
      OLD.suspended_at,OLD.suspension_reference,OLD.suspended_by) THEN
    NEW.administration_version := OLD.administration_version + 1;
  ELSE
    NEW.administration_version := OLD.administration_version;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_application_administration_version ON applications;
CREATE TRIGGER zz_application_administration_version BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION bump_application_administration_version();

INSERT INTO schema_migrations(version) VALUES ('014_application_suspension') ON CONFLICT (version) DO NOTHING;
