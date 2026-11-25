import {
  allOrigins,
  applyOriginBonus,
  createCharacter,
  data,
  kitItems,
  startingKitItems,
  swapAttributes,
  type AttributeKey,
  type Character,
  type ExtraContent,
} from '@waymark/rules';

export const STEPS = [
  'Attributes',
  'Hit Protection',
  'Background and name',
  'Origin',
  'Affinity and Abilities',
  'Starting gear',
] as const;

/** A key of the idea lists in ideas.ts. */
export type Genre = string;

/** Everything chosen so far. Saved as the player goes, so a half-made character survives a closed tab. */
export interface Draft {
  step: number;
  str?: number;
  dex?: number;
  wil?: number;
  swap: [AttributeKey, AttributeKey] | null;
  hp?: number;
  name: string;
  genre: Genre;
  background: string;
  description: string;
  age?: number;
  /** `undefined` until chosen; `null` for no Origin. */
  originId?: string | null;
  /** `undefined` until chosen. */
  gift?: 'none' | 'latent' | 'awake';
  affinity: string | null;
  abilities: string[];
  coins?: number;
  kitWeapon?: number;
  kitArmor?: number;
  kitTools?: number;
  /** Whose extra Origins and Abilities to offer: a campaign (`c:id`) or one of your worlds (`w:id`). */
  source?: string;
}

export const emptyDraft = (): Draft => ({
  step: 0,
  swap: null,
  name: '',
  genre: 'fantasy',
  background: '',
  description: '',
  affinity: null,
  abilities: [],
});

/** The three rolled scores, after any swap and before the Origin bonus. */
export function rolledAttributes(d: Draft): Record<AttributeKey, number> | null {
  if (d.str === undefined || d.dex === undefined || d.wil === undefined) return null;
  const rolled = { str: d.str, dex: d.dex, wil: d.wil };
  return d.swap ? swapAttributes(rolled, d.swap[0], d.swap[1]) : rolled;
}

/** The scores as they will be on the sheet. */
export function finalAttributes(
  d: Draft,
  extra: ExtraContent = {},
): Record<AttributeKey, number> | null {
  const rolled = rolledAttributes(d);
  const origin = allOrigins(extra).find((o) => o.id === d.originId);
  return rolled && origin ? applyOriginBonus(rolled, origin) : rolled;
}

/** Whether the current step has everything it needs to move on. */
export function stepComplete(d: Draft, step: number): boolean {
  switch (step) {
    case 0:
      return rolledAttributes(d) !== null;
    case 1:
      return d.hp !== undefined;
    case 2:
      return d.name.trim() !== '' && d.background.trim() !== '';
    case 3:
      return d.originId !== undefined;
    case 4:
      return (
        d.gift === 'none' ||
        (d.gift === 'latent' && !!d.affinity) ||
        (d.gift === 'awake' && !!d.affinity && d.abilities.length === 2)
      );
    default:
      return (
        d.coins !== undefined &&
        (!!d.originId ||
          (d.kitWeapon !== undefined && d.kitArmor !== undefined && d.kitTools !== undefined))
      );
  }
}

export function kitRows(d: Draft) {
  if (d.kitWeapon === undefined || d.kitArmor === undefined || d.kitTools === undefined)
    return null;
  return {
    weapon: data.startingKit[d.kitWeapon - 1]!.weapon,
    armor: data.startingKit[d.kitArmor - 1]!.armor,
    tools: data.startingKit[d.kitTools - 1]!.tools,
  };
}

/** Turns a finished draft into a character sheet, using the rules library. */
export function buildCharacter(d: Draft, extra: ExtraContent = {}): Character {
  const attributes = rolledAttributes(d);
  if (!attributes || d.hp === undefined || d.coins === undefined)
    throw new Error('The character is not finished.');
  const rows = kitRows(d);
  const customOrigin = extra.origins?.find((o) => o.id === d.originId);
  return createCharacter(
    {
      name: d.name.trim(),
      background: d.background.trim(),
      attributes,
      hp: d.hp,
      coins: d.coins,
      originId: d.originId ?? null,
      primaryAffinity: d.gift === 'none' ? null : d.affinity,
      abilities: d.gift === 'awake' ? d.abilities : [],
      items: customOrigin
        ? kitItems(customOrigin)
        : d.originId
          ? undefined
          : rows
            ? startingKitItems(rows)
            : [],
    },
    extra,
  );
}
