ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE applications ADD CONSTRAINT applications_status_check
  CHECK (status IN ('requested', 'active', 'suspended', 'cancelled'));
ALTER TABLE applications ADD COLUMN IF NOT EXISTS lifecycle_revision bigint NOT NULL DEFAULT 0;

-- Cancellation/resubmission is a new review revision even if routes are restored.
-- Ordinary private activation does not change the approved configuration hash.
CREATE OR REPLACE FUNCTION bump_application_review_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.client_id, NEW.name, NEW.owner_person_id, NEW.redirect_uri, NEW.logout_uri,
         NEW.backchannel_logout_uri, NEW.visibility, NEW.admission, NEW.platform,
         NEW.origin_challenge, NEW.origin_verified_at, NEW.origin_verified_host)
     IS DISTINCT FROM
     ROW(OLD.client_id, OLD.name, OLD.owner_person_id, OLD.redirect_uri, OLD.logout_uri,
         OLD.backchannel_logout_uri, OLD.visibility, OLD.admission, OLD.platform,
         OLD.origin_challenge, OLD.origin_verified_at, OLD.origin_verified_host)
     OR NEW.lifecycle_revision IS DISTINCT FROM OLD.lifecycle_revision
     OR (NEW.status IS DISTINCT FROM OLD.status AND
         (NEW.status = 'cancelled' OR OLD.status = 'cancelled')) THEN
    NEW.review_revision := OLD.review_revision + 1;
  ELSE
    NEW.review_revision := OLD.review_revision;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS application_lifecycle_commands (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  actor_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('edit', 'cancel', 'resubmit')),
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  expected_configuration_hash text NOT NULL CHECK (expected_configuration_hash ~ '^[a-f0-9]{64}$'),
  mutation_hash text NOT NULL CHECK (mutation_hash ~ '^[a-f0-9]{64}$'),
  resulting_configuration_hash text NOT NULL CHECK (resulting_configuration_hash ~ '^[a-f0-9]{64}$'),
  resulting_status text NOT NULL CHECK (resulting_status IN ('requested', 'cancelled')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, actor_person_id, action, expected_configuration_hash)
);

CREATE OR REPLACE FUNCTION reject_application_lifecycle_command_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Application lifecycle command records are append-only';
END;
$$;
DROP TRIGGER IF EXISTS application_lifecycle_commands_append_only ON application_lifecycle_commands;
CREATE TRIGGER application_lifecycle_commands_append_only BEFORE UPDATE OR DELETE ON application_lifecycle_commands
  FOR EACH ROW EXECUTE FUNCTION reject_application_lifecycle_command_changes();

INSERT INTO schema_migrations(version) VALUES ('012_application_lifecycle') ON CONFLICT (version) DO NOTHING;
