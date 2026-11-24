import { abilityIndex, data, type Origin } from './data.ts';
import { roll, rollSum, type Rng } from './dice.ts';
import { settle, slotsUsed } from './inventory.ts';
import { RulesError, type AttributeKey, type Character, type Die, type Item } from './types.ts';

export type Attributes = Record<AttributeKey, number>;

/** Step 1: 3d6 for Strength, then Dexterity, then Willpower. */
export function rollAttributes(rng: Rng): Attributes {
  return {
    str: rollSum(3, 6, rng).total,
    dex: rollSum(3, 6, rng).total,
    wil: rollSum(3, 6, rng).total,
  };
}

/** Step 1: any two results may be swapped, once. */
export function swapAttributes(
  attributes: Attributes,
  a: AttributeKey,
  b: AttributeKey,
): Attributes {
  return { ...attributes, [a]: attributes[b], [b]: attributes[a] };
}

/** Step 2: Hit Protection is 1d6. */
export const rollHp = (rng: Rng): number => roll(6, rng);

/** Step 3: age is 2d20+10. */
export const rollAge = (rng: Rng): number => rollSum(2, 20, rng).total + 10;

/** Step 6: 3d6 coins. */
export const rollCoins = (rng: Rng): number => rollSum(3, 6, rng).total;

/** Step 4: an Origin adds 1 to one attribute, which cannot go above 18. */
export function applyOriginBonus(attributes: Attributes, origin: Origin): Attributes {
  const key = origin.bonus.attribute;
  return { ...attributes, [key]: Math.min(18, attributes[key] + origin.bonus.amount) };
}

/** Step 6, without an Origin: a d6 each for weapon, armor and tools. */
export function rollStartingKit(rng: Rng): { weapon: string; armor: string; tools: string } {
  const row = () => data.startingKit[roll(6, rng) - 1]!;
  return { weapon: row().weapon, armor: row().armor, tools: row().tools };
}

let nextId = 0;
const newId = () => `item-${++nextId}`;

/** Every character starts with three days of rations and a light source. */
export function basicSupplies(): Item[] {
  return [
    { id: newId(), name: 'Rations (three days)', kind: 'tool', slots: 1, place: 'pack' },
    { id: newId(), name: 'Light source', kind: 'tool', slots: 1, place: 'pack' },
  ];
}

/** Turns an Origin's kit into items. */
export function kitItems(origin: Origin): Item[] {
  return origin.kit.flatMap((entry) =>
    Array.from({ length: entry.quantity ?? 1 }, (): Item => ({
      id: newId(),
      name: entry.name,
      kind: entry.kind,
      slots: entry.slots,
      place: 'pack',
      ...(entry.damage ? { damage: entry.damage as Die } : {}),
      ...(entry.armor ? { armor: entry.armor } : {}),
    })),
  );
}

/** Puts weapons in free hands and armor on the body; everything else stays in the pack. */
export function arrangeItems(items: Item[]): Item[] {
  let hands = 2;
  let body = 2;
  return items.map((item) => {
    if (item.kind === 'armor' && !item.stacks && body >= item.slots) {
      body -= item.slots;
      return { ...item, place: 'body' as const };
    }
    if (item.kind === 'weapon' && hands >= item.slots) {
      hands -= item.slots;
      return { ...item, place: 'hand' as const };
    }
    return { ...item, place: 'pack' as const };
  });
}

export interface NewCharacter {
  name: string;
  background: string;
  attributes: Attributes;
  hp: number;
  coins: number;
  originId?: string | null;
  primaryAffinity?: string | null;
  /** Up to two, from the Primary Affinity. Empty for a latent gift or no Abilities. */
  abilities?: string[];
  /** Items beyond rations and a light source. Defaults to the Origin's kit. */
  items?: Item[];
}

/** Puts the six steps together into a finished character. */
export function createCharacter(input: NewCharacter): Character {
  for (const key of ['str', 'dex', 'wil'] as const) {
    const value = input.attributes[key];
    if (!Number.isInteger(value) || value < 3 || value > 18) {
      throw new RulesError('bad-attribute', 'Attributes are rolled on 3d6: 3 to 18.');
    }
  }
  if (!Number.isInteger(input.hp) || input.hp < 1 || input.hp > 6) {
    throw new RulesError('bad-hp', 'Starting Hit Protection is 1d6: 1 to 6.');
  }
  const origin = input.originId ? data.origins.find((o) => o.id === input.originId) : undefined;
  if (input.originId && !origin) throw new RulesError('no-origin', 'That Origin does not exist.');

  const primary = input.primaryAffinity ?? null;
  if (primary && !data.affinities.some((a) => a.id === primary)) {
    throw new RulesError('no-affinity', 'That Affinity does not exist.');
  }
  const abilities = input.abilities ?? [];
  if (abilities.length > 2)
    throw new RulesError('too-many-abilities', 'A new character knows two Abilities at most.');
  if (new Set(abilities).size !== abilities.length)
    throw new RulesError('duplicate-ability', 'Choose two different Abilities.');
  if (abilities.some((id) => !primary || abilityIndex[id] !== primary)) {
    throw new RulesError('wrong-affinity', 'Starting Abilities come from the Primary Affinity.');
  }

  const attributes = origin ? applyOriginBonus(input.attributes, origin) : input.attributes;
  const score = (value: number) => ({ current: value, full: value });
  const character: Character = {
    name: input.name,
    background: input.background,
    originId: origin?.id ?? null,
    attributes: {
      str: score(attributes.str),
      dex: score(attributes.dex),
      wil: score(attributes.wil),
    },
    hp: score(input.hp),
    slotCapacity: origin?.slots ?? 10,
    items: arrangeItems([...(input.items ?? (origin ? kitItems(origin) : [])), ...basicSupplies()]),
    fatigue: 0,
    taintedFatigue: 0,
    deprived: false,
    daysDeprived: 0,
    healsByRest: origin?.id !== 'built',
    critical: false,
    doomed: false,
    lost: false,
    primaryAffinity: primary,
    secondaryAffinity: null,
    abilities: [...abilities],
    tier: 1,
    corruption: { afflicted: false, failedSaves: 0 },
    scars: [],
    conditions: [],
    coins: input.coins,
    rulesVersion: data.meta.version,
  };
  if (slotsUsed(character) > character.slotCapacity) {
    throw new RulesError('no-room', 'That is more than this character can carry.');
  }
  return settle(character);
}
