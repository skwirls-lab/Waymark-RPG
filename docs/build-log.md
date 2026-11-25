# Waymark app: build log

The memory between build sessions. Read `docs/instructions.md` first.

## Current position

- **Phase:** 4 (Live play), in progress
- **Task:** phase 4 built; gate pending CI
- **Last verified commit:** 8e9bf9d (CI run 45491052219: verify, all deploys, live guest sign-in and Lighthouse green)
- **To run everything in a build container:** `npm run verify:container` (see decisions 1 and 22). CI runs plain `npm run verify`.

## Phase status

| Phase | Status | Gate passed on |
|---|---|---|
| 0 Foundations | Complete | 2026-11-24 |
| 1 Rules as data and code | Complete | 2026-11-24 |
| 2 Character sheets | Complete | 2026-11-24 |
| 3 Campaigns and joining | Complete | 2026-11-25 |
| 4 Live play | In progress | |
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

## Phase 3 tasks

- [x] 1. Cloud Functions set-up, tested in the emulator, deployed from CI
- [x] 2. Create a campaign (one for free accounts)
- [x] 3. Join by code, link or QR
- [x] 4. Three kinds of character; Warden-run capped at six
- [x] 5. Hand-over with a one-time code
- [x] 6. Warden brings their own character
- [x] 7. Guest becomes an account holder and keeps everything
- [x] 8. Summaries for other members
- [x] 9. Permission choice per member
- [x] 10. Leaving, removing members, deleting a campaign

## Phase 4 tasks

- [x] 1. Warden actions as pure functions in the rules library
- [x] 2. Sheet changes that rebase on the latest saved sheet, so simultaneous changes are both kept
- [x] 3. Party view with Warden actions, and several targets for a Blast
- [x] 4. Direct or ask first, enforced by security rules; requests
- [x] 5. Save prompts
- [x] 6. Shared dice and activity feed
- [x] 7. Undo of the most recent change
- [x] 8. Presence

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

### Phase 2 (gate passed 2026-11-24)

- CI run 45471350857 on commit 3227ec5: `verify` passed (244 rules, 44 app, 23 security-rules, 34 end-to-end tests including the Google sign-in window); site, app and rules deployed.
- Lighthouse on the deployed app, three runs: performance 100, 99, 99 (median 99); accessibility 100 each time.
- Phone-size screenshot of the sheet sent to John.

- Local `verify`: 242 rules tests, 44 app component tests, 23 security-rules tests, 32 end-to-end tests (16 flows at phone and tablet sizes), all passing.
- End-to-end flows: build Wren from typed rolls with an accessibility and layout check on every step; saved character survives reload; no second character offered; half-made character survives leaving; damage into Strength with a Strength save; exactly 0 HP leads to a Scar; Ability misfire under danger; every slot full means 0 HP and rest behaves correctly; a change made offline reaches the server after reconnecting; dice and saves; delete frees the slot.
- Security rules: owner-only characters, well-formedness, the one-character limit (including for guests, and slot numbers of zero or below), and entitlements that only the server can write.
- Defects the tests found and that were fixed: orange small text had too little contrast (now a darker `--blaze-text`, applied to the site as well); quick taps in a row could lose a change because the screen waited for the database (saves now update the screen at once); the Google sign-in window was opened after an `await` (fixed in phase 0).

### Phase 3 (gate passed 2026-11-25)

- CI run 45491052219 on commit 8e9bf9d: `verify` passed; site, app, rules and all nine Cloud Functions deployed; the live check signed in as a guest on the deployed app and signed out; Lighthouse three runs gave performance 71, 100, 99 (median 99) and accessibility 100.
- Real Google sign-in on the deployed app has not been verified by any test; John was asked to try it by hand.

- Local `verify`: 244 rules, 44 app, 47 security-rules, 32 Cloud Functions and 42 end-to-end tests, all passing.
- Security-rules matrix (`tests/rules/phase3-campaigns.test.ts`): Warden, player, guest and stranger against the campaign record, member list, players' characters, summaries, Warden-run characters, memberships, join codes and hand-over codes, each with allowed and refused cases.
- Cloud Functions (`tests/functions/campaigns.test.ts`): good and bad join codes; used, bad and orphaned hand-over codes; the one-campaign limit including three simultaneous requests; paid plans; leaving, removing and deleting with full clean-up; summaries following characters; malformed sheets.
- End to end, three devices: a Warden starts a campaign; an account holder joins by code and brings a character in; a guest follows the join link while signed out; the Warden adds a character to run; all three see the right summaries and only the Warden sees the join code and the full Warden-run sheet; a change to a sheet reaches the others' summaries; another player cannot open a full sheet by its address; the permission choice shows for the Warden; hand-over works once; a guest becomes an account holder and keeps everything; leaving, removing and deleting.
- Defects the tests found and that were fixed: screens did not refresh after a guest created an account; a removed player's open screen did not show they had been removed; the permission choice lagged until the server answered; the summary trigger crashed on a malformed sheet.

### Phase 4

- Local `verify`: 268 rules, 54 app, 65 security-rules, 34 Cloud Functions and 60 end-to-end tests, all passing.
- **Two-second requirement:** time from the Warden pressing Apply to the player's HP changing on a second device, measured in the test itself: 202 ms (phone), 196 ms (tablet). The test fails above 2,000 ms.
- End to end, two and three devices: direct damage with feed entry and undo; damage to exactly 0 HP sends the player a Scar roll and the Warden sees its result; give and take items, add Fatigue, award a Tier; a Warden change and a player change at the same moment are both kept (checked on screen and in the stored document); ask-first accept with its follow-up Strength save; ask-first decline and clearing; a called save and its result; a Blast across three characters; open dice, sheet changes in the feed, and presence.
- Security rules (`tests/rules/phase4-live-play.test.ts`): the Warden's direct write succeeds for "directly" and is refused for "ask me first", follows a change of choice at once, and covers the sheet only; requests can be created only by the Warden and answered only once, only by their player, without altering what was asked; the feed is append-only and in one's own name; presence is one's own.
- Defects the tests found and that were fixed: the browser's online flag reported "online" for a moment while offline, sending one change down the online path where it raced an earlier queued one and lost it (seen as fatigue 1 instead of 2 on the server); the randomized rules tests were generating characters carrying more than their slots allow.

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

22. **2026-11-24. `npm run verify:container`** runs verify with the proxy variables unset and the Google-window test left out. In the build container the functions emulator's call to the Firestore emulator on 127.0.0.1 was being sent through the outbound proxy and refused. CI is unaffected.
23. **2026-11-24. Campaign ids are `<warden uid>_<slot>`,** the same device used for characters, so the one-campaign limit holds even when several requests arrive together. Warden-run characters use ids `w1` to `w6`, which makes the cap of six a security rule.
24. **2026-11-24. Each user has a `memberships` list** under their own record, written by the functions, so the home screen can show their campaigns without searching every campaign.
25. **2026-11-24. New players start on "ask me first"** and the Warden's own entry is "direct". Players change theirs on the campaign page.
26. **2026-11-24. Summaries are written by two Firestore triggers** using the rules library's `status`. The functions are bundled into one file with esbuild so the rules library ships inside them; the functions package lists only its two runtime dependencies.
27. **2026-11-24. Join links for signed-out visitors.** The path is remembered for the session, and the join form opens after sign-in with the code filled in.
28. **2026-11-24. A removed player learns of it from the member list.** Firestore does not close a listener when access is withdrawn, so the campaign page treats "I am no longer in the member list" as removal.

29. **2026-11-24. Summary triggers read the character as it is now.** CI exposed a race: a trigger for an earlier change to a Warden-run character ran after the character had been handed over and recreated its old summary. The triggers no longer trust the event's snapshot. They read the current document, apply, re-read, and repeat if it changed, removing any summary they wrote for a campaign the character has since left. A transaction was tried first and rejected: it locks the character's document, the one players write to during play, and the emulator timed out other writers.

30. **2026-11-24. Local changes outrank older echoes from the database.** A rare lost update remained after decision 14's first fix: with several quick taps, the database's echo of an earlier save could briefly replace the newer on-screen sheet, and the next tap built on the stale copy. Each save now carries a strictly increasing timestamp, and a reported copy replaces the local one only when it is at least as new. Unit-tested in `useCharacters.test.ts`.

31. **2026-11-24. Hand-over swaps the summaries in one transaction,** and the end-to-end test waits for one "Pip" row before reading it. For a moment after a hand-over the Warden's list could show the old and new summary together (1 run in 12 locally). Summaries are consistent within moments by design; the test now asserts the settled state.

32. **2026-11-24. A live sign-in check after every deploy.** John found that neither guest nor Google sign-in worked on the deployed app, though every gate had passed. The emulator-backed tests cannot see whether sign-in is switched on in the real project, and the post-deploy check only fetched the page. CI now signs in as a guest on the deployed app after each deploy, and the app shows the reason and code when sign-in fails. This gap means the phase 0 and phase 2 gates were recorded without real sign-in ever having been exercised.

33. **2026-11-25. Sheet changes are functions, not results.** Every change to a sheet is now a function of the sheet. It runs at once on the copy shown, and again inside a transaction on the copy the server holds, so two people changing one character at the same moment both keep their change. Changes to one character are sent in order.
34. **2026-11-25. Three signals decide whether to queue a change offline:** the browser's online flag, whether Firestore's latest answer came from its local copy, and whether an earlier change to the same document is still waiting. The browser's flag alone was wrong for a moment in tests (decision evidence above).
35. **2026-11-25. Undo is stored on the character itself,** as the sheet from before the most recent change with a line saying what it was. It is visible to exactly the people who can see the sheet, and is written in the same step as the change.
36. **2026-11-25. Requests.** In "ask me first" a Warden's change is stored as a request holding the action as data; the player's own device applies it on acceptance. Follow-up rolls after a direct change (a Scar, a Strength save) are also sent to the player as requests, since they are the player's dice. A Warden-run character's follow-ups are rolled on its sheet by the Warden.
37. **2026-11-25. The feed takes every sheet change in a campaign,** not only rolls, in the words the sheet already shows. Entries can never be edited or deleted, by anyone.
38. **2026-11-25. Presence** is a timestamp each member refreshes every 30 seconds while the campaign or their sheet is open; someone counts as here for 75 seconds after the last one.
39. **2026-11-25. When Fatigue has nowhere to go under a direct Warden change,** the Warden is told to take an item first or ask the player to put something down. Which item to drop is the player's choice, so the app does not pick one.
40. **2026-11-25. Hand-over moved into the Warden's "Act" dialog** for a Warden-run character.

## Changed tests

- **Phase 3 hand-over end-to-end step (2026-11-25).** Old: pressed a "Hand over" button on the party row. New: opens "Act on Pip" and presses "Hand this character to a player". Reason: decision 40.
- **Randomized rules tests (2026-11-25).** Old: generated characters could carry more than their capacity. New: the generator keeps only what fits, and a test asserts every generated character is one the rules could produce. Reason: an impossible starting character was being reported as a rules failure.
- **Sheet component tests (2026-11-25).** Old: the test harness received whole changed sheets. New: it receives change functions and applies them. Reason: decision 33.
- **Cloud Functions summary assertions (phase 3, same day).** Old: checked the moment a function returned. New: wait up to five seconds for the settled state. Reason: summaries are kept by background triggers and are consistent within moments, not instantly; the emulator runs those triggers alongside the tests.
- **Cloud Functions summary tests (phase 3, same day).** Old: `syncOwnedSummary` and `syncWardenSummary` were given before-and-after snapshots. New: they are given only ids and read the stored document, so the tests now store the document first. Reason: decision 29.
- **Phase 0 "nothing is readable or writable".** Old: `users/alice` and `characters/c1` were refused for everyone. New: those two paths are opened by phase 2 with their own allowed-and-refused tests; the deny-all test now covers only paths no phase has opened. Reason: phase 2 legitimately opens them, as the test's own comment anticipated.

## Questions for John

1. **Please try "Continue with Google" on the deployed app (asked 2026-11-24, not blocking).** Guest sign-in is now checked automatically after each deploy. A real Google sign-in cannot be automated, so it has only ever been tested against the emulator.

*(Resolved 2026-11-25: sign-in methods enabled; the live guest check passes. Resolved 2026-11-24: Cloud Functions permissions.)*

## Suggestions

*(Ideas outside the plan. Not to be built without John's say-so.)*
