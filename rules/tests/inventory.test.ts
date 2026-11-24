import { describe, expect, it } from 'vitest';
import {
  RulesError,
  addFatigue,
  addItem,
  armorValue,
  freeSlots,
  isFull,
  removeItem,
  slotsUsed,
  status,
} from '../src/index.ts';
import { exhausted, item, wren } from './helpers.ts';

describe('Carrying things: slots', () => {
  it('most items take 1 slot, bulky items 2, small items none', () => {
    let c = wren();
    expect(slotsUsed(c)).toBe(6);
    c = addItem(c, item({ slots: 2, name: 'Longbow' }));
    expect(slotsUsed(c)).toBe(8);
    c = addItem(c, item({ slots: 0, name: 'Ring' }));
    expect(slotsUsed(c)).toBe(8);
  });

  it('you cannot carry more than your slots allow', () => {
    const c = { ...wren(), fatigue: 3 }; // 9 of 10 used
    expect(() => addItem(c, item({ slots: 2 }))).toThrow(RulesError);
  });

  it('when every slot is full, HP drops to 0', () => {
    let c = { ...wren(), fatigue: 3 };
    expect(c.hp.current).toBe(4);
    c = addItem(c, item());
    expect(isFull(c)).toBe(true);
    expect(c.hp.current).toBe(0);
  });

  it('putting something down frees the slot', () => {
    const c = removeItem(wren(), 'rope');
    expect(freeSlots(c)).toBe(5);
  });

  it('refuses to remove something that is not carried', () => {
    expect(() => removeItem(wren(), 'crown')).toThrow(/not being carried/);
  });
});

describe('Carrying things: Fatigue', () => {
  it('each Fatigue fills one slot', () => {
    const { character, outcome } = addFatigue(wren());
    expect(outcome).toBe('slot');
    expect(character.fatigue).toBe(1);
    expect(slotsUsed(character)).toBe(7);
  });

  it('the rulebook example: Wren can gain four Fatigue before she is in trouble', () => {
    let c = wren();
    for (let i = 0; i < 3; i++) c = addFatigue(c).character;
    expect(c.hp.current).toBe(4);
    c = addFatigue(c).character;
    expect(isFull(c)).toBe(true);
    expect(c.hp.current).toBe(0);
  });

  it('with no empty slot, an item must be dropped to make room', () => {
    const full = { ...wren(), fatigue: 4 };
    expect(() => addFatigue(full)).toThrow(/Choose an item to drop/);
    const { character, outcome } = addFatigue(full, { dropItemId: 'rope' });
    expect(outcome).toBe('dropped');
    expect(character.items.some((i) => i.id === 'rope')).toBe(false);
    expect(character.fatigue).toBe(5);
  });

  it('dropping a bulky item for one Fatigue leaves a slot free', () => {
    const c = { ...wren(), items: [item({ id: 'bow', slots: 2 })], fatigue: 8 };
    const { character } = addFatigue(c, { dropItemId: 'bow' });
    expect(freeSlots(character)).toBe(1);
  });

  it('refuses to drop something that is not carried, or that takes no slot', () => {
    const full = {
      ...wren(),
      fatigue: 4,
      items: [...wren().items, item({ id: 'ring', slots: 0 })],
    };
    expect(() => addFatigue(full, { dropItemId: 'crown' })).toThrow(/cannot be dropped/);
    expect(() => addFatigue(full, { dropItemId: 'ring' })).toThrow(/cannot be dropped/);
  });

  it('when every slot is already Fatigue, each further Fatigue costs 1 Strength', () => {
    const { character, outcome } = addFatigue(exhausted());
    expect(outcome).toBe('strength');
    expect(character.fatigue).toBe(10);
    expect(character.attributes.str.current).toBe(8);
  });

  it('Strength lost this way can kill', () => {
    const dying = exhausted();
    dying.attributes.str.current = 1;
    expect(status(addFatigue(dying).character)).toBe('dead');
    dying.attributes.str.current = 0;
    expect(addFatigue(dying).character.attributes.str.current).toBe(0);
  });

  it('tainted Fatigue is counted separately but fills slots all the same', () => {
    const { character } = addFatigue(wren(), { tainted: true });
    expect(character.taintedFatigue).toBe(1);
    expect(character.fatigue).toBe(0);
    expect(slotsUsed(character)).toBe(7);
  });
});

describe('Gear: armor', () => {
  it('subtracts worn armor, adding a shield and helmet to a suit', () => {
    const c = wren();
    c.items.push(item({ kind: 'armor', armor: 1, stacks: true, place: 'hand', name: 'Shield' }));
    expect(armorValue(c)).toBe(2);
  });

  it('total Armor can never be higher than 3', () => {
    const c = wren();
    c.items = [
      item({ kind: 'armor', armor: 3, slots: 2, place: 'body', name: 'Plate' }),
      item({ kind: 'armor', armor: 1, stacks: true, place: 'hand', name: 'Shield' }),
      item({ kind: 'armor', armor: 1, stacks: true, place: 'body', name: 'Helmet' }),
    ];
    expect(armorValue(c)).toBe(3);
  });

  it('only one suit counts', () => {
    const c = wren();
    c.items = [
      item({ kind: 'armor', armor: 1, place: 'body' }),
      item({ kind: 'armor', armor: 2, slots: 2, place: 'body' }),
    ];
    expect(armorValue(c)).toBe(2);
  });

  it('armor in the pack protects nothing', () => {
    const c = wren();
    c.items = [item({ kind: 'armor', armor: 2, slots: 2, place: 'pack' })];
    expect(armorValue(c)).toBe(0);
  });
});
