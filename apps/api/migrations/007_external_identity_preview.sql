-- Closed preview only: deliberately DO NOT relax the first-party-only activation constraint.
CREATE TABLE IF NOT EXISTS external_app_profiles (
  application_id uuid PRIMARY KEY REFERENCES applications(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('prepared', 'suspended')),
  policy_version text NOT NULL CHECK (policy_version = 'external-minimal-v0.1'),
  scopes text[] NOT NULL CHECK (scopes = ARRAY['openid']::text[]),
  review_reference text NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS external_app_identities (
  application_id uuid NOT NULL REFERENCES external_app_profiles(application_id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  subject text NOT NULL UNIQUE CHECK (subject ~ '^alx_[A-Za-z0-9_-]{43}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, person_id)
);
CREATE TABLE IF NOT EXISTS external_app_consents (
  application_id uuid NOT NULL,
  person_id uuid NOT NULL,
  policy_version text NOT NULL CHECK (policy_version = 'external-minimal-v0.1'),
  scopes text[] NOT NULL CHECK (scopes = ARRAY['openid']::text[]),
  state text NOT NULL CHECK (state IN ('granted', 'withdrawn')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  granted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  PRIMARY KEY (application_id, person_id),
  FOREIGN KEY (application_id, person_id) REFERENCES external_app_identities(application_id, person_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS external_app_consents_person_idx ON external_app_consents(person_id);
INSERT INTO schema_migrations(version) VALUES ('007_external_identity_preview') ON CONFLICT DO NOTHING;
