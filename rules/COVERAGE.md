# Rules coverage

Every section of `Waymark-Rulebook.md`, the code that implements it, and the tests that prove it. A test (`tests/coverage-map.test.ts`) fails if a rulebook section is missing from this table.

Tests are in `rules/tests/`, named `<file>.test.ts`. Test groups are named after the rulebook section they cover.

| Rulebook section | Implemented by | Proved by |
|---|---|---|
| What is this game? | Advice or explanation. No rule to implement. | — |
| What you need | Dice notation: `roll`, `rollSum` (dice.ts) | dice-saves: "Introduction: reading the dice" |
| The rules are guidelines | Advice or explanation. No rule to implement. | — |
| Attributes | `AttributeKey`, `Score` (types.ts); range checked in `createCharacter` | creation: "the numbers must be possible" |
| Saves | `checkSave`, `pickRoll`, `rollSave` (saves.ts) | dice-saves: "Introduction: saves"; properties |
| What kind of game this is | Advice or explanation. No rule to implement. | — |
| Advice for the Warden | `dieOfFate` (dice.ts). The rest is advice. | dice-saves: "the Die of Fate" |
| Advice for players | Advice or explanation. No rule to implement. | — |
| Step 1: Attributes | `rollAttributes`, `swapAttributes` (creation.ts) | creation: "step 1" |
| Step 2: Hit Protection | `rollHp` (creation.ts) | creation: "steps 2, 3 and 6" |
| Step 3: Background and name | `rollAge` (creation.ts); lists in data/backgrounds.json, data/names.json | creation: "steps 2, 3 and 6"; data |
| Step 4: Origin | `applyOriginBonus`, `kitItems`, `createCharacter` (creation.ts); data/origins.json | creation: "step 4"; data; properties |
| Step 5: Affinity and Abilities | `createCharacter` (creation.ts); data/affinities.json | creation: "step 5" |
| Step 6: Starting gear | `rollCoins`, `rollStartingKit`, `basicSupplies`, `arrangeItems` (creation.ts); data/starting-kit.json | creation: "step 6" |
| Carrying things | `slotsUsed`, `freeSlots`, `isFull`, `settle`, `addItem`, `removeItem`, `addFatigue` (inventory.ts) | inventory: "slots", "Fatigue"; properties |
| Gear | `armorValue` (inventory.ts); `spendCharge`, `rechargeItem` (gear.ts); data/weapons.json, armor.json, tools.json | inventory: "Gear: armor"; costs-and-charges: "Special items"; data |
| Time and distance | `Band`, `bandAt` (encounters.ts) | gear-encounters: "Playing on a tabletop" |
| Fighting | `actsBeforeEnemies`, `escapes`, `maneuverWorks` (encounters.ts); `attackDie`, `rollDamage`, `rollBlast`, `applyDamage` (combat.ts) | combat: "attacking", "weaker or stronger", "other attack rules"; gear-encounters: "order, escape and maneuvers" |
| Getting hurt | `applyDamage`, `resolveStrengthSave`, `stabilize`, `loseAttribute`, `restoreAttribute` (combat.ts); `status` (inventory.ts); `applyScar`, `recoverFromScar`, `applyDoomedReward` (scars.ts); data/scars.json | combat: "Getting hurt", "losing attribute points", "Doomed"; scars; properties |
| Rest and recovery | `shortRest`, `nightRest`, `weekRest`, `repair`, `setDeprived`, `passDayDeprived`, `canRecoverHp` (rest.ts) | rest: all three groups |
| Playing on a tabletop | `bandsFor`, `bandAt`, `feetToInches`, `moveCost` (encounters.ts) | gear-encounters: "Playing on a tabletop" |
| Meeting people and creatures | `reactionFor`, `rollReaction`, `moraleCheckDue`, `holdsNerve` (encounters.ts); `modifierAgainstCrowd`, `CROWD_ATTACK` (combat.ts). Companions are built with `rollAttributes` and `rollHp`. | gear-encounters: "Meeting people and creatures"; combat: "Fighting a crowd" |
| What an Ability is | Abilities are held in `Character.abilities`, never in the inventory. Explanation otherwise. | abilities: "Using an Ability" |
| Using an Ability | `useAbility`, `MISFIRES` (abilities.ts); data/misfires.json | abilities: "Using an Ability", "Misfires", "when slots are full" |
| Affinities | `canLearnAbility`, `learnAbility` (abilities.ts) | abilities: "Tiers" |
| The Affinities and their Abilities | data/affinities.json, `abilityIndex` (data.ts). Each Ability's own effect is narrated; numeric parts use `applyDamage`, `restoreAttribute` and saves. | data; rulebook |
| Making your own Abilities and Affinities | Guidance. "A different cost": `AbilityCost` in `useAbility` (abilities.ts) | costs-and-charges: the three "A different cost" groups |
| Enemies with Abilities | Advice: enemies gain no Fatigue and make no save, so no function is involved. | — |
| Ways characters grow | Scars (see "Getting hurt"). The rest is advice. | scars |
| Tiers | `TIER_LIMITS`, `abilityLimit`, `awardTier`, `chooseSecondaryAffinity` (abilities.ts); data/tiers.json | abilities: "Tiers"; data |
| Corruption | `catchCorruption`, `corruptionDailySave` (abilities.ts); corrupted places in `useAbility` and `shortRest`; `restAtHaven` (rest.ts) | abilities: "Lasting corruption", "Corrupted places"; rest: "the limits" |
| Imbued gear | `imbueItem`, `saveScore`, `armorAgainstOpposingAbilities` (gear.ts) | gear-encounters: "Imbued gear" |
| Creatures and other characters | data/creatures.json, checked by schema. Creatures use the same functions as characters. | data; rulebook |
| Building your world | Advice or explanation. No rule to implement. | — |
| The rules on one page | A summary of rules covered above. | — |
| Character sheet | `Character` (types.ts) | creation |
| Words used in this book | Glossary. No rule to implement. | — |
| Credits | No rule to implement. | — |

## Decisions where the rulebook leaves room

- **Raised scores from Scars.** When a Scar raises a full attribute, points already lost stay lost: the current value rises by the same amount as the full value.
- **Scores from Scars cap at 18**, matching "18 is the highest a score can go".
- **Overloaded characters.** HP is set to 0 when every slot fills, and stays there through any rest until a slot is freed. After that a short rest restores it.
- **Second Affinity.** A character may learn from a Secondary Affinity from Tier 3, within the Tier's limit.
- **Misfire "Blackout".** The Ability takes effect; every other misfire replaces the effect.
- **"Drained" under other costs.** With charges, a second charge is spent if one remains. With recovery time or supplies, nothing extra is spent.
- **Fatigue with no room during a failed imbuing** follows the ordinary Fatigue rule (drop an item, or lose Strength if every slot is Fatigue).
