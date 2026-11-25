import { data, type Origin } from './data.ts';
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

/** Ids must stay unique for the life of the character, across sessions and devices. */
const newId = () => `item-${crypto.randomUUID()}`;

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

/** Content a world adds, as far as making a character is concerned. See workshop.ts. */
export interface CreationContent {
  origins?: Origin[];
  affinities?: { id: string; name: string }[];
  abilities?: { id: string; name: string; text: string; affinity: string }[];
}

/**
 * Puts the six steps together into a finished character.
 * `extra` adds a world's own Origins, Affinities and Abilities to the rulebook's.
 */
export function createCharacter(input: NewCharacter, extra: CreationContent = {}): Character {
  for (const key of ['str', 'dex', 'wil'] as const) {
    const value = input.attributes[key];
    if (!Number.isInteger(value) || value < 3 || value > 18) {
      throw new RulesError('bad-attribute', 'Attributes are rolled on 3d6: 3 to 18.');
    }
  }
  if (!Number.isInteger(input.hp) || input.hp < 1 || input.hp > 6) {
    throw new RulesError('bad-hp', 'Starting Hit Protection is 1d6: 1 to 6.');
  }
  const customOrigin = input.originId
    ? extra.origins?.find((o) => o.id === input.originId)
    : undefined;
  const origin =
    customOrigin ??
    (input.originId ? data.origins.find((o) => o.id === input.originId) : undefined);
  if (input.originId && !origin) throw new RulesError('no-origin', 'That Origin does not exist.');

  const primary = input.primaryAffinity ?? null;
  const customAffinity = extra.affinities?.find((a) => a.id === primary);
  if (primary && !customAffinity && !data.affinities.some((a) => a.id === primary)) {
    throw new RulesError('no-affinity', 'That Affinity does not exist.');
  }
  const abilities = input.abilities ?? [];
  if (abilities.length > 2)
    throw new RulesError('too-many-abilities', 'A new character knows two Abilities at most.');
  if (new Set(abilities).size !== abilities.length)
    throw new RulesError('duplicate-ability', 'Choose two different Abilities.');
  const affinityOf = (id: string) =>
    extra.abilities?.find((a) => a.id === id)?.affinity ??
    data.affinities.find((a) => a.abilities.some((b) => b.id === id))?.id;
  if (abilities.some((id) => !primary || affinityOf(id) !== primary)) {
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
  const customAbilities = abilities.flatMap(
    (id) => extra.abilities?.filter((a) => a.id === id) ?? [],
  );
  if (customOrigin || customAffinity || customAbilities.length > 0) {
    character.homebrew = {
      ...(customOrigin
        ? {
            origin: {
              name: customOrigin.name,
              trait: customOrigin.trait,
              drawback: customOrigin.drawback,
            },
          }
        : {}),
      ...(customAffinity ? { affinities: { [customAffinity.id]: customAffinity.name } } : {}),
      ...(customAbilities.length > 0
        ? {
            abilities: Object.fromEntries(
              customAbilities.map((a) => [a.id, { name: a.name, text: a.text }]),
            ),
          }
        : {}),
    };
  }
  if (slotsUsed(character) > character.slotCapacity) {
    throw new RulesError('no-room', 'That is more than this character can carry.');
  }
  return settle(character);
}

/**
 * Turns a row of the general starting kit table into items, for a character
 * with no Origin. "Standard weapon (d8)" becomes a weapon; "Rope and a
 * grappling hook" becomes two tools.
 */
export function startingKitItems(kit: { weapon: string; armor: string; tools: string }): Item[] {
  const items: Item[] = [];
  const bulky = (text: string): 1 | 2 => (text.includes('bulky') ? 2 : 1);
  const label = (text: string) => text.replace(/ \(.*\)$/, '');

  const damage = kit.weapon.match(/d(\d+)/);
  if (damage) {
    items.push({
      id: newId(),
      name: label(kit.weapon),
      kind: 'weapon',
      slots: bulky(kit.weapon),
      place: 'pack',
      damage: Number(damage[1]) as Die,
    });
  }
  const armor = kit.armor.match(/\+?(\d) Armor/);
  if (armor) {
    items.push({
      id: newId(),
      name: label(kit.armor),
      kind: 'armor',
      slots: bulky(kit.armor),
      place: 'pack',
      armor: Number(armor[1]),
      ...(kit.armor.includes('+') ? { stacks: true } : {}),
    });
  }
  for (const tool of kit.tools.split(/ and (?:an? )?/)) {
    items.push({
      id: newId(),
      name: tool.charAt(0).toUpperCase() + tool.slice(1),
      kind: 'tool',
      slots: 1,
      place: 'pack',
    });
  }
  return items;
}
