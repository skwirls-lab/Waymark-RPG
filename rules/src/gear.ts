import { addFatigue, clone, type FatigueOptions } from './inventory.ts';
import { checkSave } from './saves.ts';
import { RulesError, type AttributeKey, type Character } from './types.ts';

export interface ImbueResult {
  character: Character;
  success: boolean;
}

/**
 * Imbuing at a place of power: one catalyst is used up either way. On a
 * failed Willpower save the item is unchanged and the crafter gains 1 Fatigue.
 */
export function imbueItem(
  crafter: Character,
  itemId: string,
  kind: 'light' | 'dark',
  d20: number,
  fatigue: FatigueOptions = {},
): ImbueResult {
  const item = crafter.items.find((i) => i.id === itemId);
  if (!item) throw new RulesError('no-item', 'That item is not being carried.');
  if (item.imbued) throw new RulesError('already-imbued', 'An item can only be imbued once.');
  if (checkSave(crafter.attributes.wil.current, d20)) {
    const c = clone(crafter);
    c.items.find((i) => i.id === itemId)!.imbued = kind;
    return { character: c, success: true };
  }
  return { character: addFatigue(crafter, fatigue).character, success: false };
}

/**
 * The score to save against. Imbued armor or a shield adds 1 to Willpower
 * against fear, illusions and attacks on the mind.
 */
export function saveScore(
  c: Character,
  key: AttributeKey,
  options: { againstTheMind?: boolean } = {},
): number {
  const score = c.attributes[key].current;
  const warded = c.items.some(
    (i) => i.kind === 'armor' && i.place !== 'pack' && i.imbued === 'light',
  );
  return key === 'wil' && options.againstTheMind && warded ? score + 1 : score;
}

/** Dark armor counts as 1 lower against the Abilities of those who oppose the corruption. */
export function armorAgainstOpposingAbilities(c: Character, armor: number): number {
  const dark = c.items.some((i) => i.kind === 'armor' && i.place !== 'pack' && i.imbued === 'dark');
  return dark ? Math.max(0, armor - 1) : armor;
}

/** Using a special item spends one of its charges and causes no Fatigue. */
export function spendCharge(character: Character, itemId: string): Character {
  const c = clone(character);
  const item = c.items.find((i) => i.id === itemId);
  if (!item?.charges) throw new RulesError('no-item', 'That is not a special item with charges.');
  if (item.charges.current < 1)
    throw new RulesError('no-charges', 'That item has no charges left.');
  item.charges.current -= 1;
  return c;
}

/** Each special item has its own way of recharging, which the characters must go and do. */
export function rechargeItem(character: Character, itemId: string): Character {
  const c = clone(character);
  const item = c.items.find((i) => i.id === itemId);
  if (!item?.charges) throw new RulesError('no-item', 'That is not a special item with charges.');
  item.charges.current = item.charges.full;
  return c;
}
