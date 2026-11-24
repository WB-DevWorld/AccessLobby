# Representative hosting fixture

Imported from Cursor PR60 at6ad3ec96d3c18f06d993c8e72d941fc0d90dd8e1 and integrated with the PR61 connector. `scripts/qualify.py --profile https` exercises distinct `a.alwp.test` and `b.alwp.test` HTTPS sites, nginx1.28/PHP-FPM8.4.28, issuer/API hostnames, trusted disposable CA and targeted shared logout. It is an additional smoke; it does not replace the five full behavior matrices.

Run only on an isolated disposable development/CI host with `ALWP_DISPOSABLE_FIXTURE=1`. The harness changes its fixture names/CA trust and starts labelled Docker resources. It rejects unlabelled name collisions and must never be pointed at estate WordPress directories or an operational IAM/database. `--keep` intentionally retains private disposable services for diagnosis. Categorical reports are the only publishable output; never upload the raw work directory, realm, mailbox, keys or logs.

Consolidation hardening: API built using the repository Dockerfile/frozen pnpm lock and compiled migrations; real typed registration/provisioning with explicitly synthetic DNS/review; restricted test-only private-address/port/CA exceptions; callback-query redaction; no resource removal after failed preflight; source/ZIP identity in every report. Host CA/network and container lifetime are explicit runbook concerns, not production configuration.
