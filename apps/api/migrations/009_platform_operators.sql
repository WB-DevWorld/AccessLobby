-- Reserved migrations 007/008 belong to the separate external preview lineage.
-- Operator authority is explicit and independent of organization/IAM roles.
CREATE TABLE IF NOT EXISTS platform_operator_roles (
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('support_reader', 'application_reviewer')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  grant_reference text NOT NULL CHECK (grant_reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  revoked_at timestamptz,
  revoke_reference text CHECK (revoke_reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  PRIMARY KEY (person_id, role),
  CHECK ((revoked_at IS NULL) = (revoke_reference IS NULL))
);

CREATE TABLE IF NOT EXISTS operator_audit_events (
  id bigserial PRIMARY KEY,
  actor_person_id uuid REFERENCES persons(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  target_type text NOT NULL CHECK (length(target_type) BETWEEN 1 AND 40),
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 120),
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES ('009_platform_operators') ON CONFLICT (version) DO NOTHING;
