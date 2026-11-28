-- Reviewed navigation metadata is separate from OIDC configuration and approval.
CREATE TABLE IF NOT EXISTS application_launches (
  application_id uuid PRIMARY KEY REFERENCES applications(id) ON DELETE RESTRICT,
  launch_url text CHECK (launch_url IS NULL OR length(launch_url) BETWEEN 1 AND 2048),
  revision bigint NOT NULL CHECK (revision >= 1),
  updated_by uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9._:/-]{4,120}$')
);

CREATE TABLE IF NOT EXISTS application_launch_commands (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  actor_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  expected_version text NOT NULL CHECK (expected_version ~ '^[a-f0-9]{64}$'),
  launch_url text CHECK (launch_url IS NULL OR length(launch_url) BETWEEN 1 AND 2048),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, actor_person_id, reference)
);

CREATE OR REPLACE FUNCTION reject_application_launch_command_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Application launch commands are append-only';
END;
$$;
DROP TRIGGER IF EXISTS application_launch_commands_append_only ON application_launch_commands;
CREATE TRIGGER application_launch_commands_append_only BEFORE UPDATE OR DELETE ON application_launch_commands
  FOR EACH ROW EXECUTE FUNCTION reject_application_launch_command_changes();

INSERT INTO schema_migrations(version) VALUES ('016_application_launch') ON CONFLICT (version) DO NOTHING;
