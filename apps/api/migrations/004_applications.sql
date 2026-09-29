CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY,
  client_id text NOT NULL UNIQUE CHECK (client_id ~ '^[a-z0-9_-]+$' AND length(client_id) <= 80),
  name text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  owner_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  redirect_uri text NOT NULL,
  logout_uri text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('discoverable', 'hidden')),
  admission text NOT NULL CHECK (admission IN ('authenticated_open', 'grant_required')),
  trust_class text NOT NULL DEFAULT 'unreviewed' CHECK (trust_class IN ('unreviewed', 'first_party', 'external')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  review_reference text,
  origin_challenge text NOT NULL,
  origin_verified_at timestamptz,
  origin_verified_host text,
  CHECK (status <> 'active' OR (trust_class = 'first_party' AND activated_at IS NOT NULL AND origin_verified_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS applications_owner_idx ON applications (owner_person_id, created_at);
CREATE INDEX IF NOT EXISTS applications_visible_idx ON applications (status, trust_class, visibility);

CREATE TABLE IF NOT EXISTS application_grants (
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  granted_by uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  PRIMARY KEY (application_id, person_id)
);
CREATE INDEX IF NOT EXISTS application_grants_person_idx ON application_grants (person_id, status);

CREATE TABLE IF NOT EXISTS application_events (
  id bigserial PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE RESTRICT,
  actor_person_id uuid REFERENCES persons(id) ON DELETE RESTRICT,
  target_person_id uuid REFERENCES persons(id) ON DELETE RESTRICT,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES ('004_applications') ON CONFLICT (version) DO NOTHING;
