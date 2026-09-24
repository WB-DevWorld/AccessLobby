CREATE TABLE IF NOT EXISTS persons (
  id uuid PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS iam_subject_links (
  issuer text NOT NULL,
  subject text NOT NULL,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject)
);
CREATE INDEX IF NOT EXISTS iam_subject_links_person_idx ON iam_subject_links (person_id);
