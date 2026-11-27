# Concise product pages — 27 November 2026

The owner reported that the pages were becoming too wordy. Routine screens now emphasize the current task, status and actions. Repeated identity/authorization/rollout explanations are removed from the main flow or moved into closed details and Help. Action consequences, permission denials, error remedies, field labels and confirmations remain.

The overview retains all three exact capability sentences in a named **Operator permissions** region. The actual-worker test now checks that region and its capabilities rather than requiring a technical sentence about database grants. Revocation and expiry must remove the region even from hidden markup; the existing worker, cache, denial and cryptographic checks remain.

## Presentation comparison

The same loopback synthetic presentation API and production Next standalone runtime were used before and after the edits at1366×900. Counts use whitespace-separated `main.innerText`, including action labels and fixed fixture values, excluding the shared header/navigation and content inside closed details. These are controlled presentation counts, not live account statistics or an enforced word budget. [Full measurements](visible-copy.json).

| Page | Before | After | Fewer visible words |
|---|---:|---:|---:|
| Admin overview |262|91|65%|
| Account |117|67|43%|
| Identity |76|31|59%|
| Personal & organizations |94|38|60%|
| Developer tools |127|90|29%|
| Home |272|182|33%|
| Help |326|36|89%|

Help retains the answers behind topic summaries. Removing duplicate cards and the repeated header brand line also reduces visual repetition. Privacy information, security checks, routing, API contracts and service-worker behavior are unchanged.

## Verification

On the explicitly dirty candidate above main963c6ef:85web tests, typecheck, production build and all14retained UI browser groups pass. All18actual-worker/operator,11round-two and7round-three joined production-browser/API/PostgreSQL groups pass. Confirmations, unsaved-form protection, native submissions, roles, exact callback transport and cross-origin denial remain covered. The 200% text test still measures32px text in a390px viewport with no overflow. Synthetic screenshots of the account/admin pages were visually reviewed.

The first UI run exposed a fixture locator that assumed there was only one details element. It now targets the disclosure containing the actual optional backchannel field; all transport and mutation-count assertions remain. The subsequent run passes all14groups. Exact committed-tree CI is a separate gate.

## Deployment boundary

[Operator evidence ba39cd8](https://github.com/WB-DevWorld/AccessLobby/commit/ba39cd813f96d0bc1f297fb8e51180a05b83566b) confirms the preceding c4206d9a release and activated worker are already live. The later5f6008d confirms a fresh owner session but finds capability/table elements hidden behind the route loading screen, without failed asset requests. Its signed-in visible acceptance remains blocked, and the boundary correction has a separate regression below. The copy candidate has not been deployed by this investigation. The owner’s three grants need no regrant; IAM, SMTP, tokens, WordPress and runtime pins were not changed here. Issues59/72/74/76 retain their remaining live gates.

## Reproduced hidden-admin rendering boundary

The later actual-profile evidence5f6008d changes the priority: the owner was signed in, the worker active, and all assets had loaded, but authorized markup and tables were hidden behind the admin loader. The prior cache fix did not resolve that live observation.

Next16.4.6’s vendored React server source schedules its initial shell timestamp with `requestAnimationFrame` (`react-dom-server.node.production.js:2401`). `$RC` queues completed boundary nodes in `$RB` and, before that timestamp exists, schedules the reveal `$RV` through another animation frame (:2552). Stylesheet completion `$RR` separately awaits CSS promises (:2556). This source explains how successful downloads can coexist with hidden completed content; it does not establish the actual Edge profile’s frame, focus, CSS-readiness or script-execution state.

The new actual-worker regression holds only an owned page’s animation callbacks at document start. JavaScript and CSS continue normally. Against the compiled copy candidate **with the original admin route boundaries**, it fails after5seconds:8worker-delivered scripts and2stylesheets succeed, with zero failed assets and zero runtime errors. The permissions region exists at0×0, the loader is visible, two reveal pairs are queued and the shell frame is unrecorded. Releasing the held frames empties the queue and makes the permissions968×25.59pixels while hiding the loader. The expected failed run remains recorded as failed. This reproduces the hidden-content mechanism; it does not assert that Edge background state caused the real incident.

The product correction removes only `admin/loading.tsx` and its nested organization loading boundary. Every admin page still awaits its existing identity/session/role and record checks before returning content. Other account skeletons and the optional sidebar-link boundary remain. No CSS forcibly reveals hidden content, no credentials are exposed, and no authentication caching or permission bypass is introduced. The regression additionally requires visible authorized overview/four directories with page scripts disabled after worker installation, plus visible ordinary/revoked/expired denial with no hidden permissions or tables. Candidate runtime and exact-head CI verdicts are recorded separately.

The injected script-disabled phase produces browser-rejected script requests. A separate anonymous, credential-free production Next probe confirmed Chromium reports the exact literal reason `csp` under CDP script disabling. The fixture keeps these failures in its categorical report and accepts only that exact script-policy reason or `ERR_ABORTED` during the explicit injected phase. Normal CSP/blocked/network errors, stylesheet failures and all HTTP errors remain fatal. This separates deliberate script suppression from real asset transport regressions; no product error is silently reclassified.

The rebuilt candidate passes all23joined operator groups, including all original18 plus the frame-gated case and four script-disabled visibility/denial groups. Both fault modes show the overview, all four directories and the nested organization Members table. Ordinary, revoked and expired sessions receive visible denial without hidden permissions/tables. All11round-two and7round-three browser groups also pass. Runtime error count and unexpected static failures are zero; only the deliberately suppressed script-policy requests are classified as expected. The prior85web tests, production build/typecheck and14retained UI groups remain green. Exact committed-tree CI and actual Edge/staging qualification are still separate.

[Incremental rollout and safe actual-profile checks](../../runbooks/operator-rendering-and-copy-followup.md).

## Committed release qualification

[PR83](https://github.com/WB-DevWorld/AccessLobby/pull/83) merged as713140ad93ba1ade406ec6af4cfffb052a817a9c with exactly the qualified head01143da06a6623522d63c250dcddd2f87794e35a/treed73dc724b786efd60eb8aa4d823b1948988aff8a. All5headchecks (CI46037788982/theme46037788951/security), main CI46038462056 and theme46038461967 pass. The source-bound publisher46039027634/job140641684360 passes; its actual checkout and all4tags were checked against713140ad. [Immutable release pins](../../releases/operator-rendering-copy-staging-2026-11-27.json).

Main verify140639773355 retains23operator+14UI+11round2+7round3 browser groups and the other checks above. Main operator artifact15219652211 has digestsha256:b3c756a606326d5a4939d2c9c5f06ae079730ac438f37265158a1b7fbb0792b3. This establishes source qualification/publication; it does not replace actual Edge or staging acceptance. The confirmed existing role grants require no regrant, and the update adds no migration.
