# The app against the rulebook: read-through

*2026-11-25. An independent read of every rule the app shows or applies, against `Waymark-Rulebook.md`. Phase 9, item 3. To be repeated before launch.*

Checked and matching: saves (1 always passes, 20 always fails), advantage and disadvantage, impaired and enhanced attacks, the Armor cap, when a Scar happens, critical damage, Fatigue overflowing into Strength, Tier limits, the second Affinity at Tier 3, three corruption failures, morale triggers, the reaction table, distance, and the days a character can go deprived.

## Fixed

| What was wrong | Rulebook | Fix |
|---|---|---|
| A Doomed character who passed their Strength save was not offered the 3d6 roll for HP. | "If you pass it, roll 3d6; if it beats your max HP, take it." | The Strength save dialog now asks for the roll and applies it. |
| A shield or helmet added during play replaced the suit's Armor instead of adding to it. | "You can wear one suit of armor and add a shield, a helmet, or both. Add the numbers together." | Adding armor now offers "A shield or helmet (adds to other armor)", on the sheet and in the Warden's give-item dialog. |
| The Warden could heal a deprived character. | "A deprived character cannot get back HP or attribute points until the need is met." | Refused, with that sentence as the reason. |
| The workshop's advice on Abilities missed dice written as "1d10" or "2d8". | An Ability that harms one target does d6 or d8. | It now reads dice however they are written. |
| "3 HP is fragile." | "Give 3 HP to something ordinary." | Reworded, in the workshop and in the AI's instructions. |
| "Give a new Affinity at least two" Abilities. | "Then write about four Abilities for it." | The hint now gives both: about four, and at least two to start a character. |

| No way to learn an Ability, choose a second Affinity, or rest at a haven. | Parts Four and Five. | The sheet now offers "Learn an Ability" when the Tier has room, "Choose a second Affinity" from Tier 3, and "A night at a haven", which clears tainted Fatigue and cures corruption. Learning offers the rulebook's Abilities; a world's own are still added when the character is made. |

| Any number of items could be "in hand" or "worn". | "2 hand slots… 2 body slots… 6 pack slots." | Moving an item is now a rule in the library: two slots' worth in hand, two on the body, and a bulky item fills both hands. The sheet says "Your hands are full" rather than allowing it. Existing sheets are left as they are until something is next moved. |

| Corrupted places could not be played from the sheet. | Part Five. | Using an Ability and resting now each have "We are in a corrupted place": the save takes two rolls with the worse one counting, and rest restores no HP. Tainted Fatigue from such a place, and the worst-case misfire, are still open. |

| Wording that had drifted: "Stabilized", "Mark as corrupted", "a full pack", "Small: no slot". | The rulebook says "saved", "catches lasting corruption", "every slot full", and that tiny things need no slot. | Reworded. |

## Still open

| # | What | Rulebook | Notes |
|---|---|---|---|
| 2 | The worst-case misfire in a corrupted place is not in the library. | "Misfires are as bad as they can be." | Needs a ruling on what "as bad as they can be" means for each misfire. |
| 3 | Backlash from a misfire takes HP then Strength, but does not lead to a Scar or a Strength save. | The rulebook says this of "an attack". | Needs John's reading: is backlash an attack? |
| 4 | In the library but not reachable in the app: Fatigue for each deprived day, repair for Built characters, special-item charges, imbuing gear, the other ways of paying for Abilities. The fight tracker has no crowds, and no impaired or enhanced attacks. | Various. | The largest gap. Each is a small screen over tested library code. |
| 5 | Custom Origins: no check on the kit weapon's die or on more than one piece of armor. The AI caps a kit at four items; the rulebook allows five. Custom gear has no "small" size. | Part Two and Part Six guidance. | Minor. |
| 6 | "Small: no slot" when adding an item. | "Small items can share a slot. A few tiny things do not need a slot at all." | Wording, and a way to share a slot. |

## Deliberate differences

- **AI-made creatures: a Blast does d6 at most, and no attack does more than d12.** The rulebook sets no cap on a creature's Blast. The AI's output is held tighter than a human Warden's, because nobody has judged it yet when it arrives. A Warden can raise it in the form.

## Where the rulebook is silent and the code chose

- A Built character ("rest and medicine do not heal you") gets no HP back from rest either.
- A character with an Affinity but no Abilities yet is treated as "without Abilities" for corruption, and loses Willpower.
- Losing a Tier below 3 keeps the second Affinity.
- After dropping an item, HP stays at 0 until a rest.
- For morale, the steadiest enemy still standing rolls for all.
- Scar 6 compares the 3d6 roll with the full score.
- A one-slot ranged weapon may do d6; the weapons table lists d4.
- Imbuing accepts a special item; the rulebook says "one ordinary item".

These are worth a line each in the rulebook's next draft, so the book and the app say the same thing.
