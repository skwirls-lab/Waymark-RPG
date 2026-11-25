import { applyOriginBonus, type Attributes } from './creation.ts';
import { data, type Origin } from './data.ts';
import { assertRoll } from './dice.ts';
import { RulesError, type AttributeKey, type Character, type Die } from './types.ts';

/**
 * The rulebook's "make your own" guidance, as checks. Each returns a list of
 * warnings in plain words; an empty list means the thing fits the guidance.
 * Warnings advise. Only the Warden decides.
 */

/** An Origin a Warden has written for their world. Same shape as the rulebook's own. */
export type CustomOrigin = Origin;

export interface CustomAbility {
  id: string;
  name: string;
  text: string;
  /** The id of the Affinity it belongs to, built-in or custom. */
  affinity: string;
}

export interface CustomAffinity {
  id: string;
  name: string;
  about: string;
}

export interface CustomGear {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'tool' | 'special';
  slots: 0 | 1 | 2;
  damage?: Die;
  armor?: number;
  ranged?: boolean;
  /** For special items. */
  charges?: number;
  text?: string;
}

export interface CustomCreature {
  id: string;
  name: string;
  hp: number;
  armor: number;
  str: number;
  dex: number;
  wil: number;
  attack: string;
  damage: Die[];
  blast?: boolean;
  notes: string[];
}

const FIGHTING_WORDS = /\b(hp|hit protection|armor|damage|attack|extra turn|act twice)\b/i;

export function checkOrigin(
  origin: Pick<CustomOrigin, 'name' | 'trait' | 'drawback' | 'slots' | 'kit'>,
): string[] {
  const warnings: string[] = [];
  if (!origin.name.trim()) warnings.push('Give the Origin a name.');
  if (!origin.trait.trim())
    warnings.push('An Origin needs a trait: something these people can naturally do.');
  if (FIGHTING_WORDS.test(origin.trait)) {
    warnings.push(
      'Avoid traits that make a character better at fighting or give extra HP or Armor. They make every other Origin look worse.',
    );
  }
  if (origin.slots !== 10 && !origin.drawback?.trim()) {
    warnings.push(
      'A trait that changes one of the game’s numbers, such as inventory slots, should be balanced with a drawback.',
    );
  }
  if (origin.kit.filter((item) => item.kind === 'weapon').length > 1)
    warnings.push('Keep the kit to one weapon.');
  if (origin.kit.some((item) => item.kind === 'armor' && (item.armor ?? 0) > 1)) {
    warnings.push('A starting kit should have one piece of light armor at most.');
  }
  if (origin.kit.length > 5)
    warnings.push('Keep the kit short: a weapon, armor if any, and two or three tools.');
  return warnings;
}

export function checkAbility(ability: Pick<CustomAbility, 'name' | 'text'>): string[] {
  const warnings: string[] = [];
  if (!ability.name.trim()) warnings.push('Give the Ability a name.');
  if (ability.text.trim().length < 10)
    warnings.push('Say what the Ability does, in a sentence or two.');
  const dice = [...ability.text.matchAll(/\bd(\d+)\b/g)].map((m) => Number(m[1]));
  if (dice.some((die) => die >= 10)) {
    warnings.push(
      'An Ability that harms one target should do d6 or d8. Every Ability costs the same, so they should be about equally useful.',
    );
  }
  if (
    /blast|everyone|every target|all (creatures|targets)/i.test(ability.text) &&
    dice.some((die) => die > 6)
  ) {
    warnings.push('An Ability that harms everything in an area should do d6.');
  }
  if (/\b(always|never fails|cannot be stopped|no limit)\b/i.test(ability.text)) {
    warnings.push(
      'Every Ability needs a limit. What can it not do, and how would an enemy get around it?',
    );
  }
  return warnings;
}

export function checkGear(gear: CustomGear): string[] {
  const warnings: string[] = [];
  if (!gear.name.trim()) warnings.push('Give the item a name.');
  if (gear.kind === 'weapon') {
    if (!gear.damage) warnings.push('A weapon needs a damage die.');
    else {
      // By how it is carried: hidden in a coat d6, one hand d8, two hands d10. Ranged is one size smaller.
      const melee: Die = gear.slots === 2 ? 10 : 8;
      const limit: Die = gear.ranged ? (melee === 10 ? 8 : 6) : melee;
      if (gear.damage > 10) warnings.push('No weapon a person can carry does more than d10.');
      else if (gear.damage > limit) {
        warnings.push(
          gear.ranged
            ? `A ranged weapon of this size should do d${limit} at most. Attacking from a distance is safer.`
            : 'A weapon that does d10 needs both hands, so it should be bulky.',
        );
      }
    }
  }
  if (gear.kind === 'armor') {
    if (!gear.armor) warnings.push('Armor needs an Armor value.');
    else if (gear.armor > 3) warnings.push('Nothing gives more than 3 Armor.');
    else if (gear.armor >= 2 && gear.slots !== 2)
      warnings.push('Armor worth 2 or 3 should be bulky.');
  }
  if (gear.kind === 'special') {
    if (!gear.charges || gear.charges < 1 || gear.charges > 3)
      warnings.push('A special item has one to three charges.');
    if (!gear.text?.trim())
      warnings.push('Say what the special item does, and how it is recharged.');
  }
  return warnings;
}

export function checkCreature(creature: Omit<CustomCreature, 'id'>): string[] {
  const warnings: string[] = [];
  if (!creature.name.trim()) warnings.push('Give the creature a name.');
  if (creature.hp < 1) warnings.push('A creature needs at least 1 HP.');
  if (creature.armor > 3) warnings.push('Armor is never more than 3.');
  for (const [name, score] of [
    ['Strength', creature.str],
    ['Dexterity', creature.dex],
    ['Willpower', creature.wil],
  ] as const) {
    if (score < 1 || score > 18)
      warnings.push(`${name} should be between 1 and 18. 10 is average.`);
  }
  if (creature.damage.length === 0)
    warnings.push('Choose its attack die as you would for a weapon.');
  if (creature.damage.some((die) => die >= 10) || creature.blast) {
    warnings.push(
      'A d10 attack, or any Blast, can kill a new character in a single round. Give the players plenty of warning.',
    );
  }
  if (creature.notes.length === 0)
    warnings.push('Add one memorable thing, and how the players will see it coming.');
  return warnings;
}

/** A creature in a fight: only the numbers that change. */
export interface CreatureState {
  hp: number;
  armor: number;
  str: number;
}

export interface CreatureHit {
  state: CreatureState;
  taken: number;
  /** Strength was lost and the creature is still alive: it makes a Strength save. */
  strengthSaveRequired: boolean;
  dead: boolean;
  /** HP has just reached 0, which matters for a lone enemy's morale. */
  reachedZeroHp: boolean;
}

/** Creatures take damage exactly as characters do: Armor, then HP, then Strength. */
export function hitCreature(
  creature: CreatureState,
  amount: number,
  options: { ignoreArmor?: boolean } = {},
): CreatureHit {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RulesError('bad-damage', 'Damage must be a whole number, zero or more.');
  }
  const taken = Math.max(0, amount - (options.ignoreArmor ? 0 : Math.min(3, creature.armor)));
  const hpLost = Math.min(creature.hp, taken);
  const overflow = taken - hpLost;
  const str = Math.max(0, creature.str - overflow);
  const hp = creature.hp - hpLost;
  return {
    state: { hp, armor: creature.armor, str },
    taken,
    strengthSaveRequired: overflow > 0 && str > 0,
    dead: str <= 0,
    reachedZeroHp: creature.hp > 0 && hp === 0,
  };
}

/** A companion is made quickly: 3d6 for each attribute and 1d6 for HP, typed in or rolled. */
export function makeCompanion(rolls: {
  str: number;
  dex: number;
  wil: number;
  hp: number;
}): CreatureState & { dex: number; wil: number } {
  for (const key of ['str', 'dex', 'wil'] as const) {
    if (!Number.isInteger(rolls[key]) || rolls[key] < 3 || rolls[key] > 18) {
      throw new RulesError('bad-attribute', 'Attributes are rolled on 3d6: 3 to 18.');
    }
  }
  assertRoll(rolls.hp, 6);
  return { hp: rolls.hp, armor: 0, str: rolls.str, dex: rolls.dex, wil: rolls.wil };
}

/** Content a world adds on top of the rulebook's own. */
export interface ExtraContent {
  origins?: CustomOrigin[];
  affinities?: CustomAffinity[];
  abilities?: CustomAbility[];
}

/** Every Origin available: the rulebook's, then the world's. */
export function allOrigins(extra: ExtraContent = {}): Origin[] {
  return [...data.origins, ...(extra.origins ?? [])];
}

export interface AffinityChoice {
  id: string;
  name: string;
  about: string;
  suits: string;
  abilities: { id: string; name: string; text: string }[];
}

/** Every Affinity available, each with its Abilities: the rulebook's, plus the world's additions. */
export function allAffinities(extra: ExtraContent = {}): AffinityChoice[] {
  const added = extra.abilities ?? [];
  const builtIn = data.affinities.map((a) => ({
    id: a.id,
    name: a.name,
    about: a.about,
    suits: a.suits,
    abilities: [
      ...a.abilities,
      ...added.filter((x) => x.affinity === a.id).map(({ id, name, text }) => ({ id, name, text })),
    ],
  }));
  const custom = (extra.affinities ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    about: a.about,
    suits: '',
    abilities: added
      .filter((x) => x.affinity === a.id)
      .map(({ id, name, text }) => ({ id, name, text })),
  }));
  return [...builtIn, ...custom];
}

/** Which Affinity each Ability belongs to, across the rulebook and the world. */
export function abilityIndexWith(extra: ExtraContent = {}): Record<string, string> {
  return Object.fromEntries(
    allAffinities(extra).flatMap((a) => a.abilities.map((b) => [b.id, a.id])),
  );
}

/** The +1 from any Origin, built-in or custom. */
export function applyAnyOriginBonus(
  attributes: Attributes,
  originId: string | null | undefined,
  extra: ExtraContent = {},
): Attributes {
  const origin = allOrigins(extra).find((o) => o.id === originId);
  return origin ? applyOriginBonus(attributes, origin) : attributes;
}

export const ATTRIBUTE_KEYS: AttributeKey[] = ['str', 'dex', 'wil'];

/** A character's Origin as the sheet shows it, whether from the rulebook or their world. */
export function originOf(
  character: Character,
): { name: string; trait: string; drawback: string | null } | undefined {
  return character.homebrew?.origin ?? data.origins.find((o) => o.id === character.originId);
}

/** An Ability's name and text, whether from the rulebook or the character's world. */
export function abilityOf(
  character: Pick<Character, 'homebrew'>,
  abilityId: string,
): { name: string; text: string } | undefined {
  return (
    character.homebrew?.abilities?.[abilityId] ??
    data.affinities.flatMap((a) => a.abilities).find((a) => a.id === abilityId)
  );
}

/** An Affinity's name, whether from the rulebook or the character's world. */
export function affinityNameOf(
  character: Pick<Character, 'homebrew'>,
  affinityId: string | null,
): string | undefined {
  if (!affinityId) return undefined;
  return (
    character.homebrew?.affinities?.[affinityId] ??
    data.affinities.find((a) => a.id === affinityId)?.name
  );
}
