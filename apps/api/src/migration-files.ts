export const migrationFiles = [
  '001_identity.sql',
  '002_session_revocation.sql',
  '003_organizations.sql',
  '004_applications.sql',
  '005_peer_session_receipts.sql',
  '006_wordpress_platform.sql',
  // 007/008 remain reserved for the preserved external preview development line.
  '009_platform_operators.sql',
  '010_application_reviews.sql',
  '011_person_controls.sql',
  '012_application_lifecycle.sql',
  '013_activation_jobs.sql',
  '014_application_suspension.sql',
  '015_session_inspection.sql',
] as const;
