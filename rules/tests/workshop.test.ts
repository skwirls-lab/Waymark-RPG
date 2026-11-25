import { describe, expect, it } from 'vitest';
import {
  RulesError,
  abilityIndexWith,
  allAffinities,
  allOrigins,
  applyAnyOriginBonus,
  checkAbility,
  checkCreature,
  checkGear,
  checkOrigin,
  createCharacter,
  data,
  hitCreature,
  kitItems,
  makeCompanion,
  moraleCheckDue,
  type CustomAbility,
  type CustomOrigin,
} from '../src/index.ts';

const riverfolk: CustomOrigin = {
  id: 'riverfolk',
  name: 'Riverfolk',
  examples: 'otter-people',
  bonus: { attribute: 'dex', amount: 1 },
  trait: 'You swim as fast as you walk and can hold your breath for ten minutes.',
  drawback: null,
  slots: 10,
  kitText: 'Fishing spear (d8), net, oilskin bag',
  kit: [
    { name: 'Fishing spear', kind: 'weapon', damage: 8, slots: 1 },
    { name: 'Net', kind: 'tool', slots: 1 },
    { name: 'Oilskin bag', kind: 'tool', slots: 1 },
  ],
};
const tide: CustomAbility = {
  id: 'tide-call',
  name: 'Tide Call',
  text: 'Water within Near rises or falls by a few feet for ten minutes.',
  affinity: 'tides',
};
const extra = {
  origins: [riverfolk],
  affinities: [{ id: 'tides', name: 'Tides', about: 'Water and weather' }],
  abilities: [
    tide,
    {
      id: 'stitch',
      name: 'Stitch',
      text: 'Close a wound so it stops bleeding.',
      affinity: 'mending',
    },
  ],
};
const base = {
  name: 'Orla',
  background: 'Ferryman',
  attributes: { str: 10, dex: 12, wil: 11 },
  hp: 3,
  coins: 6,
};

describe("Making your own Origin: the rulebook's checks", () => {
  it('passes an Origin built to the guidance, and every Origin in the rulebook', () => {
    expect(checkOrigin(riverfolk)).toEqual([]);
    for (const origin of data.origins) expect(checkOrigin(origin), origin.name).toEqual([]);
  });

  it('needs a name and a trait', () => {
    expect(checkOrigin({ ...riverfolk, name: ' ', trait: '' })).toEqual([
      'Give the Origin a name.',
      'An Origin needs a trait: something these people can naturally do.',
    ]);
  });

  it('warns against traits that help in a fight', () => {
    for (const trait of [
      'You have 2 extra HP.',
      'Your Armor is 1 higher.',
      'You deal more damage with spears.',
    ]) {
      expect(checkOrigin({ ...riverfolk, trait })[0]).toMatch(/better at fighting/);
    }
  });

  it('asks for a drawback when the trait changes inventory size', () => {
    expect(checkOrigin({ ...riverfolk, slots: 12 })[0]).toMatch(/balanced with a drawback/);
    expect(
      checkOrigin({ ...riverfolk, slots: 12, drawback: 'You are large and cannot hide easily.' }),
    ).toEqual([]);
  });

  it('keeps the kit modest', () => {
    const twoWeapons = [
      ...riverfolk.kit,
      { name: 'Knife', kind: 'weapon' as const, damage: 6 as const, slots: 1 as const },
    ];
    expect(checkOrigin({ ...riverfolk, kit: twoWeapons })).toEqual(['Keep the kit to one weapon.']);
    const mail = [{ name: 'Mail', kind: 'armor' as const, armor: 2, slots: 2 as const }];
    expect(checkOrigin({ ...riverfolk, kit: mail })[0]).toMatch(/light armor at most/);
    const many = Array.from({ length: 6 }, () => ({
      name: 'Thing',
      kind: 'tool' as const,
      slots: 1 as const,
    }));
    expect(checkOrigin({ ...riverfolk, kit: many })[0]).toMatch(/Keep the kit short/);
  });
});

describe("Making your own Abilities: the rulebook's checks", () => {
  it('passes an Ability built to the guidance, and all forty in the rulebook', () => {
    expect(checkAbility(tide)).toEqual([]);
    for (const ability of data.affinities.flatMap((a) => a.abilities))
      expect(checkAbility(ability), ability.name).toEqual([]);
  });

  it('needs a name and a description', () => {
    expect(checkAbility({ name: '', text: 'Zap.' })).toEqual([
      'Give the Ability a name.',
      'Say what the Ability does, in a sentence or two.',
    ]);
  });

  it('holds single-target harm to d8 and area harm to d6', () => {
    expect(
      checkAbility({ name: 'Smite', text: 'Strike one target that is Near for d12 damage.' })[0],
    ).toMatch(/d6 or d8/);
    expect(
      checkAbility({
        name: 'Quake',
        text: 'Everyone Close takes d8 damage. This is a Blast attack.',
      })[0],
    ).toMatch(/area should do d6/);
  });

  it('asks for a limit', () => {
    expect(
      checkAbility({ name: 'Doom', text: 'The target always falls asleep for an hour.' })[0],
    ).toMatch(/needs a limit/);
  });
});

describe("Making your own gear: the rulebook's checks", () => {
  const sword = {
    id: 'g',
    name: 'Sabre',
    kind: 'weapon' as const,
    slots: 1 as const,
    damage: 8 as const,
  };

  it('passes ordinary weapons, armor, tools and special items', () => {
    expect(checkGear(sword)).toEqual([]);
    expect(checkGear({ ...sword, name: 'Great axe', slots: 2, damage: 10 })).toEqual([]);
    expect(checkGear({ ...sword, name: 'Short bow', slots: 2, damage: 6, ranged: true })).toEqual(
      [],
    );
    expect(checkGear({ id: 'a', name: 'Mail', kind: 'armor', slots: 2, armor: 2 })).toEqual([]);
    expect(checkGear({ id: 't', name: 'Rope', kind: 'tool', slots: 1 })).toEqual([]);
    expect(
      checkGear({
        id: 's',
        name: 'Storm lantern',
        kind: 'special',
        slots: 1,
        charges: 2,
        text: 'Thunder. Recharge in a storm.',
      }),
    ).toEqual([]);
  });

  it("sets a weapon's die by how it is carried", () => {
    expect(checkGear({ ...sword, damage: 10 })).toEqual([
      'A weapon that does d10 needs both hands, so it should be bulky.',
    ]);
    expect(checkGear({ ...sword, damage: 12 })).toEqual([
      'No weapon a person can carry does more than d10.',
    ]);
    expect(checkGear({ ...sword, damage: undefined })).toEqual(['A weapon needs a damage die.']);
  });

  it('makes ranged weapons one size smaller', () => {
    expect(checkGear({ ...sword, ranged: true, damage: 8 })[0]).toMatch(/should do d6 at most/);
    expect(checkGear({ ...sword, ranged: true, slots: 2, damage: 10 })[0]).toMatch(
      /should do d8 at most/,
    );
    expect(checkGear({ ...sword, ranged: true, slots: 2, damage: 8 })).toEqual([]);
  });

  it('caps armor at 3 and makes heavier armor bulky', () => {
    expect(checkGear({ id: 'a', name: 'Plate', kind: 'armor', slots: 2, armor: 4 })).toEqual([
      'Nothing gives more than 3 Armor.',
    ]);
    expect(checkGear({ id: 'a', name: 'Mail', kind: 'armor', slots: 1, armor: 2 })).toEqual([
      'Armor worth 2 or 3 should be bulky.',
    ]);
    expect(checkGear({ id: 'a', name: 'Coat', kind: 'armor', slots: 1 })).toEqual([
      'Armor needs an Armor value.',
    ]);
  });

  it('gives special items one to three charges and a description', () => {
    expect(checkGear({ id: 's', name: 'Orb', kind: 'special', slots: 1, charges: 5 })).toEqual([
      'A special item has one to three charges.',
      'Say what the special item does, and how it is recharged.',
    ]);
    expect(checkGear({ id: 's', name: '', kind: 'tool', slots: 1 })).toEqual([
      'Give the item a name.',
    ]);
  });
});

describe("Making your own creatures: the rulebook's checks", () => {
  const jacker = {
    name: 'Signal-Jacker',
    hp: 5,
    armor: 1,
    str: 9,
    dex: 13,
    wil: 12,
    attack: 'shock baton (d6)',
    damage: [6 as const],
    notes: ['A scavenger in a coat of antennae.'],
  };

  it('passes a creature built to the guidance', () => {
    expect(checkCreature(jacker)).toEqual([]);
  });

  it('warns that a d10 attack or a Blast needs plenty of warning', () => {
    expect(checkCreature({ ...jacker, damage: [10] })[0]).toMatch(/plenty of warning/);
    expect(checkCreature({ ...jacker, blast: true })[0]).toMatch(/plenty of warning/);
  });

  it('keeps the numbers possible', () => {
    expect(
      checkCreature({
        ...jacker,
        name: '',
        hp: 0,
        armor: 4,
        str: 19,
        dex: 0,
        wil: 10,
        damage: [],
        notes: [],
      }),
    ).toEqual([
      'Give the creature a name.',
      'A creature needs at least 1 HP.',
      'Armor is never more than 3.',
      'Strength should be between 1 and 18. 10 is average.',
      'Dexterity should be between 1 and 18. 10 is average.',
      'Choose its attack die as you would for a weapon.',
      'Add one memorable thing, and how the players will see it coming.',
    ]);
  });
});

describe('Creatures in a fight', () => {
  const bandit = { hp: 4, armor: 1, str: 10 };

  it('take damage as characters do: Armor, then HP, then Strength', () => {
    expect(hitCreature(bandit, 3)).toMatchObject({
      state: { hp: 2, str: 10 },
      taken: 2,
      strengthSaveRequired: false,
      dead: false,
    });
    expect(hitCreature(bandit, 7)).toMatchObject({
      state: { hp: 0, str: 8 },
      taken: 6,
      strengthSaveRequired: true,
      reachedZeroHp: true,
    });
  });

  it('the rulebook example: 5 damage to a goblin with 4 HP and Strength 8 leaves Strength 7 and a save', () => {
    expect(hitCreature({ hp: 4, armor: 0, str: 8 }, 5)).toMatchObject({
      state: { hp: 0, str: 7 },
      strengthSaveRequired: true,
    });
  });

  it('die at Strength 0, with no save', () => {
    expect(hitCreature(bandit, 40)).toMatchObject({
      state: { hp: 0, str: 0 },
      dead: true,
      strengthSaveRequired: false,
    });
  });

  it("reaching 0 HP is reported once, for a lone enemy's morale", () => {
    expect(hitCreature(bandit, 5).reachedZeroHp).toBe(true);
    expect(hitCreature({ ...bandit, hp: 0 }, 3).reachedZeroHp).toBe(false);
    expect(
      moraleCheckDue({ total: 1, down: 0, loneAtZeroHp: hitCreature(bandit, 5).reachedZeroHp }),
    ).toBe(true);
  });

  it('Armor never counts for more than 3, and can be ignored', () => {
    expect(hitCreature({ hp: 5, armor: 9, str: 10 }, 4).taken).toBe(1);
    expect(hitCreature(bandit, 2, { ignoreArmor: true }).taken).toBe(2);
    expect(() => hitCreature(bandit, -1)).toThrow(RulesError);
  });
});

describe('Companions', () => {
  it('are made from 3d6 for each attribute and 1d6 for HP', () => {
    expect(makeCompanion({ str: 9, dex: 12, wil: 7, hp: 4 })).toEqual({
      hp: 4,
      armor: 0,
      str: 9,
      dex: 12,
      wil: 7,
    });
    expect(() => makeCompanion({ str: 2, dex: 12, wil: 7, hp: 4 })).toThrow(/3 to 18/);
    expect(() => makeCompanion({ str: 9, dex: 12, wil: 7, hp: 7 })).toThrow(RulesError);
  });
});

describe("A world's own content alongside the rulebook's", () => {
  it("adds its Origins after the rulebook's seven", () => {
    expect(allOrigins()).toHaveLength(7);
    expect(
      allOrigins(extra)
        .map((o) => o.id)
        .at(-1),
    ).toBe('riverfolk');
  });

  it('adds its Affinities, and its Abilities to old and new Affinities alike', () => {
    expect(allAffinities()).toHaveLength(10);
    const all = allAffinities(extra);
    expect(all).toHaveLength(11);
    expect(all.find((a) => a.id === 'tides')!.abilities.map((a) => a.id)).toEqual(['tide-call']);
    expect(all.find((a) => a.id === 'mending')!.abilities.map((a) => a.id)).toContain('stitch');
    expect(abilityIndexWith(extra)).toMatchObject({
      'tide-call': 'tides',
      stitch: 'mending',
      bolt: 'energy',
    });
  });

  it("applies a custom Origin's bonus, and none when there is no Origin", () => {
    expect(applyAnyOriginBonus({ str: 10, dex: 12, wil: 11 }, 'riverfolk', extra).dex).toBe(13);
    expect(applyAnyOriginBonus({ str: 10, dex: 12, wil: 11 }, 'climber').dex).toBe(13);
    expect(applyAnyOriginBonus({ str: 10, dex: 12, wil: 11 }, null, extra)).toEqual({
      str: 10,
      dex: 12,
      wil: 11,
    });
  });

  it('a character can be made with a custom Origin, Affinity and Abilities, and carries their text', () => {
    const orla = createCharacter(
      {
        ...base,
        originId: 'riverfolk',
        primaryAffinity: 'tides',
        abilities: ['tide-call'],
        items: kitItems(riverfolk),
      },
      extra,
    );
    expect(orla.attributes.dex.full).toBe(13);
    expect(orla.items.map((i) => i.name)).toContain('Fishing spear');
    expect(orla.homebrew).toEqual({
      origin: { name: 'Riverfolk', trait: riverfolk.trait, drawback: null },
      affinities: { tides: 'Tides' },
      abilities: { 'tide-call': { name: 'Tide Call', text: tide.text } },
    });
  });

  it('a custom Ability in a rulebook Affinity works too, and records only what is custom', () => {
    const healer = createCharacter(
      { ...base, primaryAffinity: 'mending', abilities: ['mend', 'stitch'] },
      extra,
    );
    expect(healer.homebrew).toEqual({
      abilities: { stitch: { name: 'Stitch', text: 'Close a wound so it stops bleeding.' } },
    });
  });

  it('a character made only from the rulebook carries nothing extra', () => {
    expect(createCharacter({ ...base, originId: 'climber' }, extra).homebrew).toBeUndefined();
  });

  it('custom content from another world is refused', () => {
    expect(() => createCharacter({ ...base, originId: 'riverfolk' })).toThrow(
      /Origin does not exist/,
    );
    expect(() => createCharacter({ ...base, primaryAffinity: 'tides' })).toThrow(
      /Affinity does not exist/,
    );
    expect(() =>
      createCharacter({ ...base, primaryAffinity: 'mending', abilities: ['tide-call'] }, extra),
    ).toThrow(/Primary Affinity/);
  });
});
