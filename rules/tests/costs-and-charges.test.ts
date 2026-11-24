import { describe, expect, it } from 'vitest';
import { nightRest, rechargeItem, shortRest, spendCharge, useAbility } from '../src/index.ts';
import { item, tobin, wren } from './helpers.ts';

describe('A different cost: charges', () => {
  const charged = () => tobin({ abilityCharges: { current: 3, full: 3 } });

  it('each use spends one charge and causes no Fatigue', () => {
    const result = useAbility(charged(), {
      abilityId: 'mend',
      inDanger: false,
      cost: { kind: 'charges' },
    });
    expect(result.character.abilityCharges).toEqual({ current: 2, full: 3 });
    expect(result.character.fatigue).toBe(0);
    expect(result.fatigue).toEqual([]);
  });

  it('a Drained misfire spends a second charge if there is one', () => {
    const use = (c = charged()) =>
      useAbility(c, {
        abilityId: 'mend',
        inDanger: true,
        saveRolls: [19],
        misfireRoll: 2,
        cost: { kind: 'charges' },
      });
    expect(use().character.abilityCharges!.current).toBe(1);
    expect(
      use(tobin({ abilityCharges: { current: 1, full: 3 } })).character.abilityCharges!.current,
    ).toBe(0);
  });

  it('with no charges left, the Ability cannot be used', () => {
    const empty = tobin({ abilityCharges: { current: 0, full: 3 } });
    expect(() =>
      useAbility(empty, { abilityId: 'mend', inDanger: false, cost: { kind: 'charges' } }),
    ).toThrow(/no charges/);
    expect(() =>
      useAbility(tobin(), { abilityId: 'mend', inDanger: false, cost: { kind: 'charges' } }),
    ).toThrow(/no charges/);
  });

  it("charges return after a safe night's rest", () => {
    const spent = tobin({ abilityCharges: { current: 0, full: 3 } });
    expect(nightRest(spent, { safe: true }).abilityCharges!.current).toBe(3);
    expect(nightRest(spent, { safe: false }).abilityCharges!.current).toBe(0);
  });
});

describe('A different cost: recovery time', () => {
  const use = (c = tobin(), abilityId = 'mend') =>
    useAbility(c, { abilityId, inDanger: false, cost: { kind: 'recovery' } });

  it('the same Ability cannot be used again until after a short rest', () => {
    const once = use().character;
    expect(once.recovering).toEqual(['mend']);
    expect(once.fatigue).toBe(0);
    expect(() => use(once)).toThrow(/short rest/);
    expect(use(shortRest(once)).worked).toBe(true);
  });

  it('a different Ability is still available', () => {
    expect(use(use().character, 'cleanse').character.recovering).toEqual(['mend', 'cleanse']);
  });
});

describe('A different cost: supplies', () => {
  it('each use burns up an item from the pack', () => {
    const stocked = tobin();
    stocked.items.push(item({ id: 'cell', name: 'Power cell' }));
    const result = useAbility(stocked, {
      abilityId: 'mend',
      inDanger: false,
      cost: { kind: 'supplies', itemId: 'cell' },
    });
    expect(result.character.items.some((i) => i.id === 'cell')).toBe(false);
    expect(result.character.fatigue).toBe(0);
  });

  it('without the supply, the Ability cannot be used', () => {
    expect(() =>
      useAbility(tobin(), {
        abilityId: 'mend',
        inDanger: false,
        cost: { kind: 'supplies', itemId: 'cell' },
      }),
    ).toThrow(/not being carried/);
  });
});

describe('The default cost is Fatigue', () => {
  it('naming it explicitly changes nothing', () => {
    const result = useAbility(tobin(), {
      abilityId: 'mend',
      inDanger: false,
      cost: { kind: 'fatigue' },
    });
    expect(result.character.fatigue).toBe(1);
  });
});

describe('Special items', () => {
  const carrying = () => {
    const c = wren();
    c.items.push(
      item({
        id: 'lantern',
        name: 'Storm lantern',
        kind: 'special',
        charges: { current: 2, full: 2 },
      }),
    );
    return c;
  };

  it('using one spends a charge and causes no Fatigue', () => {
    const used = spendCharge(carrying(), 'lantern');
    expect(used.items.find((i) => i.id === 'lantern')!.charges).toEqual({ current: 1, full: 2 });
    expect(used.fatigue).toBe(0);
  });

  it('with no charges left it cannot be used until recharged', () => {
    const empty = spendCharge(spendCharge(carrying(), 'lantern'), 'lantern');
    expect(() => spendCharge(empty, 'lantern')).toThrow(/no charges/);
    expect(
      rechargeItem(empty, 'lantern').items.find((i) => i.id === 'lantern')!.charges!.current,
    ).toBe(2);
  });

  it('only special items have charges', () => {
    expect(() => spendCharge(carrying(), 'sword')).toThrow(/special item/);
    expect(() => rechargeItem(carrying(), 'sword')).toThrow(/special item/);
    expect(() => spendCharge(carrying(), 'crown')).toThrow(/special item/);
  });
});
