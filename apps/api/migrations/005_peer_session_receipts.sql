CREATE TABLE IF NOT EXISTS peer_session_receipts (
  receipt_hash text PRIMARY KEY CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  issuer text NOT NULL,
  sid text NOT NULL,
  client_id text NOT NULL,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS peer_session_receipts_session_idx ON peer_session_receipts (issuer, sid, client_id);
CREATE INDEX IF NOT EXISTS peer_session_receipts_expiry_idx ON peer_session_receipts (expires_at);
INSERT INTO schema_migrations(version) VALUES ('005_peer_session_receipts') ON CONFLICT (version) DO NOTHING;
