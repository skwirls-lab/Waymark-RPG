# Waymark app: build log

The memory between build sessions. Read `docs/instructions.md` first.

## Current position

- **Phase:** 1 (Rules as data and code), built; gate pending CI on the phase 1 commit
- **Task:** next is phase 2, task 1 (Firestore `users` and `characters`, owner-only rules)
- **Last verified commit:** see "Gate evidence"
- **To run everything in a build container:** `WAYMARK_NO_GOOGLE_NETWORK=1 npm run verify` (see decision 1). CI runs plain `npm run verify`.

## Phase status

| Phase | Status | Gate passed on |
|---|---|---|
| 0 Foundations | Complete | 2026-11-24 |
| 1 Rules as data and code | Built; gate pending CI | |
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

## Phase 1 tasks

- [x] 1. Data files with schemas
- [x] 2. Rules library
- [x] 3. Rulebook lists produced from the data
- [x] 4. `rules/COVERAGE.md`

## Gate evidence

### Phase 0 (gate passed 2026-11-24)

- Local `verify` from the build container: format, lint, types, 5 unit tests, both builds, 8 security-rules tests, 10 end-to-end tests (5 flows at phone and tablet sizes), all passing. One test left out locally, per decision 1.
- Rules site: builds, search returns results, colours unchanged after the token split.
- CI run 45455147031 on commit ad22e06: `verify` passed, including the Google-window test (12 end-to-end tests). The rules site deployed.
- CI run 45458501566 on commit c77692e: `verify` passed; rules site, app and security rules deployed; the workflow's final step fetched both addresses and the site's search index successfully.
- Summary: npm workspace, app shell with Google and guest sign-in, deny-all rules, emulator-backed tests, one verify-then-deploy workflow. Nothing left over.

### Phase 1

- Local `verify`: 234 rules tests in 13 files, all passing; coverage of `rules/src` at 100% lines, 100% functions, 99.79% branches (thresholds are 95%). Phase 0's 5 unit, 8 security-rules and 10 end-to-end tests still pass.
- `rules/COVERAGE.md` lists all 38 rulebook sections with the code and tests for each, or a note that the section is advice. A test fails if a section is missing or a named function does not exist.
- Rulebook text: comparing the rulebook before and after, with the new marker lines removed, shows no difference. The built site still has 26 tables.
- 15 lists in the rulebook are produced from `rules/data` and checked on every `verify`.
- A real defect found by the tests: kit entries such as "Great hammer (d10, bulky)" were being split at the comma inside the brackets. Fixed in the data.
- Summary: `rules/` holds 14 data files with schemas and a pure library covering dice, saves, creation, inventory, Fatigue, armor, attacks, harm, Scars, rest, Abilities and their costs, Tiers, corruption, imbuing, special items, reactions, morale, crowds and tabletop distances. Nothing left over.

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

11. **2026-11-24. The rulebook file stays complete, and a test keeps it equal to the data.** Each list sits between `<!-- data:name -->` markers in `Waymark-Rulebook.md`. `npm run rulebook:sync -w rules` rewrites them from `rules/data`; a test in `verify` fails if they differ. The site keeps building from the rulebook file. This keeps the rulebook readable on its own while making the data the source.
12. **2026-11-24. Places where the rulebook leaves room** (how a Scar's raised score treats lost points, the 18 cap, when a second Affinity can be learned from, what "Drained" means under other costs) are listed at the end of `rules/COVERAGE.md`.
13. **2026-11-24. Ability effects are narrated, not coded.** The library runs the procedure for using any Ability (cost, save, misfire). The forty individual effects stay as text, with their numeric parts using the general functions.

## Changed tests

*(Old expectation, new expectation, reason.)*

## Questions for John

*(None open. Phase 0 set-up was completed on 2026-11-24.)*

## Suggestions

*(Ideas outside the plan. Not to be built without John's say-so.)*
