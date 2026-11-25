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
] as const;
