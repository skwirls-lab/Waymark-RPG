import { describe, expect, it } from 'vitest';
import { MISFIRES, TIER_LIMITS, abilityIndex, data, reactionFor, schemas } from '../src/index.ts';

describe('The data files', () => {
  it('have ten Affinities with four Abilities each, forty in all', () => {
    expect(data.affinities).toHaveLength(10);
    expect(Object.keys(abilityIndex)).toHaveLength(40);
  });

  it('give every Affinity and Ability a unique id', () => {
    expect(new Set(data.affinities.map((a) => a.id)).size).toBe(10);
    const ids = data.affinities.flatMap((a) => a.abilities.map((b) => b.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('index every Ability under a real Affinity', () => {
    const affinities = new Set(data.affinities.map((a) => a.id));
    for (const affinity of Object.values(abilityIndex)) expect(affinities.has(affinity)).toBe(true);
  });

  it('have seven Origins, each with one +1 bonus and a kit', () => {
    expect(data.origins).toHaveLength(7);
    for (const origin of data.origins) {
      expect(origin.bonus.amount).toBe(1);
      expect(origin.kit.length).toBeGreaterThanOrEqual(3);
      expect(origin.kit.filter((k) => k.kind === 'weapon')).toHaveLength(1);
    }
  });

  it('only the Packbearer changes inventory size, and it has a drawback to balance it', () => {
    const changed = data.origins.filter((o) => o.slots !== 10);
    expect(changed.map((o) => o.id)).toEqual(['packbearer']);
    expect(changed[0]!.drawback).toBeTruthy();
  });

  it('keep weapon damage on the d4 to d10 ladder', () => {
    for (const weapon of data.weapons) expect([4, 6, 8, 10]).toContain(weapon.damage);
  });

  it('keep every piece of armor at 3 or less, with only shield and helmet stacking', () => {
    for (const armor of data.armor) expect(armor.armor).toBeLessThanOrEqual(3);
    expect(data.armor.filter((a) => a.stacks).map((a) => a.id)).toEqual(['shield', 'helmet']);
  });

  it('have a starting kit row for each face of a d6', () => {
    expect(data.startingKit.map((r) => r.roll)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('number the Scars 1 to 12 and the misfires 1 to 6', () => {
    expect(data.scars.map((s) => s.roll)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(data.misfires.map((m) => m.roll)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('agree with the library on misfires, Tier limits and reactions', () => {
    expect(data.misfires.map((m) => m.id)).toEqual([...MISFIRES]);
    expect(data.tiers.map((t) => t.maxAbilities ?? Infinity)).toEqual([...TIER_LIMITS]);
    for (const row of data.reactions) {
      for (let total = row.min; total <= row.max; total++) expect(reactionFor(total)).toBe(row.id);
    }
    expect(data.reactions.flatMap((r) => [r.min, r.max])).toEqual([
      2, 2, 3, 5, 6, 8, 9, 11, 12, 12,
    ]);
  });

  it('have ten creatures with sensible numbers', () => {
    expect(data.creatures).toHaveLength(10);
    for (const creature of data.creatures) {
      expect(creature.armor).toBeLessThanOrEqual(3);
      expect(creature.damage.length).toBeGreaterThanOrEqual(1);
      for (const score of [creature.str, creature.dex, creature.wil]) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(18);
      }
    }
  });

  it('list twenty backgrounds for each kind of world', () => {
    for (const list of Object.values(data.backgrounds)) expect(list).toHaveLength(20);
  });

  it('list tools in pairs, as the rulebook table shows them', () => {
    expect(data.tools.length % 2).toBe(0);
  });

  it('reject data that breaks the schema', () => {
    expect(schemas.origins.safeParse([{ id: 'x' }]).success).toBe(false);
    expect(schemas.affinities.safeParse(data.affinities.slice(0, 9)).success).toBe(false);
    expect(schemas.weapons.safeParse([{ ...data.weapons[0], damage: 7 }]).success).toBe(false);
    expect(schemas.armor.safeParse([{ ...data.armor[0], armor: 4 }]).success).toBe(false);
  });

  it('carry a version', () => {
    expect(data.meta.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
