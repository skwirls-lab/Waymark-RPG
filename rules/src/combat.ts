import { roll, type Rng } from './dice.ts';
import { armorValue, clone, settle } from './inventory.ts';
import { checkSave } from './saves.ts';
import { RulesError, type AttributeKey, type Character, type Die } from './types.ts';

export type AttackModifier = 'normal' | 'impaired' | 'enhanced';

/** Impaired attacks roll a d4 and enhanced attacks a d12, whatever the weapon. */
export function attackDie(weapon: Die, modifier: AttackModifier = 'normal'): Die {
  if (modifier === 'impaired') return 4;
  if (modifier === 'enhanced') return 12;
  return weapon;
}

/**
 * Rolls every die and keeps the single highest. Covers one weapon, two
 * weapons, and several attackers on one target.
 */
export function rollDamage(dice: readonly Die[], rng: Rng): { rolls: number[]; damage: number } {
  if (dice.length === 0) throw new RulesError('no-dice', 'An attack needs at least one die.');
  const rolls = dice.map((die) => roll(die, rng));
  return { rolls, damage: Math.max(...rolls) };
}

/** A Blast rolls separately for each target in the area. */
export function rollBlast(die: Die, targets: number, rng: Rng): number[] {
  return Array.from({ length: targets }, () => roll(die, rng));
}

/** One person against a crowd is impaired unless the attack is a Blast. */
export function modifierAgainstCrowd(isBlast: boolean): AttackModifier {
  return isBlast ? 'normal' : 'impaired';
}

/** A crowd's attacks are enhanced and count as Blast. */
export const CROWD_ATTACK = { modifier: 'enhanced', blast: true } as const;

export interface DamageResult {
  character: Character;
  /** Damage left after Armor. */
  taken: number;
  hpLost: number;
  strengthLost: number;
  /** HP landed on exactly 0: roll on the Scars table. */
  scarRequired: boolean;
  /** Strength was lost: make a Strength save against the new score. */
  strengthSaveRequired: boolean;
  dead: boolean;
}

/** Subtract Armor, take the rest from HP, and any remainder from Strength. */
export function applyDamage(
  character: Character,
  amount: number,
  options: { ignoreArmor?: boolean } = {},
): DamageResult {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RulesError('bad-damage', 'Damage must be a whole number, zero or more.');
  }
  const c = settle(clone(character));
  const taken = Math.max(0, amount - (options.ignoreArmor ? 0 : armorValue(c)));
  const hpBefore = c.hp.current;
  const hpLost = Math.min(hpBefore, taken);
  const overflow = taken - hpLost;
  c.hp.current = hpBefore - hpLost;
  const strengthLost = Math.min(c.attributes.str.current, overflow);
  c.attributes.str.current -= strengthLost;
  const dead = c.attributes.str.current <= 0;
  return {
    character: c,
    taken,
    hpLost,
    strengthLost,
    scarRequired: hpBefore > 0 && taken === hpBefore,
    strengthSaveRequired: overflow > 0 && !dead,
    dead,
  };
}

export interface StrengthSaveResult {
  character: Character;
  success: boolean;
  /** A Doomed character who passes rolls 3d6 for HP: see `applyDoomedReward`. */
  doomedRewardDue: boolean;
  dead: boolean;
}

/** After losing Strength: fail and the character has critical damage. */
export function resolveStrengthSave(character: Character, d20: number): StrengthSaveResult {
  const c = clone(character);
  const success = checkSave(c.attributes.str.current, d20);
  const wasDoomed = c.doomed;
  c.doomed = false;
  if (success) return { character: c, success, doomedRewardDue: wasDoomed, dead: false };
  if (wasDoomed) {
    c.attributes.str.current = 0;
    return { character: c, success, doomedRewardDue: false, dead: true };
  }
  c.critical = true;
  return { character: c, success, doomedRewardDue: false, dead: false };
}

/** Another character spends a few minutes tending someone with critical damage. */
export function stabilize(character: Character): Character {
  const c = clone(character);
  c.critical = false;
  return c;
}

/** Poison, draining attacks and the like reduce an attribute directly. */
export function loseAttribute(character: Character, key: AttributeKey, amount: number): Character {
  const c = clone(character);
  c.attributes[key].current = Math.max(0, c.attributes[key].current - amount);
  return c;
}

/** Some Abilities restore attribute points on the spot. */
export function restoreAttribute(
  character: Character,
  key: AttributeKey,
  amount: number,
): Character {
  const c = clone(character);
  c.attributes[key].current = Math.min(c.attributes[key].full, c.attributes[key].current + amount);
  return c;
}
