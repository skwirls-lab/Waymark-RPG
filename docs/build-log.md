# Waymark app: build log

The memory between build sessions. Read `docs/instructions.md` first.

## Current position

- **Phase:** 0 (Foundations), built, gate not yet passed
- **Task:** waiting on John's phase 0 set-up (Hosting site, Firestore, sign-in methods, deploy permission), then confirm CI deploys the app and rules
- **Last verified commit:** see "Gate evidence"
- **To run everything in a build container:** `WAYMARK_NO_GOOGLE_NETWORK=1 npm run verify` (see decision 1). CI runs plain `npm run verify`.

## Phase status

| Phase | Status | Gate passed on |
|---|---|---|
| 0 Foundations | Built; waiting on set-up and first full deploy | |
| 1 Rules as data and code | Not started | |
| 2 Character sheets | Not started | |
| 3 Campaigns and joining | Not started | |
| 4 Live play | Not started | |
| 5 Warden tools and campaign record | Not started | |
| 6 Plans, payments and policies | Not started | |
| 7 AI help | Not started | |
| 8 AI Warden | Not started | |
| 9 Launch readiness | Not started | |

## Phase 0 tasks

- [x] 1. npm workspaces
- [x] 2. Formatting, lint, strict types
- [x] 3. App skeleton with PWA and design tokens
- [x] 4. Firebase config, deny-all rules, emulators
- [x] 5. Sign-in, sign-out, home screen
- [x] 6. `npm run verify`
- [x] 7. Single CI workflow: verify, then deploy
- [x] 8. Link from the rules site to the app
- [x] 9. Build log up to date

## Gate evidence

### Phase 0 (in progress)

- Local `verify` from the build container: format, lint, types, 5 unit tests, both builds, 8 security-rules tests, 10 end-to-end tests (5 flows at phone and tablet sizes), all passing. One test left out locally, per decision 1.
- Rules site: builds, search returns results, colours unchanged after the token split.
- CI run 45455147031 on commit ad22e06: `verify` passed, including the Google-window test (12 end-to-end tests). The rules site deployed.
- Still needed: app and rules deployed, and both addresses responding. The deploy stopped with "Permission denied to get service firestore.googleapis.com", which John's phase 0 set-up resolves.

## Decisions made without asking

1. **2026-11-24. One end-to-end test is left out in build containers.** "The Google button opens the sign-in window" loads a script from Google's servers, which the build container's network blocks. It is tagged `@google-network`; setting `WAYMARK_NO_GOOGLE_NETWORK=1` leaves it out locally. CI does not set the variable and runs it. A second test, "a Google user is greeted by name", covers the signed-in result everywhere using the Auth emulator's stand-in identity.
2. **2026-11-24. Deployed addresses are checked by CI, not from the build container**, which cannot reach `web.app`. The deploy job ends with a step that fetches both sites and the site's search index.
3. **2026-11-24. Firebase web configuration.** `app/src/firebase-config.ts` holds the public config. While its `apiKey` is empty, the app asks Firebase Hosting for the config at start-up (`/__/firebase/init.json`) and remembers it for offline starts. If John supplies the registered web app's config, commit it there.
4. **2026-11-24. The database code loads on first use**, not at start-up, so the sign-in screen stays small (about 120 kB compressed instead of 280 kB).
5. **2026-11-24. The sign-in window opens in the same tick as the tap.** Browsers block pop-ups opened after an `await`, so the Google button uses already-started services.
6. **2026-11-24. The site's link to the app is labelled "App (preview)"** in the header only, since the app is an empty shell until phase 2.
7. **2026-11-24. Shared design.** The site's colour and type tokens moved to `site/src/tokens.css`; the app imports that file and `site/src/logo.svg` directly.
8. **2026-11-24. Formatting check skips Markdown, the site's HTML fragments and SVGs**, so the rulebook text and hand-written pages are never reflowed by a tool.

9. **2026-11-24. CI runs on Node 24**, because the Firebase web SDK (version 13) requires it. Cloud Functions will still target the Node 22 runtime. The build container has Node 22, where the SDK works with a warning.
10. **2026-11-24. The test server binds to 127.0.0.1 explicitly.** On GitHub's runners "localhost" resolved to IPv6 and the end-to-end tests could not find the server.

## Changed tests

*(Old expectation, new expectation, reason.)*

## Questions for John

1. **Phase 0 set-up (asked 2026-11-24).** Create Hosting site `waymark-rpg-app`; create the Firestore database; turn on Google and Anonymous sign-in and authorise the app's domain; grant `github-deploy` the Firebase Rules Admin and Service Usage Viewer roles; register a web app and send its config. Then re-run the CI workflow.

## Suggestions

*(Ideas outside the plan. Not to be built without John's say-so.)*
