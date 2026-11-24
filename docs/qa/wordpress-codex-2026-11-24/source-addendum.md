# Continued focused source acceptance

The existing28-pass acceptance and alpha.4 passes29–33 remain the baseline; this increment does not replace historical findings with new owner decisions.

| Pass | Focus and direct input | Finding / classification |
|---|---|---|
| 34 | Current branch a0583c09 and current external preview/API/Next/PWA source | CURRENT-REPO-FACT: consent records existed without review/withdrawal screens or a registration fingerprint. No external client could activate. Current API/main status must still be distinguished from this PR. |
| 35 | WordPress official `is_page` and `wp_login_form` reference, current Surfaces/Admin code, real WP7.1.5 fixture | SOURCE-CONFIRMED: page-ID conditionals work after query resolution; login forms may occur anywhere. NEW-RECOMMENDATION: explicitly select dedicated published login pages, avoid interpreting a public footer action as mandatory site login. |
| 36 | OpenID Connect Core consent/subject sections; current app-scoped identity storage and negative live token probe | SOURCE-CONFIRMED: consent and pairwise subjects are separate protocol concerns. CURRENT-REPO-FACT: changing token subject alone failed the token-wide session-privacy gate. MVP-PROVISIONAL: closed minimal product review, context-bound consent and re-consent after configuration change. No external activation policy is inferred. |
| 37 | Current application URL/proof, identity/session and preview lifecycle implementations; actual PostgreSQL migration tests | CURRENT-REPO-FACT: existing requests expose no public registration edit/activation path. NEW-RECOMMENDATION: invalidate review at the DB boundary on covered changes and retain approved display snapshots so a transfer or reverted URL cannot silently reuse consent. Retention/erasure remains DEFERRED. |

Primary retrieval URLs: https://developer.wordpress.org/reference/functions/is_page/ ; https://developer.wordpress.org/reference/functions/wp_login_form/ ; https://openid.net/specs/openid-connect-core-1_0.html#Consent ; https://openid.net/specs/openid-connect-core-1_0.html#SubjectIDTypes . No raw historical export or credential is committed.
