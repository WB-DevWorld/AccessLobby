-- Ordinary account self-service is distinct from operator actions. These rows
-- retain opaque display handles and counts, never provider/session credentials.
CREATE TABLE IF NOT EXISTS account_session_endings (
  handle uuid PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  expected_state text NOT NULL CHECK (expected_state ~ '^[a-f0-9]{64}$'),
  receipt_count integer NOT NULL CHECK (receipt_count > 0),
  ended_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_session_endings_person_expiry_idx
  ON account_session_endings(person_id, ended_at);

CREATE TABLE IF NOT EXISTS account_security_events (
  id bigserial PRIMARY KEY,
  event_handle uuid NOT NULL DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action = 'app_session_ended'),
  client_id text NOT NULL CHECK (client_id ~ '^[a-z0-9_-]{1,80}$'),
  handle uuid NOT NULL,
  receipt_count integer NOT NULL CHECK (receipt_count > 0),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_security_events_person_time_idx
  ON account_security_events(person_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS account_security_events_handle_idx ON account_security_events(event_handle);
CREATE INDEX IF NOT EXISTS account_security_events_person_order_idx ON account_security_events(person_id, id DESC);

INSERT INTO schema_migrations(version) VALUES ('017_account_sessions') ON CONFLICT (version) DO NOTHING;
