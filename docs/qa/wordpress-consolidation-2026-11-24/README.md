# Consolidation qualification ledger

Initial sources: main3d9220a140d61df5effe633bc72cf5142c4a8371, PR61/3131df44bb7f6bb006a2dac6bcbac29591f288e9 and Cursor PR60/6ad3ec96d3c18f06d993c8e72d941fc0d90dd8e1. New branch: `feat/wordpress-consolidation`; version0.1.0-alpha.6. This record never borrows a pass from a comparison branch.

Local checks: TypeScript API/web typecheck and production builds pass. Web22 and reference16 tests pass; the latter includes Cursor's parallel port test. Fixture safety2 and infrastructure Python45 pass. Production dependency audit reports no known vulnerabilities. PHP/PostgreSQL/Docker/browser runtime checks have not run locally in this workspace; they are assigned to the full CI matrix. No estate site has been changed.

Source acceptance reuses the previous37 focused passes. Pass38 reconciles both exact current branch heads and their actual green CI, including Cursor's HTTPS job that had not yet been reflected in its old narrative. Pass39 inspects shared registry URL rejection, missing-extension policy, audit/storage guards, test isolation and TLS fixture trust/resource/lockfile boundaries. Consequential findings are CURRENT-REPO-FACT; ADR013 records the owner-authorized consolidation and Stage A/B scope. No raw source pack, historical conversation or credential is committed.

Expected CI scope: PHP8.3/8.4/8.5 protocol/static/package, native Windows ZIP, five full two-WordPress matrices, representative hostname HTTPS/nginx/PHP-FPM, API/schema/port repeatability, existing UI/PWA/IAM/theme/container regressions. Exact source, results and package hash must be appended only after observation.

Actual CETECH/FLAIROC backup/restore, controlled installation, licensed stack/cache/security/extension behavior and public-site SSO remain separate gates. Multisite and arbitrary external publisher activation remain unsupported. Issue59 stays open.
