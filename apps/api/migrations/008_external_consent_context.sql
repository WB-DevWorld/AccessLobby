-- No backfill: previous preview approvals require a fresh private origin review and consent.
ALTER TABLE external_app_profiles ADD COLUMN IF NOT EXISTS config_fingerprint text
  CHECK (config_fingerprint ~ '^[a-f0-9]{64}$');
ALTER TABLE external_app_consents ADD COLUMN IF NOT EXISTS config_fingerprint text
  CHECK (config_fingerprint ~ '^[a-f0-9]{64}$');
ALTER TABLE external_app_consents ADD COLUMN IF NOT EXISTS site_name text;
ALTER TABLE external_app_consents ADD COLUMN IF NOT EXISTS site_origin text;
-- Remember that a reviewed configuration changed, even if a later edit restores the same URLs.
CREATE OR REPLACE FUNCTION invalidate_external_review_context() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.client_id,OLD.name,OLD.owner_person_id,OLD.platform,OLD.redirect_uri,OLD.logout_uri,
      OLD.backchannel_logout_uri,OLD.admission,OLD.visibility) IS DISTINCT FROM
     (NEW.client_id,NEW.name,NEW.owner_person_id,NEW.platform,NEW.redirect_uri,NEW.logout_uri,
      NEW.backchannel_logout_uri,NEW.admission,NEW.visibility) AND
      EXISTS(SELECT 1 FROM external_app_profiles WHERE application_id=OLD.id) THEN
    UPDATE external_app_profiles SET config_fingerprint=NULL WHERE application_id=OLD.id;
    WITH withdrawn AS (
      UPDATE external_app_consents SET state='withdrawn',withdrawn_at=now(),revision=revision+1
      WHERE application_id=OLD.id AND state='granted' RETURNING application_id,person_id)
      INSERT INTO application_events(application_id,actor_person_id,action)
      SELECT application_id,person_id,'external_consent.invalidated' FROM withdrawn;
    INSERT INTO application_events(application_id,action) VALUES(OLD.id,'application.external_review_invalidated');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS external_review_context_changed ON applications;
CREATE TRIGGER external_review_context_changed BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION invalidate_external_review_context();
INSERT INTO schema_migrations(version) VALUES ('008_external_consent_context') ON CONFLICT DO NOTHING;
