# Waymark companion app: build instructions

This file tells an AI coding agent how to build the Waymark companion app from an empty folder to a launched product. It is written so that a session with no memory of earlier conversations can pick it up and continue.

**If you are the agent:** read this whole file, then `docs/app-plan.md`, then `Waymark-Rulebook.md`, then `docs/build-log.md`. The build log says which phase is in progress. Continue from there.

---

## 1. What you are building, and for whom

Waymark is a rules-light tabletop roleplaying game. Its rulebook is `Waymark-Rulebook.md` and its public site is in `site/`. The companion app lets players keep character sheets and lets a Warden run a campaign, with changes appearing live on everyone's device. Later phases add AI help and an AI Warden.

The owner, John, plays with his two sons and his wife. Many users will be new to roleplaying games. They will use phones at a table, sometimes with a poor connection, often mid-conversation. Every screen must be usable one-handed in a few seconds. When a design choice is unclear, choose what is quickest for a distracted person holding a phone.

`docs/app-plan.md` is the product description. This file is the build procedure. If the two disagree, the plan wins on *what* the app does and this file wins on *how* it is built. Record the conflict in the build log.

## 2. Fixed decisions

Do not revisit these without John's say-so.

| Topic | Decision |
|---|---|
| Hosting | Firebase Hosting only, never App Hosting. Project ID `waymark-rpg`, project number `786714793025`. The app is a second Hosting site, `waymark-rpg-app`. |
| Front end | React, TypeScript (strict), Vite. A single-page app, installable as a PWA. No server rendering. |
| Back end | Firestore, Firebase Auth (Google and anonymous), Cloud Functions (2nd gen, Node 22, TypeScript). |
| Deploys | GitHub Actions with keyless Workload Identity Federation, as `deploy-site.yml` already does. No service account keys, ever. |
| AI | OpenRouter, called only from Cloud Functions. The key lives in Secret Manager. |
| Screens | Phone first (390 px wide), then tablet (820 px). A wide Warden layout arrives in phase 5. |
| Terms | Use the rulebook's words exactly: attribute, Ability, Affinity, Origin, trait, Tier, Fatigue, Hit Protection, Warden, Scar, haven, imbued. |
| Look | Reuse the site's design: colors, typefaces and logo from `site/src/styles.css` and `site/src/logo.svg`. Light and dark themes. |

## 3. Repository layout

```
site/                 the rules website (exists)
rules/                game rules as data and as a tested library
  data/               JSON: origins, affinities, abilities, gear, creatures, tables
  src/                pure TypeScript functions, no Firebase imports
app/                  the React app
functions/            Cloud Functions
firestore.rules       security rules
firestore.indexes.json
tests/e2e/            Playwright tests, one folder per phase
tests/rules/          security-rules tests against the emulator
docs/                 app-plan.md, instructions.md, build-log.md
```

Use npm workspaces from the repository root. `rules` is a dependency of `app`, `functions` and `site`.

## 4. How to work

### 4.1 One command decides whether work is good

The repository root must have `npm run verify`. It runs, in order: formatting check, lint, type check, unit tests with coverage, security-rules tests, a production build of every package, and all end-to-end tests against the Firebase emulators. It exits non-zero if anything fails.

`verify` only ever grows. Each phase adds its tests to it. Passing `verify` therefore proves that every earlier phase still works. CI runs `verify` on every push, and no deploy job may run unless it passed.

### 4.2 The task loop

Each phase is a list of tasks. For each task, repeat this loop until it exits:

1. **Read** the task, the relevant part of the plan, and the relevant rulebook section.
2. **Write the tests first.** They must fail for the right reason before you write the feature.
3. **Implement** the smallest thing that satisfies the tests.
4. **Run** the tests for this task, then `npm run verify`.
5. **If anything fails:** find the cause, fix it, and go back to step 4.
6. **If everything passes:** commit, push, tick the task in the build log, and take the next task.

This is the loop to keep running. A session that is told "go" or "continue" re-enters it at whatever task the build log shows as current. If the session supports recurring runs, the loop can be driven that way; the build log is what makes each run pick up where the last one stopped.

**Do not stop at a phase boundary.** Passing a gate is not a reason to end the session or to wait for a reply. Record the gate in the build log and begin the next phase's first task in the same turn. John assumes the build is running unless he has been asked for something. Progress reports go in the build log; they are not a reason to pause. Asking John to say "continue" is a failure of this procedure.

When something only John can do is coming up, ask for it early, in passing, and keep working on everything that does not depend on it.

**When to stop looping and ask John.** Stop, write up what you tried in the build log, and ask, if any of these is true:

- The same failure survives five genuinely different attempts to fix it.
- Passing would require changing what an existing test means, or a rule in the rulebook.
- You need something only John can provide (section 6).
- The plan and the rulebook contradict each other on a rule.
- An action would cost real money beyond the limits in section 4.5, or cannot be undone.

### 4.3 Rules for tests

A gate that passes dishonestly is worse than one that fails. So:

- Never delete, skip, or weaken a test to make a gate pass. `test.skip` and `test.only` are lint errors.
- Never lower a coverage or performance threshold. If one is wrong, say why in the build log and ask.
- If an earlier phase's test must change because the behavior legitimately changed, record the old expectation, the new one, and the reason in the build log under "Changed tests".
- A flaky test is a bug. Find the cause. Do not add blanket retries.
- Do not mock the thing being tested. Rules logic is tested for real. Firestore and Auth are tested against the emulators, not stubs.
- End-to-end tests run at 390×844 and 820×1180. Take a screenshot at the end of each main flow and look at it before calling the task done.

### 4.4 The gate at the end of a phase

A phase is complete only when all of these are true:

1. Every task in the phase is ticked.
2. `npm run verify` passes locally from a clean install (`npm ci`).
3. CI passed on the pushed commit, and the deploy succeeded.
4. The deployed site and app respond, and a smoke test of the phase's main flow passes against the deployed app where that is possible without real accounts.
5. Every gate condition listed for the phase is met and noted in the build log with evidence (test names, numbers, links).
6. The build log has a short phase summary: what was built, decisions made, anything left over.

Do not start the next phase until the gate is recorded as passed. Then start it immediately. Only a gate that lists John's sign-off, or a prerequisite from section 6 that has not been met, justifies stopping.

### 4.5 Limits

- **Money.** Evaluation runs against real AI models may spend at most $2 per phase without asking. Nothing else in the build should cost money. Stay inside Firebase's free allowances during development, apart from what Cloud Functions requires.
- **Secrets.** Never commit a key, token or `.env` file. Never print a secret to a log.
- **Scope.** Do not add features that are not in the plan. Write ideas in the build log under "Suggestions".
- **Git.** Work on `main` with small commits, each leaving `verify` green. End commit messages with the attribution lines the session provides.
- **Existing work.** Do not break the rules site. Its build and deploy are part of `verify` and CI from phase 0.

### 4.6 The build log

`docs/build-log.md` is the memory between sessions. Keep it current. It holds: the current phase and task, a tick-list per phase, gate evidence, decisions made without asking (with reasons), changed tests, open questions for John, and suggestions.

When a choice is not covered by this file or the plan, make the simplest reasonable choice, record it under "Decisions", and continue. Ask only if the choice is expensive to reverse.

## 5. Standards for all phases

- **Rules live in one place.** All game arithmetic is in `rules/src`. The app and functions call it. No component computes damage, slots or saves itself.
- **Randomness is injected.** Every rules function that rolls dice takes a random source as a parameter, so tests can fix the outcome and the app can accept a typed-in result in place of a roll.
- **Every roll can be entered by hand.** Anywhere the app rolls, the user can type a real die's result instead.
- **Data is versioned.** Every character stores the rules data version it was made with.
- **Security rules are the real protection.** Hiding a button is not access control. Every permission in the plan has a security-rules test for both the allowed and the refused case.
- **Offline.** Firestore offline persistence is on. A sheet must stay usable with no connection.
- **Accessibility.** Touch targets at least 44 px. Visible focus. Labels on every control. Automated checks (axe) report no serious or critical issues on any screen. Respect reduced-motion settings.
- **Plain words.** Interface text follows the rulebook's voice: short, direct, no jargon a newcomer would not know.
- **Performance.** The app's first load on a mid-range phone profile: Lighthouse performance 90 or better, checked at each gate from phase 2.

## 6. What John must do

These need a person with access to the Firebase project. Everything is keyless and done in Cloud Shell or the Firebase console. Ask for each group when its phase begins, give exact commands, and wait.

| Before phase | John does |
|---|---|
| 0 | Create the Hosting site `waymark-rpg-app`. Create the Firestore database. Turn on Google and Anonymous sign-in. Give the `github-deploy` service account permission to deploy Firestore rules and indexes. |
| 3 | Move the project to the pay-as-you-go plan (Cloud Functions needs it). Turn on the APIs Functions needs. Give `github-deploy` permission to deploy Functions. |
| 6 | Create a payment provider account in test mode and store its keys in Secret Manager. Supply the legal name and contact details for the policy and terms. |
| 7 | Create an OpenRouter key and store it in Secret Manager as `OPENROUTER_API_KEY`. Confirm the model to use. |
| 8 | Approve the AI Warden design document. Play a test session and sign off. |
| 9 | Have the policy and terms reviewed. Choose and connect a domain. |

When a deploy fails for a missing permission, read the error, name the one role it needs, and give John the single command to grant it. Do not ask for broad roles to avoid the question.

---

## 7. The phases

### Phase 0: Foundations

**Goal.** An empty app that signs people in, deployed automatically, with the whole test and deploy machinery working.

**Build**

1. npm workspaces at the root. Move nothing in `site/`; add it as a workspace.
2. Formatting, lint and strict type checking for all packages.
3. `app/`: Vite, React, TypeScript, a router, PWA manifest and service worker, the site's design tokens and logo.
4. Firebase set-up: `firebase.json` with two Hosting targets (site and app), Firestore rules that refuse everything, emulator configuration for Auth, Firestore, Functions and Hosting.
5. Sign-in screen: "Continue with Google" and "Continue as a guest" (anonymous). Sign out. A home screen that greets the user.
6. `npm run verify` as described in 4.1.
7. CI: one workflow that runs `verify`, then deploys site, app and Firestore rules. Deploy jobs depend on `verify`. Replace `deploy-site.yml` with it.
8. A link from the rules site's header and landing page to the app.
9. `docs/build-log.md` brought up to date.

**Tests**

- Unit: the app renders; the router shows the sign-in screen when signed out.
- Rules: every read and write is refused.
- End to end (emulators): a guest signs in and reaches the home screen; a Google user (emulator account) does the same; sign-out returns to the sign-in screen.

**Gate**

- `verify` passes from a clean install and in CI.
- Both Hosting sites deploy from CI and respond.
- The rules site is unchanged apart from the new link, and its search still returns results.

### Phase 1: The rules, as data and as code

**Goal.** Everything in the rulebook that has a number or a procedure exists as data or as a tested function. Nothing else in the build may compute a rule.

**Build**

1. **Data files** in `rules/data`, each with a schema that is checked in tests: attributes, backgrounds and names by genre, the seven example Origins with kits, the general starting kit table, weapons, armor, tools, the ten Affinities and forty Abilities, the Scars table, the misfire table, the reaction table, the ten creatures, Tier limits. A single `version` value.
2. **Library** in `rules/src`, pure functions only:
   - Dice: roll any die, roll with a fixed result, 3d6, 2d20+10.
   - Saves: equal-or-under, a 1 always succeeds, a 20 always fails, advantage and disadvantage.
   - Character creation: each of the six steps, including the swap of two attributes, the Origin bonus capped at 18, and kits.
   - Inventory: 10 slots (or the Origin's number), hand, body and pack, bulky items, small items, Fatigue in slots, all slots full means HP 0, Fatigue with no room forces a drop, Fatigue with every slot already Fatigue costs 1 Strength.
   - Armor: sum of worn pieces, capped at 3.
   - Attacks: damage minus Armor, impaired d4, enhanced d12, two weapons, several attackers, Blast.
   - Harm: HP loss, exactly 0 HP requires a Scar, overflow into Strength, the Strength save, critical damage, attributes at 0.
   - Scars: each of the twelve results applied to a character.
   - Rest: short rest, night's rest, week's rest, deprived, Fatigue from deprivation.
   - Abilities: cost, the danger save, misfires, stretching when safe, alternative costs.
   - Tiers: limits of 2, 4, 6 and unlimited; second Affinity from Tier 3.
   - Corruption: lasting (three failed saves, loss of a Tier or of 1d4 Willpower, being lost) and corrupted places (disadvantage, tainted Fatigue, no HP recovery).
   - Imbuing. Morale. Reactions. Crowds. Running away. Maneuvers. Die of Fate.
3. **One source for the lists.** Change the site build so the rulebook's tables of Origins, Affinities, Abilities, gear and creatures are produced from `rules/data`. Mark the places in `Waymark-Rulebook.md` where generated content goes. The published wording must not change as a result: compare the built pages before and after.
4. A coverage map, `rules/COVERAGE.md`: every rulebook section, the function that implements it, and the tests that prove it.

**Tests**

- At least one test per rule listed above, named after the rulebook section, including the worked examples in the rulebook (Wren's damage example must produce the same numbers).
- Property tests for invariants: Armor never above 3, HP never below 0, slots used never above capacity, attributes never above 18 through creation.
- Schema tests for every data file. Cross-checks: every Ability names a real Affinity; every kit item exists in the gear data; ten Affinities with four Abilities each.

**Gate**

- Line and branch coverage of `rules/src` at 95% or higher.
- `rules/COVERAGE.md` has no rulebook section without an implementing function and a test, or an explicit note that the section is advice and has no rule to implement.
- The rules site builds from the data and its text is unchanged, shown by a before-and-after comparison recorded in the build log.

### Phase 2: Character sheets

**Goal.** One person can make a character and use the sheet in play. This is stage 1 of the plan.

**Build**

1. Firestore: `users/{uid}` and `characters/{id}` as in the plan. Rules: an owner reads and writes their own characters; nobody else can.
2. **Builder.** Six steps, one screen each, with a progress marker and a back button. Every roll offers "roll for me" and "enter my roll". Origin, Affinity and Abilities are chosen from the data, each with its description. Affinity can be left latent. A character can be saved part-way.
3. **Sheet.** Attributes and HP with current and full values. Armor computed. Inventory as ten slots that items can be moved between, with Fatigue shown in slots. Abilities with a use button. Scars, corruption, Tier, coins, description, notes.
4. **Actions**, each calling the rules library: take damage, heal, add or remove Fatigue, use an Ability (asks "are you in danger?"), short rest, night's rest, week's rest, mark deprived, roll or record a Scar, make a save.
5. **Dice.** A roller for any die and for a save against an attribute. A recent-rolls list.
6. **Limit.** A free account may own one character. Enforce it where it cannot be bypassed from the browser.
7. **Offline.** The sheet works with no connection and syncs later.
8. The home screen lists the user's characters.

**Tests**

- Component tests for the builder steps and each sheet action.
- End to end: build a character from scratch by typing in fixed rolls and check the saved sheet; take damage through 0 HP into Strength and see the right prompts; use an Ability in danger, fail the save, and see a misfire; fill every slot and see HP at 0; rest and recover; go offline, change the sheet, come back online, and see the change saved.
- Rules: another user cannot read or write the character; the second character on a free account is refused.
- Accessibility checks on every screen.

**Gate**

- All of the above pass at both screen sizes.
- Lighthouse on the deployed app: performance and accessibility both 90 or higher.
- Screenshots of the builder and sheet at phone size are in the build log, and John has been shown them. Continue without waiting unless he objects.

### Phase 3: Campaigns and joining

**Goal.** People can gather in a campaign, with or without accounts.

**Build**

1. Cloud Functions set-up, tested in the emulator, deployed from CI.
2. Create a campaign. Free accounts may run one. Enforce on the server.
3. Join by code, link or QR code. Joining goes through a function, so codes cannot be guessed by reading the database.
4. Three kinds of character, as the plan defines them: owned, guest, and Warden-run. Warden-run characters are capped at six per campaign and cannot leave the campaign except by hand-over.
5. Hand-over: the Warden produces a one-time code; whoever redeems it becomes the owner, subject to their own limit.
6. A Warden can bring one of their own characters into their campaign.
7. A guest can become an account holder and keep their character and membership.
8. **Summaries.** Members see only a summary of other characters (name, HP, conditions). Keep the summary as a separate document that members can read, kept in step with the full sheet by a function. The full sheet stays readable only by its owner and the Warden.
9. Each member's permission choice: "Warden can change my sheet" or "ask me first". Switchable at any time.
10. Leaving and removing members. Deleting a campaign.

**Tests**

- A security-rules matrix: for each role (owner, other member, Warden, guest, stranger) and each document type, the allowed and refused operations.
- Functions: join with a good code, a bad code, a used hand-over code; the six-character cap; the one-campaign cap.
- End to end with three browser sessions: Warden creates, an account holder and a guest join, the Warden adds a Warden-run character, each sees the right things, the guest upgrades and keeps everything.

**Gate**

- Every cell of the rules matrix has a passing test.
- All phase 0 to 2 tests still pass.

### Phase 4: Live play

**Goal.** The Warden changes a character and the player sees it at once. This completes stage 2 of the plan.

**Build**

1. **Party view.** Every character at a glance. Tap one for actions. Select several for a Blast.
2. **Warden actions** through the rules library: deal damage, heal, give or take an item, add Fatigue, mark deprived, award a Tier.
3. **Direct or ask first.** In direct mode the change applies. In ask-first mode it becomes a request the player accepts or declines, and the Warden sees the answer. The security rules must make a direct write impossible for an ask-first character.
4. **Save prompts.** The Warden asks a player for a save; the player rolls or enters a result; the outcome returns to the Warden.
5. **Shared dice and activity feed.** Rolls and changes appear for the group, with who did what and when.
6. **Undo** of the most recent change to a character.
7. Presence: who is in the session now.

**Tests**

- End to end, multiple sessions: damage dealt by the Warden appears on the player's screen within two seconds; the ask-first flow, accepted and declined; a save prompt round trip; a Blast across three characters; undo.
- Rules: a Warden write to an ask-first character is refused; a request can be answered only by that character's player.
- Two changes to one character at the same moment do not lose either.

**Gate**

- All of the above pass, with the two-second requirement measured and recorded.
- John has been given the deployed link and a short script for trying it with a second device. Continue without waiting unless he reports a problem.

### Phase 5: Warden tools and the campaign record

**Goal.** The Warden can prepare, run and remember a campaign. This is stage 3 of the plan.

**Build**

1. **Campaign brief.** The setting and backdrop for the whole campaign, and a brief for each session or adventure: the mission, the stakes, what is expected.
2. **Timeline of story beats.** Ordered and timestamped. One tap and one sentence to add. Beats can be milestones and can link to cards. Quick notes are saved as beats.
3. **Cards** for people, places, creatures, factions, items and open threads, each with a status: planned, met, changed, gone. Planned cards are hidden from players until revealed.
4. **Creatures.** The rulebook's ten, and the Warden's own from the rulebook's form.
5. **Fight tracker.** Sides and turn order, creature HP, morale reminders, a reaction roll, each combatant's distance band.
6. **Custom content.** Origins, Affinities, Abilities and gear from the rulebook's forms, checked against the rulebook's limits with warnings, available in that campaign's builder.
7. **Worlds.** A set of custom content saved as a pack and reused.
8. **Wide layout** for the Warden at laptop widths.

**Tests**

- End to end: write a brief, add beats during a simulated session, reveal a planned card and see it appear for a player, run a fight to a morale check, create a custom Origin and build a character with it.
- Rules: players cannot read planned cards or the Warden's private notes.
- The timeline keeps its order when two beats are added from two devices.

**Gate**

- All of the above pass at phone, tablet and laptop widths.
- All earlier phases' tests still pass.

### Phase 6: Plans, payments and policies

**Goal.** Free and paid accounts work, with limits enforced on the server.

**Build**

1. An entitlements record per user: free, paid, AI Warden. Every limit reads from it.
2. Limits from the plan's table, enforced in functions and security rules.
3. Payments through the provider, in test mode: subscribe monthly or yearly at the plan's prices, cancel, and handle failed payments. The provider's webhooks update entitlements.
4. What happens on downgrade: nothing is deleted. Characters and campaigns over the limit become read-only until the user chooses which to keep active.
5. Account page: plan, usage, export my data, delete my account.
6. Draft privacy policy and terms as pages in the rules site, marked as drafts pending review.

**Tests**

- Entitlement changes from simulated webhooks, including duplicates and out-of-order delivery.
- Each limit refused on the server when exceeded.
- Downgrade keeps data and makes the excess read-only.
- Account deletion removes the user's data and leaves campaigns they ran in a defined state.

**Gate**

- All of the above pass. No live payment keys are in use.
- **John's sign-off** on prices, the downgrade behavior, and the draft policy and terms.

### Phase 7: AI help

**Goal.** Button-driven AI assistance that produces valid, reviewable content. This is stage 4 of the plan.

**Build**

1. One function that calls OpenRouter. The key comes from Secret Manager. The model name is configuration.
2. **Actions**, each a button with a fixed instruction template kept in the repository: generate a creature, person, place, item, Origin or Ability; recap a session; propose filing (new and changed cards, threads opened and closed) from the timeline and feed; answer a rules question from the rulebook with a link to the section.
3. **Structured results.** Every result must match the same schema the app uses for that kind of content. Invalid results are retried once and then reported as failed, never saved.
4. **Nothing is saved without review.** Results arrive as proposals the user edits and accepts.
5. **Metering.** Requests counted per user per month against the plan's allowance. A clear message when it runs out.
6. **Safety.** Text written by users is passed to the model as data, never as instructions. The function can only return proposals; it cannot write to the database on the model's behalf.

**Tests**

- Unit tests with the model replaced by fixtures: valid, invalid, and hostile responses.
- Metering: the allowance is enforced and resets with the month.
- An evaluation set of at least 30 fixed requests run against the real model: 95% or more return valid structured content, and generated creatures and Abilities fall within the rulebook's stated ranges. Record cost per request.

**Gate**

- All of the above pass, with the evaluation results and measured cost in the build log.
- All earlier phases' tests still pass with AI switched off, proving the app does not depend on it.

### Phase 8: AI Warden

**Goal.** A campaign can be run by an AI that narrates aloud, while the rules library decides every number. This is stage 5 of the plan.

**Before building:** write `docs/ai-warden-design.md` covering the turn loop, what the model is given each turn, the tools it may call, how memory is kept within limits, how danger is telegraphed, failure handling, and expected cost per session. **Stop for John's approval.**

**Build**

1. **Turn loop.** Each turn the model receives the campaign brief, the relevant cards, recent beats and the party's summaries, and returns narration plus requests to use tools.
2. **Tools are the rules library.** Deal damage, call for a save, give an item, reveal a card, add a beat, roll on a table. The model cannot change state any other way, and cannot state a number that the library did not produce.
3. **The Warden's principles from the rulebook** are part of its instructions: telegraph danger, give information freely, offer clear choices, let sensible plans work without a roll.
4. **Player input.** Tap suggested actions or type. Dictation works through the device keyboard.
5. **Spoken narration.** Read narration aloud by default using the device's built-in speech, with the text on screen. Controls to pause, replay, choose a voice, change speed and turn speech off. Keep the design open to a hosted voice later.
6. **Memory.** The AI adds story beats and proposes card updates as it goes, so the campaign record stays current.
7. Available only to the AI Warden tier.

**Tests**

- Architecture test: there is no code path by which model output writes to the database except through the tools.
- Scripted sessions with simulated players: every state change in the log traces to a tool call; no narration states a number that differs from the log.
- An evaluation rubric scored on at least 20 scripted scenes: danger was signalled before harm, questions were answered, the outcome followed the rules.
- Speech: narration is queued in order, can be paused and replayed, and the app is fully usable with speech off.
- Measured cost of a simulated three-hour session.

**Gate**

- All of the above pass, with the cost report and a proposed price for the tier.
- **John plays a session and signs off.**

### Phase 9: Launch readiness

**Build and check**

1. Error reporting and basic usage monitoring. Budget alerts on the project.
2. A security review of rules and functions, using the project's review tooling, with findings fixed.
3. A full read-through of the app against the rulebook: every rule shown or applied in the app matches the current text.
4. Backups of Firestore on a schedule, and a tested restore.
5. Empty, loading and error states on every screen. A first-run walkthrough for new players.
6. Policy and terms updated after review, and linked from sign-in.
7. Custom domain connected for the site and the app.
8. Help text and a short guide for Wardens.

**Gate**

- `verify` passes. Lighthouse 90 or higher for performance and accessibility on the main screens.
- No open security findings rated high.
- **John's sign-off** to open sign-up to the public.

---

## 8. If you get stuck

Say so plainly in the build log and to John: what you were doing, what failed, what you tried, and what you need. A clear stop is always better than a gate passed by cutting a corner.
