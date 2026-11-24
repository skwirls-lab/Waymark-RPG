import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addFatigue,
  applyDamage,
  applyOriginBonus,
  armorValue,
  checkSave,
  data,
  isFull,
  nightRest,
  shortRest,
  slotsUsed,
  type Character,
  type Item,
} from '../src/index.ts';
import { wren } from './helpers.ts';

const anItem: fc.Arbitrary<Item> = fc.record({
  id: fc.uuid(),
  name: fc.constant('thing'),
  kind: fc.constantFrom('weapon', 'armor', 'tool', 'special'),
  slots: fc.constantFrom(0, 1, 2),
  place: fc.constantFrom('hand', 'body', 'pack'),
  armor: fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }),
  stacks: fc.boolean(),
});

/** Any character the rules could produce: carried load never exceeds capacity. */
const aCharacter: fc.Arbitrary<Character> = fc
  .record({
    items: fc.array(anItem, { maxLength: 6 }),
    fatigue: fc.integer({ min: 0, max: 10 }),
    tainted: fc.integer({ min: 0, max: 10 }),
    hpFull: fc.integer({ min: 1, max: 18 }),
    hpLost: fc.integer({ min: 0, max: 18 }),
    str: fc.integer({ min: 1, max: 18 }),
  })
  .map(({ items, fatigue, tainted, hpFull, hpLost, str }) => {
    // Every carried item has its own id.
    const unique = items.map((item, index) => ({ ...item, id: `${index}-${item.id}` }));
    const c = { ...wren(), items: unique, fatigue: 0, taintedFatigue: 0 };
    const room = Math.max(0, c.slotCapacity - slotsUsed(c));
    c.fatigue = Math.min(fatigue, room);
    c.taintedFatigue = Math.min(tainted, room - c.fatigue);
    c.hp = { full: hpFull, current: isFull(c) ? 0 : Math.max(0, hpFull - hpLost) };
    c.attributes.str = { current: str, full: 18 };
    return c;
  });

describe('Things that are always true', () => {
  it('Armor is never more than 3, whatever is worn', () => {
    fc.assert(fc.property(aCharacter, (c) => armorValue(c) >= 0 && armorValue(c) <= 3));
  });

  it('damage never takes HP or Strength below 0, and never raises either', () => {
    fc.assert(
      fc.property(aCharacter, fc.integer({ min: 0, max: 40 }), (c, amount) => {
        const after = applyDamage(c, amount).character;
        return (
          after.hp.current >= 0 &&
          after.hp.current <= c.hp.current &&
          after.attributes.str.current >= 0 &&
          after.attributes.str.current <= c.attributes.str.current
        );
      }),
    );
  });

  it('damage is fully accounted for: Armor, then HP, then Strength', () => {
    fc.assert(
      fc.property(aCharacter, fc.integer({ min: 0, max: 40 }), (c, amount) => {
        const r = applyDamage(c, amount);
        return (
          r.taken === Math.max(0, amount - armorValue(c)) && r.hpLost + r.strengthLost <= r.taken
        );
      }),
    );
  });

  it('a Scar is called for only when HP lands on exactly 0 from above', () => {
    fc.assert(
      fc.property(aCharacter, fc.integer({ min: 0, max: 40 }), (c, amount) => {
        const r = applyDamage(c, amount);
        return (
          !r.scarRequired || (r.character.hp.current === 0 && r.strengthLost === 0 && r.hpLost > 0)
        );
      }),
    );
  });

  it('slots used never exceed capacity, however much Fatigue is gained', () => {
    fc.assert(
      fc.property(aCharacter, fc.integer({ min: 1, max: 25 }), (start, times) => {
        let c = start;
        for (let i = 0; i < times; i++) {
          const droppable = c.items.find((item) => item.slots > 0);
          c = addFatigue(c, { dropItemId: droppable?.id }).character;
          if (slotsUsed(c) > c.slotCapacity) return false;
        }
        return true;
      }),
    );
  });

  it('a character with every slot full is at 0 HP after any rest', () => {
    fc.assert(
      fc.property(aCharacter, (c) => {
        if (!isFull(c)) return true;
        return shortRest(c).hp.current === 0 && nightRest(c, { safe: false }).hp.current === 0;
      }),
    );
  });

  it('rest never raises HP above its full value', () => {
    fc.assert(fc.property(aCharacter, (c) => shortRest(c).hp.current <= c.hp.full));
  });

  it('an Origin bonus never takes an attribute above 18', () => {
    const attribute = fc.integer({ min: 3, max: 18 });
    fc.assert(
      fc.property(
        attribute,
        attribute,
        attribute,
        fc.constantFrom(...data.origins),
        (str, dex, wil, origin) => {
          const after = applyOriginBonus({ str, dex, wil }, origin);
          return Math.max(after.str, after.dex, after.wil) <= 18;
        },
      ),
    );
  });

  it('a 1 always passes a save and a 20 always fails, for any score', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5, max: 30 }),
        (score) => checkSave(score, 1) && !checkSave(score, 20),
      ),
    );
  });

  it('a higher score never makes a save harder', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 19 }),
        fc.integer({ min: 1, max: 20 }),
        (score, d20) => {
          return !checkSave(score, d20) || checkSave(score + 1, d20);
        },
      ),
    );
  });

  it('the checks above ran against real variety', () => {
    const samples = fc.sample(aCharacter, 200);
    expect(samples.some(isFull)).toBe(true);
    expect(samples.some((c) => !isFull(c))).toBe(true);
  });
});
