import { describe, expect, it } from 'vitest';
import {
  RulesError,
  applyWardenAction,
  describeAction,
  slotsUsed,
  status,
  type WardenAction,
} from '../src/index.ts';
import { exhausted, item, wren } from './helpers.ts';

describe('Warden actions: damage', () => {
  it('goes through Armor and HP like any attack', () => {
    const r = applyWardenAction(wren(), { type: 'damage', amount: 3 });
    expect(r.character.hp.current).toBe(2);
    expect(r).toMatchObject({ text: 'Wren took 2 damage. HP 2.', followUps: [] });
  });

  it('reports when Armor stops it all', () => {
    expect(applyWardenAction(wren(), { type: 'damage', amount: 1 }).text).toBe(
      "Wren's Armor stopped all 1 damage.",
    );
  });

  it('exactly 0 HP owes a Scar roll', () => {
    expect(applyWardenAction(wren(), { type: 'damage', amount: 5 }).followUps).toEqual(['scar']);
  });

  it('the rulebook example: 7 damage owes a Strength save, and says so', () => {
    const r = applyWardenAction(wren(), { type: 'damage', amount: 7 });
    expect(r.followUps).toEqual(['strength-save']);
    expect(r.text).toBe('Wren took 6 damage. HP 0. Strength down 2 to 7.');
  });

  it('death owes nothing further', () => {
    const r = applyWardenAction(wren(), { type: 'damage', amount: 40 });
    expect(r.followUps).toEqual([]);
    expect(r.text).toMatch(/Wren has died\.$/);
    expect(status(r.character)).toBe('dead');
  });

  it('can ignore Armor', () => {
    expect(
      applyWardenAction(wren(), { type: 'damage', amount: 3, ignoreArmor: true }).character.hp
        .current,
    ).toBe(1);
  });
});

describe('Warden actions: healing', () => {
  const hurt = () => {
    const c = wren();
    c.hp.current = 1;
    c.attributes.str.current = 5;
    return c;
  };

  it('restores HP to full', () => {
    expect(applyWardenAction(hurt(), { type: 'heal', hp: true })).toMatchObject({
      text: 'Wren was healed: HP 4.',
    });
  });

  it('restores attribute points, never past the full score', () => {
    expect(
      applyWardenAction(hurt(), { type: 'heal', attribute: 'str', amount: 3 }).character.attributes
        .str.current,
    ).toBe(8);
    expect(
      applyWardenAction(hurt(), { type: 'heal', attribute: 'str', amount: 9 }).character.attributes
        .str.current,
    ).toBe(9);
  });

  it('can do both at once', () => {
    const r = applyWardenAction(hurt(), { type: 'heal', hp: true, attribute: 'str', amount: 2 });
    expect(r.text).toBe('Wren was healed: Strength 7, HP 4.');
  });

  it('does not lift an overloaded character off 0 HP', () => {
    const loaded = { ...wren(), fatigue: 4, hp: { current: 0, full: 4 } };
    expect(applyWardenAction(loaded, { type: 'heal', hp: true }).character.hp.current).toBe(0);
  });

  it('refuses an empty heal', () => {
    expect(() => applyWardenAction(wren(), { type: 'heal' })).toThrow(RulesError);
  });
});

describe('Warden actions: Fatigue and deprivation', () => {
  it('adds Fatigue one slot at a time', () => {
    const r = applyWardenAction(wren(), { type: 'fatigue', count: 2 });
    expect(r.character.fatigue).toBe(2);
    expect(r.text).toBe('Wren gained 2 Fatigue.');
  });

  it('says when the last slot fills', () => {
    expect(applyWardenAction(wren(), { type: 'fatigue', count: 4 }).text).toMatch(
      /Every slot is full, so HP is 0\.$/,
    );
  });

  it('needs an item to drop when there is no room, and uses the ones named', () => {
    const full = { ...wren(), fatigue: 4 };
    expect(() => applyWardenAction(full, { type: 'fatigue', count: 1 })).toThrow(
      /Choose an item to drop/,
    );
    const r = applyWardenAction(
      full,
      { type: 'fatigue', count: 2 },
      { dropItemIds: ['rope', 'hook'] },
    );
    expect(r.character.items.map((i) => i.id)).not.toContain('rope');
    expect(r.text).toMatch(/Dropped 2 items to make room/);
    expect(slotsUsed(r.character)).toBe(10);
  });

  it('costs Strength once every slot is Fatigue', () => {
    const r = applyWardenAction(exhausted(), { type: 'fatigue', count: 2 });
    expect(r.character.attributes.str.current).toBe(7);
    expect(r.text).toMatch(/lost 2 Strength/);
  });

  it('can be tainted', () => {
    expect(
      applyWardenAction(wren(), { type: 'fatigue', count: 1, tainted: true }).character
        .taintedFatigue,
    ).toBe(1);
  });

  it('refuses a count that is not 1 to 10', () => {
    for (const count of [0, 11, 1.5])
      expect(() => applyWardenAction(wren(), { type: 'fatigue', count })).toThrow(RulesError);
  });

  it('marks and clears deprivation', () => {
    const deprived = applyWardenAction(wren(), { type: 'deprived', value: true });
    expect(deprived).toMatchObject({ text: 'Wren is deprived.' });
    expect(deprived.character.deprived).toBe(true);
    expect(applyWardenAction(deprived.character, { type: 'deprived', value: false }).text).toBe(
      'Wren is no longer deprived.',
    );
  });
});

describe('Warden actions: items and Tiers', () => {
  const lantern = () =>
    item({ id: 'lantern', name: 'Storm lantern', kind: 'special', place: 'hand' });

  it('gives an item, into the pack', () => {
    const r = applyWardenAction(wren(), { type: 'give-item', item: lantern() });
    expect(r.character.items.at(-1)).toMatchObject({ name: 'Storm lantern', place: 'pack' });
    expect(r.text).toBe('Wren received Storm lantern.');
  });

  it('says when the gift fills the last slot, and refuses one that does not fit', () => {
    expect(
      applyWardenAction({ ...wren(), fatigue: 3 }, { type: 'give-item', item: lantern() }).text,
    ).toMatch(/HP is 0/);
    expect(() =>
      applyWardenAction({ ...wren(), fatigue: 4 }, { type: 'give-item', item: lantern() }),
    ).toThrow(/no room/);
  });

  it('takes an item', () => {
    const r = applyWardenAction(wren(), { type: 'take-item', itemId: 'rope' });
    expect(r.character.items.some((i) => i.id === 'rope')).toBe(false);
    expect(r.text).toBe('Wren handed over Rope.');
    expect(() => applyWardenAction(wren(), { type: 'take-item', itemId: 'crown' })).toThrow(
      RulesError,
    );
  });

  it('awards a Tier, up to 5', () => {
    expect(applyWardenAction(wren(), { type: 'tier' })).toMatchObject({
      text: 'Wren rose to Tier 2.',
    });
    expect(() => applyWardenAction({ ...wren(), tier: 5 }, { type: 'tier' })).toThrow(/highest/);
  });
});

describe('Warden actions: describing a request before it is applied', () => {
  it('puts each kind in plain words', () => {
    const cases: [WardenAction, string][] = [
      [{ type: 'damage', amount: 5 }, 'Take 5 damage'],
      [{ type: 'damage', amount: 5, ignoreArmor: true }, 'Take 5 damage, ignoring Armor'],
      [{ type: 'heal', hp: true }, 'HP back to full'],
      [
        { type: 'heal', hp: true, attribute: 'str', amount: 3 },
        'HP back to full and 3 Strength restored',
      ],
      [{ type: 'heal' }, 'Heal'],
      [{ type: 'fatigue', count: 2 }, 'Gain 2 Fatigue'],
      [{ type: 'fatigue', count: 1, tainted: true }, 'Gain 1 Fatigue (tainted)'],
      [{ type: 'deprived', value: true }, 'Become deprived'],
      [{ type: 'deprived', value: false }, 'No longer deprived'],
      [{ type: 'give-item', item: item({ name: 'Rope' }) }, 'Receive Rope'],
      [{ type: 'take-item', itemId: 'x' }, 'Hand over an item'],
      [{ type: 'tier' }, 'Rise one Tier'],
    ];
    for (const [action, text] of cases) expect(describeAction(action)).toBe(text);
  });
});
