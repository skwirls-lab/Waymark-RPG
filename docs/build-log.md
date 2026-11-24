# Waymark app: build log

The memory between build sessions. Read `docs/instructions.md` first.

## Current position

- **Phase:** 2 (Character sheets), in progress
- **Task:** phase 2 built; gate pending CI
- **Last verified commit:** 654577d (CI run 45461173372: verify and deploy both green)
- **To run everything in a build container:** `WAYMARK_NO_GOOGLE_NETWORK=1 npm run verify` (see decision 1). CI runs plain `npm run verify`.

## Phase status

| Phase | Status | Gate passed on |
|---|---|---|
| 0 Foundations | Complete | 2026-11-24 |
| 1 Rules as data and code | Complete | 2026-11-24 |
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

## Phase 2 tasks

- [x] 1. Firestore `users` and `characters`, owner-only rules
- [x] 2. Character builder (six steps)
- [x] 3. The sheet
- [x] 4. Sheet actions through the rules library
- [x] 5. Dice roller
- [x] 6. One-character limit for free accounts
- [x] 7. Offline use
- [x] 8. Home screen lists characters

## Gate evidence

### Phase 0 (gate passed 2026-11-24)

- Local `verify` from the build container: format, lint, types, 5 unit tests, both builds, 8 security-rules tests, 10 end-to-end tests (5 flows at phone and tablet sizes), all passing. One test left out locally, per decision 1.
- Rules site: builds, search returns results, colours unchanged after the token split.
- CI run 45455147031 on commit ad22e06: `verify` passed, including the Google-window test (12 end-to-end tests). The rules site deployed.
- CI run 45458501566 on commit c77692e: `verify` passed; rules site, app and security rules deployed; the workflow's final step fetched both addresses and the site's search index successfully.
- Summary: npm workspace, app shell with Google and guest sign-in, deny-all rules, emulator-backed tests, one verify-then-deploy workflow. Nothing left over.

### Phase 1 (gate passed 2026-11-24)

- CI run 45461173372 on commit 654577d: `verify` passed and the deploy succeeded.

- Local `verify`: 234 rules tests in 13 files, all passing; coverage of `rules/src` at 100% lines, 100% functions, 99.79% branches (thresholds are 95%). Phase 0's 5 unit, 8 security-rules and 10 end-to-end tests still pass.
- `rules/COVERAGE.md` lists all 38 rulebook sections with the code and tests for each, or a note that the section is advice. A test fails if a section is missing or a named function does not exist.
- Rulebook text: comparing the rulebook before and after, with the new marker lines removed, shows no difference. The built site still has 26 tables.
- 15 lists in the rulebook are produced from `rules/data` and checked on every `verify`.
- A real defect found by the tests: kit entries such as "Great hammer (d10, bulky)" were being split at the comma inside the brackets. Fixed in the data.
- Summary: `rules/` holds 14 data files with schemas and a pure library covering dice, saves, creation, inventory, Fatigue, armor, attacks, harm, Scars, rest, Abilities and their costs, Tiers, corruption, imbuing, special items, reactions, morale, crowds and tabletop distances. Nothing left over.

### Phase 2

- Local `verify`: 242 rules tests, 44 app component tests, 23 security-rules tests, 32 end-to-end tests (16 flows at phone and tablet sizes), all passing.
- End-to-end flows: build Wren from typed rolls with an accessibility and layout check on every step; saved character survives reload; no second character offered; half-made character survives leaving; damage into Strength with a Strength save; exactly 0 HP leads to a Scar; Ability misfire under danger; every slot full means 0 HP and rest behaves correctly; a change made offline reaches the server after reconnecting; dice and saves; delete frees the slot.
- Security rules: owner-only characters, well-formedness, the one-character limit (including for guests, and slot numbers of zero or below), and entitlements that only the server can write.
- Defects the tests found and that were fixed: orange small text had too little contrast (now a darker `--blaze-text`, applied to the site as well); quick taps in a row could lose a change because the screen waited for the database (saves now update the screen at once); the Google sign-in window was opened after an `await` (fixed in phase 0).

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

14. **2026-11-24. The one-character limit is enforced by the character's id.** A character's document id is `<owner uid>_<slot>`. Security rules allow slot 1 for free accounts and up to 50 for paid plans, read from an `entitlements` record only the server can write. No counter that a browser could tamper with.
15. **2026-11-24. A half-made character is kept in the browser** (local storage, per user), not in the database, so it does not use the account's one slot.
16. **2026-11-24. Manual corrections.** The sheet has plus and minus buttons for HP and attributes, limited to between 0 and the full value, for Warden rulings the app cannot know about.
17. **2026-11-24. Lighthouse runs in CI against the deployed app** after each deploy, since the build container cannot reach it. It checks the sign-in screen, the only one reachable without an account.
18. **2026-11-24. Not yet on the sheet:** choosing which Abilities to lose when corruption burns a Tier above Tier 1. Characters cannot rise above Tier 1 until phase 4 adds awarding Tiers, so this is deferred to that phase.

19. **2026-11-24. The Google sign-in window test waits for the emulator's page to be ready.** In CI the test clicked "Add new account" before that page had attached its handlers, so the click was ignored. The test now repeats that one click until the form opens. This handles a load race in a page we do not control; it is not a retry of the test.

20. **2026-11-24. First paint.** Lighthouse scored the deployed sign-in screen 71 for performance. Three changes: a static shell in `index.html` paints before any script runs; signed-in screens (with the rules library and database code) load only after sign-in; web fonts no longer block rendering. Locally the score rose to 94; deployed it reached 86. Two further changes: the sign-in library now loads after the first screen paints (a first-time visitor sees the sign-in screen at once, with its buttons enabled a moment later), and the offline cache starts three seconds after load. Locally: 98; deployed: 78, with a blocking time of 550 ms that the local run did not show. Deployed scores on GitHub's shared machines swung between 71, 86 and 78, so the gate now takes the median of three runs. The app also bundles its own fonts, removing the last outside request from the first screen and making the app look right offline.

21. **2026-11-24. Item ids are random and unique.** They were a per-session counter, which could repeat across sessions. A randomized rules test in CI then showed that if two items shared an id, dropping one to make room for Fatigue could remove the wrong one and leave a character over capacity. The drop now always removes an item that frees a slot, and ids are UUIDs. Both have regression tests.

## Changed tests

- **Phase 0 "nothing is readable or writable".** Old: `users/alice` and `characters/c1` were refused for everyone. New: those two paths are opened by phase 2 with their own allowed-and-refused tests; the deny-all test now covers only paths no phase has opened. Reason: phase 2 legitimately opens them, as the test's own comment anticipated.

## Questions for John

1. **Phase 3 set-up (asked 2026-11-24, not blocking yet).** Upgrade the project to the Blaze plan; enable the Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc, Pub/Sub and Secret Manager APIs; grant `github-deploy` the roles for deploying Functions and Firestore indexes. No reply needed: phase 3's first deploy will show whether it is done.

## Suggestions

*(Ideas outside the plan. Not to be built without John's say-so.)*
