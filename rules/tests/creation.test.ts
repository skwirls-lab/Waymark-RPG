import { describe, expect, it } from 'vitest';
import {
  RulesError,
  applyOriginBonus,
  armorValue,
  arrangeItems,
  createCharacter,
  data,
  kitItems,
  rollAge,
  rollAttributes,
  rollCoins,
  rollHp,
  rollStartingKit,
  sequenceRng,
  slotsUsed,
  swapAttributes,
} from '../src/index.ts';
import { item } from './helpers.ts';

const origin = (id: string) => data.origins.find((o) => o.id === id)!;
const base = {
  name: 'Test',
  background: 'Hunter',
  attributes: { str: 10, dex: 10, wil: 10 },
  hp: 3,
  coins: 9,
};

describe('Making a character, step 1: attributes', () => {
  it('rolls 3d6 for Strength, then Dexterity, then Willpower', () => {
    // The rulebook example: 9, 13 and 11.
    expect(rollAttributes(sequenceRng([3, 3, 3, 4, 4, 5, 3, 4, 4]))).toEqual({
      str: 9,
      dex: 13,
      wil: 11,
    });
  });

  it('lets any two results be swapped', () => {
    expect(swapAttributes({ str: 9, dex: 13, wil: 16 }, 'wil', 'str')).toEqual({
      str: 16,
      dex: 13,
      wil: 9,
    });
  });
});

describe('Making a character, steps 2, 3 and 6: HP, age and coins', () => {
  it('Hit Protection is 1d6', () => expect(rollHp(sequenceRng([4]))).toBe(4));
  it('age is 2d20+10', () => expect(rollAge(sequenceRng([7, 14]))).toBe(31));
  it('coins are 3d6', () => expect(rollCoins(sequenceRng([2, 4, 4]))).toBe(10));
});

describe('Making a character, step 4: Origin', () => {
  it("adds 1 to the Origin's attribute", () => {
    expect(applyOriginBonus({ str: 9, dex: 13, wil: 11 }, origin('climber'))).toEqual({
      str: 9,
      dex: 14,
      wil: 11,
    });
  });

  it('never raises an attribute above 18', () => {
    expect(applyOriginBonus({ str: 18, dex: 10, wil: 10 }, origin('stoneblood')).str).toBe(18);
  });

  it('gives a Packbearer 12 inventory slots', () => {
    expect(createCharacter({ ...base, originId: 'packbearer' }).slotCapacity).toBe(12);
  });

  it('gives everyone else 10', () => {
    expect(createCharacter({ ...base, originId: 'climber' }).slotCapacity).toBe(10);
    expect(createCharacter(base).slotCapacity).toBe(10);
  });

  it('marks the Built as not healed by rest', () => {
    expect(createCharacter({ ...base, originId: 'built' }).healsByRest).toBe(false);
    expect(createCharacter({ ...base, originId: 'climber' }).healsByRest).toBe(true);
  });

  it("supplies the Origin's starting kit, with two knives for a Climber", () => {
    const kit = kitItems(origin('climber'));
    expect(kit.map((i) => i.name)).toEqual(['Knife', 'Knife', 'Rope', 'Climbing hooks']);
    expect(kit[0]).toMatchObject({ kind: 'weapon', damage: 6, slots: 1 });
  });

  it("makes a Packbearer's great hammer bulky", () => {
    expect(kitItems(origin('packbearer'))[0]).toMatchObject({
      name: 'Great hammer',
      damage: 10,
      slots: 2,
    });
  });

  it('refuses an Origin that does not exist', () => {
    expect(() => createCharacter({ ...base, originId: 'dragon' })).toThrow(RulesError);
  });
});

describe('Making a character, step 5: Affinity and Abilities', () => {
  it('starts with two Abilities from the Primary Affinity', () => {
    const c = createCharacter({
      ...base,
      primaryAffinity: 'mending',
      abilities: ['mend', 'cleanse'],
    });
    expect(c.abilities).toEqual(['mend', 'cleanse']);
    expect(c.tier).toBe(1);
  });

  it('allows a latent gift: an Affinity with no Abilities yet', () => {
    const c = createCharacter({ ...base, primaryAffinity: 'energy' });
    expect(c.primaryAffinity).toBe('energy');
    expect(c.abilities).toEqual([]);
  });

  it('allows a character with no Abilities at all', () => {
    expect(createCharacter(base).primaryAffinity).toBeNull();
  });

  it('refuses more than two starting Abilities', () => {
    expect(() =>
      createCharacter({
        ...base,
        primaryAffinity: 'mending',
        abilities: ['mend', 'cleanse', 'repair'],
      }),
    ).toThrow(/two Abilities/);
  });

  it('refuses the same Ability twice', () => {
    expect(() =>
      createCharacter({ ...base, primaryAffinity: 'mending', abilities: ['mend', 'mend'] }),
    ).toThrow(/different/);
  });

  it('refuses Abilities from outside the Primary Affinity, or with no Affinity', () => {
    expect(() =>
      createCharacter({ ...base, primaryAffinity: 'mending', abilities: ['bolt'] }),
    ).toThrow(/Primary/);
    expect(() => createCharacter({ ...base, abilities: ['mend'] })).toThrow(/Primary/);
  });

  it('refuses an Affinity that does not exist', () => {
    expect(() => createCharacter({ ...base, primaryAffinity: 'cooking' })).toThrow(/Affinity/);
  });
});

describe('Making a character, step 6: starting gear', () => {
  it('everyone starts with rations and a light source', () => {
    expect(createCharacter(base).items.map((i) => i.name)).toEqual([
      'Rations (three days)',
      'Light source',
    ]);
  });

  it('rolls a d6 each for weapon, armor and tools without an Origin', () => {
    // The rulebook example: a 3, a 4 and a 1.
    expect(rollStartingKit(sequenceRng([3, 4, 1]))).toEqual({
      weapon: 'Standard weapon (d8)',
      armor: 'Light armor (1 Armor)',
      tools: 'Rope and a grappling hook',
    });
  });

  it('puts weapons in hands and armor on the body', () => {
    const arranged = arrangeItems([
      item({ kind: 'weapon', damage: 8 }),
      item({ kind: 'armor', armor: 1 }),
      item({ kind: 'tool' }),
    ]);
    expect(arranged.map((i) => i.place)).toEqual(['hand', 'body', 'pack']);
  });

  it('keeps a third weapon and a second suit of armor in the pack', () => {
    const arranged = arrangeItems([
      item({ kind: 'weapon', damage: 6 }),
      item({ kind: 'weapon', damage: 6 }),
      item({ kind: 'weapon', damage: 6 }),
      item({ kind: 'armor', armor: 2, slots: 2 }),
      item({ kind: 'armor', armor: 1 }),
      item({ kind: 'armor', armor: 1, stacks: true, name: 'Shield' }),
    ]);
    expect(arranged.map((i) => i.place)).toEqual(['hand', 'hand', 'pack', 'body', 'pack', 'pack']);
  });

  it('the rulebook example: Wren fills 6 of her 10 slots and wears 1 Armor', () => {
    const wren = createCharacter({
      ...base,
      items: [
        item({ kind: 'weapon', damage: 8, name: 'Short sword' }),
        item({ kind: 'armor', armor: 1, name: 'Leather jacket' }),
        item({ name: 'Rope' }),
        item({ name: 'Grappling hook' }),
      ],
    });
    expect(slotsUsed(wren)).toBe(6);
    expect(armorValue(wren)).toBe(1);
  });

  it('refuses more gear than the character can carry', () => {
    const tooMuch = Array.from({ length: 9 }, () => item());
    expect(() => createCharacter({ ...base, items: tooMuch })).toThrow(/carry/);
  });

  it('a character who starts with every slot full starts at 0 HP', () => {
    const c = createCharacter({ ...base, items: Array.from({ length: 8 }, () => item()) });
    expect(c.hp).toEqual({ current: 0, full: 3 });
  });
});

describe('Making a character: the numbers must be possible', () => {
  it('refuses attributes outside 3 to 18', () => {
    expect(() => createCharacter({ ...base, attributes: { str: 2, dex: 10, wil: 10 } })).toThrow(
      /3 to 18/,
    );
    expect(() => createCharacter({ ...base, attributes: { str: 10, dex: 19, wil: 10 } })).toThrow(
      /3 to 18/,
    );
    expect(() => createCharacter({ ...base, attributes: { str: 10, dex: 10, wil: 9.5 } })).toThrow(
      /3 to 18/,
    );
  });

  it('refuses starting HP outside 1 to 6', () => {
    expect(() => createCharacter({ ...base, hp: 0 })).toThrow(/1 to 6/);
    expect(() => createCharacter({ ...base, hp: 7 })).toThrow(/1 to 6/);
  });

  it('records the rules version the character was made with', () => {
    expect(createCharacter(base).rulesVersion).toBe(data.meta.version);
  });
});
