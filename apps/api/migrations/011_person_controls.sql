-- Person lifecycle does not delete durable identity, provider links or memberships.
ALTER TABLE platform_operator_roles DROP CONSTRAINT IF EXISTS platform_operator_roles_role_check;
ALTER TABLE platform_operator_roles ADD CONSTRAINT platform_operator_roles_role_check
  CHECK (role IN ('support_reader', 'application_reviewer', 'identity_operator', 'application_operator'));
ALTER TABLE platform_operator_roles ADD COLUMN IF NOT EXISTS grant_version bigint NOT NULL DEFAULT 1 CHECK (grant_version >= 1);

ALTER TABLE persons ADD COLUMN IF NOT EXISTS session_not_before bigint NOT NULL DEFAULT 0 CHECK (session_not_before >= 0);
ALTER TABLE persons ADD COLUMN IF NOT EXISTS status_version bigint NOT NULL DEFAULT 0 CHECK (status_version >= 0);
ALTER TABLE persons ADD COLUMN IF NOT EXISTS status_change_reference text
  CHECK (status_change_reference ~ '^[A-Za-z0-9._:/-]{4,120}$');
ALTER TABLE persons ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES persons(id) ON DELETE RESTRICT;

INSERT INTO schema_migrations(version) VALUES ('011_person_controls') ON CONFLICT (version) DO NOTHING;
