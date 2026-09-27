CREATE TABLE IF NOT EXISTS revoked_oidc_sessions (
  issuer text NOT NULL,
  sid text NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (issuer, sid)
);
CREATE TABLE IF NOT EXISTS oidc_logout_events (
  issuer text NOT NULL,
  jti text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, jti)
);
CREATE INDEX IF NOT EXISTS revoked_oidc_sessions_expiry_idx ON revoked_oidc_sessions (expires_at);
CREATE INDEX IF NOT EXISTS oidc_logout_events_expiry_idx ON oidc_logout_events (received_at);
INSERT INTO schema_migrations(version) VALUES ('002_session_revocation') ON CONFLICT (version) DO NOTHING;
