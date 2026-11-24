import { assertRoll } from './dice.ts';
import { addFatigue, clone, freeSlots, removeItem, type FatigueOutcome } from './inventory.ts';
import { checkSave, pickRoll } from './saves.ts';
import { RulesError, type Character } from './types.ts';

/** How many Abilities each Tier allows. Tiers 4 and 5 have no limit. */
export const TIER_LIMITS: readonly number[] = [2, 4, 6, Infinity, Infinity];
export const MAX_TIER = 5;
export const SECOND_AFFINITY_TIER = 3;

export function abilityLimit(tier: number): number {
  const limit = TIER_LIMITS[tier - 1];
  if (limit === undefined) throw new RulesError('bad-tier', 'Tiers run from 1 to 5.');
  return limit;
}

/** The lists an Ability may be learned from: which Affinity each Ability belongs to. */
export type AbilityIndex = Readonly<Record<string, string>>;

export function canLearnAbility(
  c: Character,
  abilityId: string,
  index: AbilityIndex,
): { ok: true } | { ok: false; reason: string } {
  const affinity = index[abilityId];
  if (!affinity) return { ok: false, reason: 'That Ability does not exist.' };
  if (c.abilities.includes(abilityId)) return { ok: false, reason: 'Already known.' };
  if (c.abilities.length >= abilityLimit(c.tier)) {
    return { ok: false, reason: `Tier ${c.tier} allows ${abilityLimit(c.tier)} Abilities.` };
  }
  if (affinity === c.primaryAffinity) return { ok: true };
  if (affinity === c.secondaryAffinity && c.tier >= SECOND_AFFINITY_TIER) return { ok: true };
  return { ok: false, reason: 'That Ability is outside your Affinities.' };
}

export function learnAbility(
  character: Character,
  abilityId: string,
  index: AbilityIndex,
): Character {
  const verdict = canLearnAbility(character, abilityId, index);
  if (!verdict.ok) throw new RulesError('cannot-learn', verdict.reason);
  const c = clone(character);
  c.abilities.push(abilityId);
  return c;
}

/** A second Affinity opens at Tier 3. */
export function chooseSecondaryAffinity(character: Character, affinityId: string): Character {
  if (character.tier < SECOND_AFFINITY_TIER) {
    throw new RulesError('tier-too-low', 'A second Affinity opens at Tier 3.');
  }
  if (affinityId === character.primaryAffinity) {
    throw new RulesError('same-affinity', 'That is already your Primary Affinity.');
  }
  const c = clone(character);
  c.secondaryAffinity = affinityId;
  return c;
}

export function awardTier(character: Character): Character {
  if (character.tier >= MAX_TIER) throw new RulesError('max-tier', 'Tier 5 is the highest.');
  const c = clone(character);
  c.tier += 1;
  return c;
}

export const MISFIRES = [
  'fizzle',
  'drained',
  'backlash',
  'astray',
  'reversed',
  'blackout',
] as const;
export type Misfire = (typeof MISFIRES)[number];

export interface UseAbilityInput {
  abilityId: string;
  /** In a fight, being chased, falling, and so on. Being deprived counts too. */
  inDanger: boolean;
  inCorruptedPlace?: boolean;
  /** The Willpower save, needed under pressure: one d20, or two in a corrupted place. */
  saveRolls?: number[];
  /** The d6 on the misfire table, needed if the save fails. */
  misfireRoll?: number;
  /** The d6 of damage a Backlash deals. */
  backlashDamage?: number;
  /** Items to drop if Fatigue has nowhere to go: one per Fatigue gained. */
  dropItemIds?: string[];
  /** A world may replace Fatigue with another cost. Everything else stays the same. */
  cost?: AbilityCost;
}

export type AbilityCost =
  | { kind: 'fatigue' }
  /** A small pool of charges, refilled by a night's rest. */
  | { kind: 'charges' }
  /** The same Ability cannot be used again until after a short rest. */
  | { kind: 'recovery' }
  /** Each use burns up an ingredient or power cell carried in the pack. */
  | { kind: 'supplies'; itemId: string };

export interface UseAbilityResult {
  character: Character;
  /** Whether the Ability took effect. */
  worked: boolean;
  /** No pressure: the Ability can be stretched further at no extra cost. */
  canStretch: boolean;
  misfire: Misfire | null;
  fatigue: FatigueOutcome[];
}

/**
 * Using an Ability costs 1 Fatigue, whatever happens. When safe it simply
 * works. Under pressure it needs a Willpower save, and a failure misfires.
 */
export function useAbility(character: Character, input: UseAbilityInput): UseAbilityResult {
  if (!character.abilities.includes(input.abilityId)) {
    throw new RulesError('unknown-ability', 'This character does not know that Ability.');
  }
  const corrupted = input.inCorruptedPlace ?? false;
  const underPressure = input.inDanger || character.deprived;
  let worked = true;
  let misfire: Misfire | null = null;

  if (underPressure) {
    const needed = corrupted ? 2 : 1;
    const rolls = input.saveRolls ?? [];
    if (rolls.length !== needed) {
      throw new RulesError(
        'missing-roll',
        `This needs ${needed} d20 roll${needed > 1 ? 's' : ''}.`,
      );
    }
    const used = pickRoll(rolls, corrupted ? 'disadvantage' : 'normal');
    if (!checkSave(character.attributes.wil.current, used)) {
      if (input.misfireRoll === undefined) {
        throw new RulesError('missing-roll', 'The save failed. Roll a d6 on the misfire table.');
      }
      assertRoll(input.misfireRoll, 6);
      misfire = MISFIRES[input.misfireRoll - 1]!;
      // A Blackout still works; every other misfire replaces the Ability's effect.
      worked = misfire === 'blackout';
    }
  }

  let c = clone(character);
  const cost = input.cost ?? { kind: 'fatigue' };
  const drops = [...(input.dropItemIds ?? [])];
  const fatigue: FatigueOutcome[] = [];
  const gainFatigue = () => {
    const result = addFatigue(c, {
      tainted: corrupted,
      dropItemId: freeSlots(c) < 1 ? drops.shift() : undefined,
    });
    c = result.character;
    fatigue.push(result.outcome);
  };
  if (cost.kind === 'fatigue') {
    gainFatigue();
    if (misfire === 'drained') gainFatigue();
  } else if (cost.kind === 'charges') {
    const pool = c.abilityCharges;
    if (!pool || pool.current < 1) throw new RulesError('no-charges', 'There are no charges left.');
    // A Drained misfire spends a second charge if there is one.
    pool.current -= misfire === 'drained' && pool.current >= 2 ? 2 : 1;
  } else if (cost.kind === 'recovery') {
    if (c.recovering?.includes(input.abilityId)) {
      throw new RulesError(
        'recovering',
        'That Ability needs a short rest before it can be used again.',
      );
    }
    c.recovering = [...(c.recovering ?? []), input.abilityId];
  } else {
    c = removeItem(c, cost.itemId);
  }
  if (misfire === 'backlash') {
    if (input.backlashDamage === undefined) {
      throw new RulesError('missing-roll', 'Backlash deals d6 damage. Roll it.');
    }
    assertRoll(input.backlashDamage, 6);
    // Armor does not help against a Backlash.
    const hpLost = Math.min(c.hp.current, input.backlashDamage);
    c.hp.current -= hpLost;
    c.attributes.str.current = Math.max(
      0,
      c.attributes.str.current - (input.backlashDamage - hpLost),
    );
  }
  if (misfire === 'blackout') c.conditions = [...new Set([...c.conditions, 'unconscious'])];

  return { character: c, worked, canStretch: !underPressure, misfire, fatigue };
}

/** Lasting corruption is caught by losing Strength to a corrupted creature or weapon. */
export function catchCorruption(character: Character): Character {
  const c = clone(character);
  if (!c.corruption.afflicted) c.corruption = { afflicted: true, failedSaves: 0 };
  return c;
}

export interface CorruptionInput {
  d20: number;
  /** The d4 of Willpower lost, for a character with no Abilities. */
  willpowerLoss?: number;
  /** Abilities to give up if a lost Tier leaves the character over its limit. */
  forget?: string[];
}

export interface CorruptionResult {
  character: Character;
  saved: boolean;
  /** Three failures were reached and something was burned away. */
  burned: 'tier' | 'willpower' | null;
}

/** The daily Willpower save against lasting corruption. Three failures cost something for good. */
export function corruptionDailySave(
  character: Character,
  input: CorruptionInput,
): CorruptionResult {
  if (!character.corruption.afflicted) {
    throw new RulesError('not-afflicted', 'This character has no lasting corruption.');
  }
  const c = clone(character);
  if (checkSave(c.attributes.wil.current, input.d20))
    return { character: c, saved: true, burned: null };
  c.corruption.failedSaves += 1;
  if (c.corruption.failedSaves < 3) return { character: c, saved: false, burned: null };

  c.corruption.failedSaves = 0;
  if (c.abilities.length > 0) {
    if (c.tier <= 1) {
      c.lost = true;
      return { character: c, saved: false, burned: 'tier' };
    }
    c.tier -= 1;
    const excess = c.abilities.length - abilityLimit(c.tier);
    if (excess > 0) {
      const forget = input.forget ?? [];
      if (forget.length !== excess || !forget.every((id) => c.abilities.includes(id))) {
        throw new RulesError(
          'must-forget',
          `Choose ${excess} Abilit${excess > 1 ? 'ies' : 'y'} to lose.`,
        );
      }
      c.abilities = c.abilities.filter((id) => !forget.includes(id));
    }
    return { character: c, saved: false, burned: 'tier' };
  }
  if (input.willpowerLoss === undefined) {
    throw new RulesError('missing-roll', 'Roll a d4 for the Willpower lost.');
  }
  assertRoll(input.willpowerLoss, 4);
  c.attributes.wil.full = Math.max(0, c.attributes.wil.full - input.willpowerLoss);
  c.attributes.wil.current = Math.min(c.attributes.wil.current, c.attributes.wil.full);
  if (c.attributes.wil.full <= 0) c.lost = true;
  return { character: c, saved: false, burned: 'willpower' };
}
