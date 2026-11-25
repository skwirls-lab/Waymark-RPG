# The AI Warden: design

*Draft for John's approval. Nothing in phase 8 is built until this is approved.*

## What it is

A campaign with no human Warden. The players say what their characters do; the AI describes what happens, plays everyone else in the world, and reads its narration aloud. It is available on the AI Warden plan only.

**The one rule everything else follows from:** the AI decides what happens in the story, and the app's rules library decides every number. The AI can ask the app to deal damage or call for a save. It cannot change a sheet itself, and it cannot state a number the app did not produce.

This is the same rules library and the same Warden actions a human Warden already uses from the party list. The AI Warden is a second user of them, not a second set of rules.

## The turn loop

One turn is one thing the players do and the AI's answer to it.

1. **The players act.** A player taps one of the suggested actions or types their own (the phone keyboard's microphone works for dictation). In a group, each player's input is added to the turn; the AI answers when the acting player sends, or when everyone has.
2. **The server builds the turn.** A Cloud Function gathers what the model needs (next section). The browser does not choose what the model sees.
3. **The model answers** with narration and, if something mechanical must happen, requests to use tools.
4. **The server runs the tools** through the rules library, in order. If a tool needs a die the players should roll (a save, a Scar), the turn pauses and the player is prompted exactly as with a human Warden: tap to roll, or type what the real dice showed.
5. **The model is told the results** and writes the narration of the outcome. Steps 3 to 5 repeat at most three times in one turn, then the turn ends whatever the model wants.
6. **The turn is recorded:** narration to the players, a line in the activity feed for each tool that ran, and a story beat if the model asked for one.
7. **Suggested actions** for the next turn are shown as buttons: two to four, always including a way to ask a question and a way to do something else entirely.

A turn that calls no tools is one model request. A turn with tools is two, occasionally three.

## What the model is given each turn

Always, in this order (the fixed parts first, so they can be cached by the model provider):

| Part | Size (rough) | From |
|---|---|---|
| Instructions: how to be a Warden, the output format, the tools | 1,200 tokens | The repository. Never changes with user input. |
| The rules the AI needs to judge by (a condensed reference: saves, damage, distance, morale, Fatigue, corruption) | 900 | Generated from the rulebook's Reference part |
| Campaign brief: the setting, and the current session's mission and stakes | 400 | `shared/brief` |
| The party: each character's name, Origin, HP, attributes, Armor, conditions, Abilities by name, and notable gear | 80 per character | The sheets, read on the server |
| The scene so far: a running summary the AI maintains | 300 | Memory (below) |
| Cards that matter now: those the scene summary names, plus any the last few turns mentioned | 400 | `cards` and `cardNotes` (the AI is the Warden, so it sees private notes) |
| The last 8 exchanges, word for word | 1,000 | The session log |
| This turn's player input | 100 | The players |

About 4,500 tokens in, 250 to 400 out. Everything typed by a player is passed as data inside a marked block, exactly as in phase 7, with the same instruction that it is never a command to the model.

## The tools

The model changes the game only by calling these. Each is a thin wrapper over something that already exists and is already tested.

| Tool | What it does | Built on |
|---|---|---|
| `call_for_save(character, attribute, why)` | Prompts the player to roll; returns pass or fail | Phase 4 save prompts |
| `deal_damage(character, die, why)` | Rolls (or asks the player to), applies Armor, HP and Strength; returns what happened, including a Scar or Strength save if one follows | `applyWardenAction` |
| `restore_hp`, `add_fatigue`, `set_deprived`, `give_item`, `take_item` | As the Warden's party actions | `applyWardenAction` |
| `enemy_attack(enemy, character)` | Rolls the enemy's damage die and applies it | Fight tracker + `applyWardenAction` |
| `damage_enemy(enemy, amount)` | Applies a player's rolled damage to an enemy; reports a Strength save or morale check if due | Phase 5 fight logic |
| `start_fight(enemies)`, `next_turn()`, `end_fight()` | Runs the fight tracker | Phase 5 fight logic |
| `check_morale()`, `roll_reaction()` | The rulebook's two Warden rolls | Rules library |
| `add_beat(text, milestone)` | Adds to the timeline | Phase 5 |
| `reveal_card(card)`, `propose_card(kind, name, text)` | Reveals a planned card; proposes a new one (added as planned) | Phase 5 |
| `update_scene(summary)` | Replaces the running scene summary | Memory |

Rules for tools:

- **Dice.** The model never supplies a roll. `deal_damage` takes a die size, not a result. The server rolls enemies' dice. Players roll their own, by tap or by typing in real dice, as they do now.
- **"Ask first" still holds.** A player who chose "ask me first" gets every sheet change as a request to accept, from the AI as from a human.
- **Numbers in narration.** After the tools run, the server checks the narration: any number in it must match a number in that turn's tool results (or be an ordinary count such as "three doors"). Narration that states a different HP, damage or roll is sent back once for rewriting, and if still wrong, replaced with a plain statement of the results.
- **Limits per turn.** At most 6 tool calls, at most one `deal_damage` per character, and no tool may target a character not in the campaign.

There is no tool that writes arbitrary data, and the function that runs the AI Warden has no other path to the database. A test enforces that (see Tests).

## Memory

The model's context is rebuilt every turn from the campaign record, so nothing depends on a long conversation being kept alive.

- **Within a scene:** the last 8 exchanges word for word, plus the running scene summary, which the model rewrites with `update_scene` whenever the situation changes (where the party is, who is present, what is at stake, what has just been promised or threatened).
- **Across scenes and sessions:** the timeline and the cards. The AI adds a beat when something that matters happens, and proposes cards for new people and places. At the end of a session it writes a recap (phase 7's recap action) as a milestone beat.
- **At the start of a session:** the brief, the last session's recap, the open-thread cards, and the most recent 15 beats.

The human in charge of the campaign (its owner) can read and edit everything the AI has recorded, and can correct it between sessions.

## How danger is telegraphed

The rulebook's principles for the Warden are part of the fixed instructions: give information freely, signal danger before it strikes, offer clear choices, and let a sensible plan work without a roll. Two of them are also enforced in code, because instructions alone are not reliable:

1. **No harm without a warning.** A character can take damage outside a fight only if, earlier in the scene, the narration described the danger and the player then chose to act. In practice: `deal_damage` outside a fight is refused unless a `call_for_save` or a described danger (recorded in the scene summary under "dangers in play") came before it in this or an earlier turn. A refused call tells the model to describe the danger and offer a choice instead.
2. **A save comes with its stakes.** `call_for_save` requires a `why` that is shown to the player before they roll: what they are trying to avoid, and what happens if they fail.

Deadly attacks (d10 or more, or any Blast) additionally require that the enemy's card or creature notes include a tell, and that the tell has been narrated.

## When things go wrong

| Problem | What happens |
|---|---|
| The model's reply is not in the expected format | One retry with the error. Then a plain fallback: "The Warden is thinking. Try that again." Nothing changes. |
| A tool call is invalid (unknown character, impossible action) | The tool returns an error to the model, which may narrate around it. The rules library's refusal is final. |
| The model service is down or slow (over 30 seconds) | The turn is cancelled with a message. The players' input is kept so they can resend it. |
| The narration states a wrong number | Rewritten once, then replaced by the plain results (above). |
| The model tries to act for a player's character, end the session, or reveal its instructions | The instructions forbid it. A check refuses narration that contains the instructions' own text. Players always choose for their own characters. |
| A player types something abusive or tries to take over the model | Passed as data, as in phase 7. A per-campaign switch lets the owner pause the AI at any time. |
| The session's request allowance runs out | A clear message before the last ten turns, and a clean stop: the AI writes a recap and ends the scene. |

Every turn is logged with its input, tool calls and results, so any outcome can be traced to the rules that produced it.

## Spoken narration

- Narration is read aloud by default using the device's built-in speech (the browser's speech synthesis), with the text on screen at the same time.
- Sentences are queued in order. Controls: pause, resume, replay the last narration, choose a voice, change speed, and turn speech off. The choice is remembered on the device.
- Tool results ("Wren takes 3 damage. HP 1 of 4.") are shown, and spoken only if the player turns that on, so numbers do not interrupt the story.
- The app is fully usable with speech off or unavailable.
- The speaking code sits behind one small interface (`speak(text)`, `pause()`, `stop()`), so a hosted voice can replace the device's voice later without touching the rest.

## Expected cost

These are estimates to be replaced by measurement in phase 8. Prices are per million tokens and vary by model; phase 7's evaluation will give real prices for the cheap end.

Assumptions for a three-hour session: one turn every 75 seconds on average (about 145 turns), 1.6 model requests per turn (about 230 requests), 4,500 tokens in and 350 out per request. Total: about 1.04 million tokens in, 80,000 out.

| Model class | In / out per million | Session cost | With the fixed parts cached (about 45% of input at a tenth of the price) |
|---|---|---|---|
| Small and cheap | $0.10 / $0.40 | $0.14 | $0.10 |
| Mid-range | $0.50 / $2.00 | $0.68 | $0.47 |
| Strong | $3.00 / $15.00 | $4.32 | $3.06 |

Narration quality and reliable tool use matter far more here than for the phase 7 buttons, so the likely choice is mid-range, with the small model kept for recaps and filing. At mid-range, four three-hour sessions a month cost about $2 to $3.

**Proposed starting point for the price, to be confirmed by measurement:** $12.99 a month, including everything in the paid plan and up to 20 hours of AI-run play a month, with a clear meter. Hours, not requests, because that is how players think about it.

## Tests (from the build instructions)

- **Architecture:** a test that fails if the AI Warden function imports the database writer anywhere except through the tool runner, and a test that every write in a scripted session was made by a tool.
- **Scripted sessions** with simulated players and a stand-in model: every state change in the log traces to a tool call; no narration states a number that differs from the log.
- **A rubric scored on at least 20 scripted scenes** against the real model: was danger signalled before harm, were questions answered, did the outcome follow the rules.
- **Speech:** narration is queued in order, can be paused and replayed, and every screen works with speech off.
- **Cost:** the measured cost of a simulated three-hour session, and from it the price.

## Decisions I need from you

1. **Is the turn structure right for your table?** In particular: in a group, should the AI answer each player in turn, or wait and answer everyone's actions together? I have assumed it answers when the acting player sends, and handles fights side by side as the rulebook does.
2. **May the AI see the owner's private card notes?** I have assumed yes, since it is acting as the Warden.
3. **Who owns an AI-run campaign?** I have assumed the person who starts it is its owner: they can read everything the AI records, pause it, and edit the record, and they can also play a character in it.
4. **The "no harm without a warning" rule in code.** It will occasionally stop the AI doing something a human Warden might get away with. I think that is the right trade for a game played with children. Agree?
5. **Price and meter:** $12.99 a month with 20 hours, to be confirmed against measured cost. Or would you rather set it after seeing the numbers?
