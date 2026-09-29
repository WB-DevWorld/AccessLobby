CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_by uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'administrator', 'member')),
  status text NOT NULL CHECK (status IN ('active', 'left', 'removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  PRIMARY KEY (organization_id, person_id)
);
CREATE INDEX IF NOT EXISTS organization_memberships_person_idx
  ON organization_memberships (person_id, status);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  invited_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  invited_by uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('administrator', 'member')),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_pending_idx
  ON organization_invitations (organization_id, invited_person_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS organization_invitations_person_idx
  ON organization_invitations (invited_person_id, status);

CREATE TABLE IF NOT EXISTS organization_events (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  target_person_id uuid REFERENCES persons(id) ON DELETE RESTRICT,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES ('003_organizations') ON CONFLICT (version) DO NOTHING;
