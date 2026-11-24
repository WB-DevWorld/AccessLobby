-- Additive: existing reviewed web clients retain their query-free URL profile.
ALTER TABLE applications ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web'
  CHECK (platform IN ('web', 'wordpress'));
INSERT INTO schema_migrations (version) VALUES ('006_wordpress_platform') ON CONFLICT DO NOTHING;
