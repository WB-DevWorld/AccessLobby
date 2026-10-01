# Enben Notes implementation qualification — October 1, 2026

The owner approved the empty `enben.realjanelove.com` hostname and asked for a small app to test protected access. [PR #56](https://github.com/WB-DevWorld/AccessLobby/pull/56) adds optional Enben Notes mode to the independent consumer, a separate Compose application and [plain-English live steps](../runbooks/enben-notes-staging.md). [#44](https://github.com/WB-DevWorld/AccessLobby/issues/44) remains the live onboarding gate. The existing pilot and AccessLobby PWA deployment are unchanged.

Qualified code source: `54baeaab10f4546f31770e527bc4d1c5a408b916`, exact tree `a4a3ecb5dff0085c9c45989fa21fef55c9deb251`. Local equivalent commit `4e3a823` has the same tree. [CI 36863103054](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36863103054) and [theme 36863103140](https://github.com/WB-DevWorld/AccessLobby/actions/runs/36863103140) qualify this exact source. Later evidence-only commits still require their own normal checks; publication/deployment cannot be inferred from this record.

Both verify and IAM CI jobs PASS; the separate theme workflow PASS. The normal verification job also passed PostgreSQL cases, dependency audit, builds, Compose boundaries and consumer container/proxy checks.

## What the tests establish

| Check | Status | Evidence and boundary |
| --- | --- | --- |
| Local consumer tests | PASS | 15/15: two-account note ownership, create/edit/delete, escaped script/text, exact-Origin/content/size validation, bounded storage, current entry denial/outage, note retention after local sign-out, shared logout destination, signed/invalid/replayed backchannel events. |
| Local regression | PASS | Web 21/21, Python 41/41, full typecheck/build; API 11 runnable cases PASS. |
| Local PostgreSQL cases | NOT RUN | 8 cases require PostgreSQL; the normal CI job runs them against its disposable database. |
| Notes UI in Chromium | PASS | Browser fixture checks real HTML/forms for create/edit/delete, another-account denial, unavailable check/reconnect, local sign-out, focus and 44px controls. Widths: 360, 390, 412, 768, 1366, 1440. |
| Real IAM and actual peer | PASS | IAM job `110371897614` emits `ENBEN_REAL_IAM_PASS` at `2026-10-01T12:40:06.2948709Z`: browser Code/PKCE, real peer callback/JWKS/API entry, two-person note read/write/delete isolation, current-app sign-out, password-free IAM SSO return, shared sign-out confirmation, IAM authentication required afterwards. |
| Joined onboarding regression | PASS | The same IAM job emits all five existing onboarding PASS phases at 12:40:02–12:40:06 UTC: actual IAM/PostgreSQL/API activation/readback, open and restricted admission, person/membership/resource separation, expiry/revoke/suspension and transport denial. |
| Installed AccessLobby PWA regression | PASS | Normal production smoke checks manifest/worker/offline, controlled A→B, critical/dirty/unresponsive windows, safe retry and preserved state. This is CI regression, not a new installed staging release. |

The notes UI pass uses disposable signed IAM/API fixtures with one-use codes and PKCE validation. The real IAM pass uses disposable Keycloak, PostgreSQL, the actual API and an activated registry app. Its browser captures the real IAM redirect to a fixture HTTPS hostname and sends the code/state and explicit opaque cookies to the actual peer over loopback HTTP. Secure/HttpOnly/Host cookie attributes are checked; deployed HTTPS browser-cookie transport is not established. DNS answers and independent review references are fixtures. These tests create no staging people, clients, grants or DNS records. They do not establish live two-app backchannel propagation.

The app stores notes under the independently generated peer-local account ID. Central identity confirms a person; current API entry admits them to Enben; neither a central person ID nor an organization role grants another person's note. All private HTML is `no-store`. Notes mode refuses to start without app-entry checking. Writes require the exact Enben Origin and current admission. No offline queue, token browser storage, IndexedDB, public post or profile system was added. Notes, account links and sessions are disposable memory and disappear on restart.

## Live gates

| Gate | Status | Next evidence |
| --- | --- | --- |
| Enben deployment | BLOCKED | Protected Dokploy access is unavailable in this workspace. Deploy the newly published consumer by its exact qualified digest in the separate Enben Compose project. |
| Signed-in app request | BLOCKED | Secure sign-in was submitted, but the fresh AccessLobby page still showed sign-in; no app request was submitted. |
| Actual DNS TXT proof | NOT RUN | Copy the generated record from the inactive app request and verify its actual public DNS answer. |
| Independent first-party review | NOT RUN | Record an independent decision for this app, entry policy and exact callback/logout/backchannel URLs. |
| Protected activation/readback/recovery | BLOCKED | Requires the private operator, reviewed request and verified database recovery baseline. |
| Live HTTPS sign-in and note ownership | NOT RUN | Two controlled accounts, actual browser cookie transport, one private note accessed from each account. |
| Live two-app shared sign-out | NOT RUN | Signed event must terminate the matching deployed peer session and preserve the other person's session. |
| Live suspension/outage behavior | NOT RUN | Previously signed-in note view/write must fail closed after suspension or entry transport failure. |

The public AccessLobby API last reported accepted Build B `91e1a66167aa4a74dea44062e41849f8e8efb02c` at `2026-10-01T11:00:42.784065+00:00`. Enben DNS resolves through Cloudflare; workspace edge 403/1010 and cloud-browser `ERR_BLOCKED_BY_CLIENT` do not establish origin content or deployment failure. The owner explicitly confirmed no app was present. Do not treat the new image publication as a staging rollout or close #44 from CI alone.
