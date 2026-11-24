# Waymark companion app: plan

**Status:** draft 3, for review. Nothing here is built yet.

## What it is

A web app that players and Wardens use at the table. Players keep their character sheets on it. Wardens run campaigns on it, and changes they make to a character show up on that player's screen straight away.

## Decisions already made

| Topic | Decision |
|---|---|
| Platform | A web app only. Firebase Hosting, Firestore, Cloud Functions. Same Firebase project as the rules site, on its own Hosting site. |
| Screens | Designed for phones and tablets first. A wider layout for the Warden's tools comes later. |
| Joining | Two ways: sign in with an account, or join a campaign with a code and no account. |
| Warden's authority | Each player chooses, per campaign: let the Warden change their sheet directly, or have every change arrive as a request to accept. |
| Dice | The app can roll. Players can also type in a result from real dice. Both always available. |
| AI | Calls go through a Cloud Function to OpenRouter. The key never reaches the browser. |
| Address | Its own address, separate from the rules site (for example `app.` on the project's domain once there is one). The rules site links straight into it. |
| Framework | React, TypeScript and Vite. This builds to plain static files, so Firebase Hosting is enough and App Hosting is not needed. |
| Other players' sheets | Players see a summary of each other's characters (name, HP, conditions), not the full sheet. The Warden sees everything. |
| Rules lists | The example Origins, Affinities, Abilities, gear and creatures are data files: the default pool everyone can pick from. Wardens, players and AI add custom content on top. The rulebook's tables are produced from the same files. |
| Free and paid | See "Free and paid". |
| Maps | Not part of this app. See "Later: maps". |

## Stages

Each stage leaves something usable.

### Stage 1: Character sheets

For one player, with or without a campaign.

- **Guided character builder.** The six steps from the rulebook. At each die roll the player can tap to roll or type in a result. Origins, Affinities, Abilities and starting kits are picked from lists.
- **The sheet in play.**
  - Attributes and HP, each with a current and a full value.
  - Armor worked out from what is equipped, capped at 3.
  - Ten inventory slots (twelve for Origins that grant them). Bulky items take two. Fatigue takes slots. When every slot is full, HP shows 0.
  - Abilities with a "use" button: adds Fatigue, asks whether the character is in danger, and if so runs the Willpower save and the misfire table.
  - Scars, corruption, Tier, coins, notes.
- **Rules built in.** "Take damage" asks for a number, subtracts Armor, lowers HP, moves any remainder to Strength, then prompts for a Scar or a Strength save as the rules require. Short rest, night's rest and week's rest are one tap each.
- **Dice.** A roller for any die, and for saves against an attribute.
- **Works with a poor connection.** The sheet stays usable offline and catches up when the connection returns.

### Stage 2: Campaigns

For a group at the table.

- **Create and join.** The Warden creates a campaign and gets a short code, a link and a QR code. Players join with any of them.
- **Three kinds of character in a campaign:**
  - an account holder's character, which they can take to other campaigns;
  - a guest's character, made by someone who joined with a code and no account. A guest can create an account later and keep it;
  - a Warden-run character, for a player with no device (a young child, say). The Warden controls it, and it can be handed over later with a code.
- **Permission choice.** On joining, each player picks "Warden can change my sheet" or "Ask me first". They can switch at any time. Warden-run characters are always direct.
- **Party view for the Warden.** Every character at a glance: HP, Strength, free slots, Fatigue, conditions. Tap one to deal damage, heal, give or take an item, add Fatigue, or mark deprived. Select several to apply a Blast.
- **Requests.** In "ask me first" mode the Warden's change appears on the player's screen to accept or decline. The Warden sees the answer.
- **Calling for a save.** The Warden sends "make a Dexterity save" to a player. The player rolls in the app or enters a result, and the outcome comes back.
- **Activity feed.** A running record of rolls and changes, visible to the group, with who did what. The last change can be undone.

### Stage 3: Warden tools

- **Creatures.** The rulebook's creatures, plus the Warden's own, using the rulebook's template.
- **Fight tracker.** Who has acted, creature HP, reminders for morale checks, a reaction roll, and each combatant's distance band (Close, Near, Far).
- **Campaign record.** The app keeps track of the campaign itself, in three layers:
  - *Automatic.* The activity feed already records every roll, wound, item and fight, and who was present. Nothing extra to do.
  - *Cards.* People, places, creatures, factions, items, and open threads (unfinished business, promises, mysteries). Each card has a status: planned, met, changed, gone. The Warden prepares "planned" cards before a session and reveals them during it. Past, present and future are the same cards at different statuses, on a session-by-session timeline.
  - *Quick notes.* A one-line note box, always within reach during play: "Met Orla the ferryman. She owes the party a favor." The phone keyboard's own microphone button makes this hands-free dictation at no cost.
- **Custom content.** Origins, Affinities, Abilities and gear made with the rulebook's fill-in forms, available to that campaign's players in the builder.
- **Worlds.** A set of custom content saved as a pack and reused across campaigns. Sylvanholt would be the first.
- **Wider layout** for laptops.

### Stage 4: AI help

- **Generate** a creature, a person, a place or an item from a short description. The result lands in the normal form for the Warden to edit before saving.
- **Rules questions**, answered from the rulebook text with a link to the section.
- **Session recap** written from the activity feed and the quick notes.
- **Filing.** After a session, the AI reads the feed and the notes and proposes updates: new and changed cards, new threads, threads resolved. The Warden reviews each one before it is saved.
- **Most AI actions are buttons**, such as "generate a creature" or "recap this session", with tightly written instructions behind them. Free typing is the exception. This keeps results consistent and requests small.
- **Session recording (later, optional).** Record the table, turn it into a transcript, and feed that to the same filing step. It is not the foundation, for three reasons: everyone present must agree to be recorded, a noisy table transcribes poorly, and it costs far more than text. The cards and notes work without it.
- Usage limits per person. This is the natural place for a paid tier, since each call costs money.

### Stage 5: AI Warden

A campaign with no human Warden. The main design rule, drawn from why AI Wardens tend to go wrong: **the AI narrates and decides what characters in the world do, and the app's own rules code does all the arithmetic.** The AI asks the app to deal damage or call for a save. It never invents numbers. It works from the campaign's stored state, not from its memory of the chat. It relies on the campaign record from stage 3 as its memory.

The first version is text and taps: players choose or type what they do, and can dictate with the phone keyboard's microphone. Spoken, always-listening play is a later step, after its cost and reliability have been measured. This stage needs its own plan once stages 1 to 3 exist.

## How it is built

- **App:** a single-page web app, installable to a phone's home screen, built with React, TypeScript and Vite. It compiles to static files served by Firebase Hosting.
- **Rules as code:** one small library that knows the rules (damage, saves, slots, Fatigue, rests, Ability use). The app uses it now and the AI Warden uses it later. It gets thorough automated tests.
- **Rules as data:** Origins, Affinities, Abilities, gear and creatures stored as structured files in this repository, with a version number, so that the app and the rulebook cannot drift apart.
- **Sign-in:** Google sign-in for accounts. Guests get an anonymous sign-in behind the scenes, which can be upgraded to an account without losing anything.
- **Repository layout:** `site/` (exists), `app/`, `functions/`, `rules/` (the library and data).

### What is stored

| Collection | Holds |
|---|---|
| `users` | Display name, settings, plan |
| `characters` | One sheet each: owner, the campaign it is in (if any), who runs it, all sheet fields, rules version |
| `campaigns` | Name, Warden, join code, settings (active world, dice preferences, table scale) |
| `campaigns/…/members` | Each member's role, display name, characters, and their permission choice |
| `campaigns/…/requests` | Pending changes awaiting a player, and save prompts |
| `campaigns/…/log` | The activity feed |
| `campaigns/…/creatures`, `encounters`, `notes`, `content` | Warden tools (stage 3) |

### Who can do what

| Person | Can |
|---|---|
| A character's owner | Read and change their own character |
| A campaign member | See the campaign, its feed, and a summary of the other characters (name, HP, conditions) |
| The Warden | Change a character in their campaign only if its player chose "direct", or the Warden runs it. Otherwise the Warden can only create a request. |
| Anyone else | Nothing |

These are enforced by the database's security rules, not only by the screens. Joining by code and all AI calls go through Cloud Functions.

This is a cooperative game, so the plan does not try to stop a player from editing their own sheet dishonestly. The activity feed makes changes visible, and that is enough.

## Build order

| Step | Delivers |
|---|---|
| 0 | App skeleton, sign-in, automatic deploy to a second Hosting site |
| 1 | Rules data and rules library, with tests |
| 2 | Character builder and the sheet (stage 1 complete) |
| 3 | Campaigns, join codes, guests, Warden-run characters |
| 4 | Live Warden actions, permission choice, requests, activity feed |
| 5 | Shared dice and save prompts (stage 2 complete) |
| 6 | Warden tools (stage 3) |
| 7 | AI help (stage 4) |

## Free and paid

Three tiers. The paid plan is **$4.99 a month**, with a small discount for paying yearly.

| | Free | Paid ($4.99 a month) | AI Warden (price not set) |
|---|---|---|---|
| Your own characters | 1 | Unlimited | Unlimited |
| Campaigns you run as Warden | 1 | Unlimited | Unlimited |
| Campaigns you join as a player | Any | Any | Any |
| Warden-run characters | Do not count against your limit. Up to 6 in a campaign. | Same, with a higher cap | Same |
| AI help | About 30 requests a month | About 1,000 requests a month | Same as Paid |
| AI-run campaigns | No | No | Yes |
| Everything else in stages 1 to 3 | Included | Included | Included |

The AI allowances are starting guesses. A typical button request (instructions, the relevant rules, and a short result) is a few thousand tokens. At the model prices under consideration that is well under a tenth of a cent, so even the paid allowance costs far less than the plan brings in. The real numbers should be set after measuring actual use.

An AI-run campaign is priced separately because it sends a request on every turn of a session, and each one carries the campaign's memory. Its price should be set once a real session's cost has been measured.

**Two buckets of characters.** "Your characters" are the ones you play, and they count toward your limit. "Warden-run characters" belong to a campaign, exist for players without a device or account, and never count toward the Warden's own limit.

- A Warden-run character can only be used inside its campaign. It leaves that campaign only by being handed to a player, at which point it becomes that player's character and counts toward their limit. This stops the bucket being used to dodge the cap.
- A Warden can also bring one of their own characters into a campaign they run, and play it alongside the others.
- Guests have no account, so their one character lives in the campaign they joined.

## Children

The app is not aimed at children, and accounts are for people aged 13 and over. Younger players take part as guests, who give no personal details, or through a Warden-run character. This needs a short privacy policy and a review by someone qualified before any paid plan launches, because the responsibility for a child's data rests with the app's operator, not with the sign-in provider.

## Later: maps

A map tool is a separate product and is not planned here. One small provision keeps the door open: the fight tracker records each combatant's distance band, and campaign state is stored in a structured way. A future map app, or an integration with an existing one, could read and move those positions, so that "the scout moves closer to the raptor" shows on a shared screen.

## Open questions

1. **Domain.** Not chosen yet. This blocks nothing: the app runs at its Firebase address until then.
2. **Payment provider** and the exact yearly price. Needed before stage 4.
3. **AI Warden price.** To be set from measured cost.
4. **Privacy policy and terms.** To be drafted before sign-up opens to the public, then reviewed by someone qualified.
