-- Independent console handles never authenticate a peer or encode an IAM sid.
ALTER TABLE peer_session_receipts ADD COLUMN IF NOT EXISTS console_handle uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS peer_session_receipts_console_handle_idx ON peer_session_receipts(console_handle);
CREATE INDEX IF NOT EXISTS peer_session_receipts_person_expiry_idx ON peer_session_receipts(person_id,expires_at);

-- Tombstones make a repeated console request harmless after reauthentication.
-- They retain only console metadata, not receipt hashes, capabilities or sids.
CREATE TABLE IF NOT EXISTS console_session_endings (
  handle uuid PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  actor_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  expected_state text NOT NULL CHECK (expected_state ~ '^[a-f0-9]{64}$'),
  reference text NOT NULL CHECK (reference ~ '^[A-Za-z0-9._:/-]{4,120}$'),
  receipt_count integer NOT NULL CHECK (receipt_count > 0),
  ended_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS console_session_endings_expiry_idx ON console_session_endings(ended_at);

INSERT INTO schema_migrations(version) VALUES ('015_session_inspection') ON CONFLICT (version) DO NOTHING;
