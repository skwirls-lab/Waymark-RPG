import { describe, expect, it } from 'vitest';
import {
  RulesError,
  applyDoomedReward,
  applyScar,
  data,
  recoverFromScar,
  status,
} from '../src/index.ts';
import { wren } from './helpers.ts';

describe('The Scars table', () => {
  it('names every scar as the rulebook does', () => {
    // A dice total each scar accepts: 1d6 for most, 3d6 for scars 6 and 9.
    const total = (roll: number) => (roll === 6 || roll === 9 ? 10 : 3);
    for (let roll = 1; roll <= 12; roll++) {
      const c = applyScar(wren(), roll, { d6: 1, total: total(roll), d20: 1 });
      expect(c.scars.at(-1)!.name).toBe(data.scars[roll - 1]!.name);
    }
  });

  it('1 Lasting Scar: records where, and 1d6 replaces max HP only if higher', () => {
    const higher = applyScar(wren(), 1, { d6: 3, total: 6 });
    expect(higher.scars[0]).toMatchObject({ detail: 'eye', pending: false });
    expect(higher.hp.full).toBe(6);
    expect(applyScar(wren(), 1, { d6: 3, total: 2 }).hp.full).toBe(4);
  });

  it('2 Rattling Blow: 1d6 replaces max HP only if higher', () => {
    expect(applyScar(wren(), 2, { total: 5 }).hp.full).toBe(5);
    expect(applyScar(wren(), 2, { total: 4 }).hp.full).toBe(4);
  });

  it('3 Walloped: deprived until rested, then 1d6 is added to max HP', () => {
    const walloped = applyScar(wren(), 3);
    expect(walloped.deprived).toBe(true);
    expect(walloped.scars[0]!.pending).toBe(true);
    const rested = recoverFromScar(walloped, 0, 3);
    expect(rested.deprived).toBe(false);
    expect(rested.hp.full).toBe(7);
    expect(rested.scars[0]!.pending).toBe(false);
  });

  it('4 Broken Limb: records which, and once mended 2d6 replaces max HP if higher', () => {
    const broken = applyScar(wren(), 4, { d6: 6 });
    expect(broken.scars[0]!.detail).toBe('skull');
    expect(recoverFromScar(broken, 0, 9).hp.full).toBe(9);
    expect(recoverFromScar(broken, 0, 3).hp.full).toBe(4);
  });

  it('5 Diseased: on recovery 2d6 replaces max HP if higher', () => {
    expect(recoverFromScar(applyScar(wren(), 5), 0, 11).hp.full).toBe(11);
  });

  it('6 Head Wound: a d6 picks the attribute, and 3d6 replaces it if higher', () => {
    expect(applyScar(wren(), 6, { d6: 1, total: 14 }).attributes.str).toEqual({
      current: 14,
      full: 14,
    });
    expect(applyScar(wren(), 6, { d6: 4, total: 15 }).attributes.dex.full).toBe(15);
    expect(applyScar(wren(), 6, { d6: 6, total: 5 }).attributes.wil.full).toBe(11);
  });

  it('6 Head Wound: a raised score keeps any points already lost', () => {
    const hurt = wren();
    hurt.attributes.str.current = 7;
    expect(applyScar(hurt, 6, { d6: 2, total: 12 }).attributes.str).toEqual({
      current: 10,
      full: 12,
    });
  });

  it('7 Hamstrung: after recovery 3d6 replaces Dexterity if higher', () => {
    expect(recoverFromScar(applyScar(wren(), 7), 0, 16).attributes.dex.full).toBe(16);
    expect(recoverFromScar(applyScar(wren(), 7), 0, 8).attributes.dex.full).toBe(13);
  });

  it('8 Deafened: a passed Willpower save raises max Willpower by 1d4', () => {
    expect(applyScar(wren(), 8, { d20: 11, total: 3 }).attributes.wil.full).toBe(14);
    expect(applyScar(wren(), 8, { d20: 12, total: 3 }).attributes.wil.full).toBe(11);
  });

  it('9 Re-brained: 3d6 replaces Willpower if higher', () => {
    expect(applyScar(wren(), 9, { total: 17 }).attributes.wil.full).toBe(17);
    expect(applyScar(wren(), 9, { total: 11 }).attributes.wil.full).toBe(11);
  });

  it('10 Sundered: a passed Willpower save raises max Willpower by 1d6', () => {
    expect(applyScar(wren(), 10, { d20: 5, total: 6 }).attributes.wil.full).toBe(17);
    expect(applyScar(wren(), 10, { d20: 20, total: 6 }).attributes.wil.full).toBe(11);
  });

  it('no score rises above 18', () => {
    const strong = wren();
    strong.attributes.wil = { current: 16, full: 16 };
    expect(applyScar(strong, 10, { d20: 2, total: 6 }).attributes.wil).toEqual({
      current: 18,
      full: 18,
    });
  });

  it('11 Mortal Wound: deprived and out of action; on recovery 2d6 is the new max HP', () => {
    const wounded = applyScar(wren(), 11);
    expect(wounded.deprived).toBe(true);
    expect(status(wounded)).toBe('critical');
    const healed = recoverFromScar(wounded, 0, 2);
    expect(status(healed)).toBe('ok');
    expect(healed.deprived).toBe(false);
    expect(healed.hp).toEqual({ current: 2, full: 2 }); // taken even though it is lower
  });

  it('12 Doomed: marks the character, and passing the next save earns 3d6 for HP if higher', () => {
    expect(applyScar(wren(), 12).doomed).toBe(true);
    expect(applyDoomedReward(wren(), 13).hp.full).toBe(13);
    expect(applyDoomedReward(wren(), 3).hp.full).toBe(4);
  });

  it('asks for the rolls a scar needs', () => {
    expect(() => applyScar(wren(), 1, { total: 3 })).toThrow(/d6 for the location/);
    expect(() => applyScar(wren(), 2)).toThrow(/1d6/);
    expect(() => applyScar(wren(), 8, { total: 2 })).toThrow(/Willpower save/);
    expect(() => applyScar(wren(), 6, { d6: 1 })).toThrow(/3d6/);
  });

  it('refuses impossible rolls', () => {
    expect(() => applyScar(wren(), 13)).toThrow(RulesError);
    expect(() => applyScar(wren(), 2, { total: 7 })).toThrow(/between 1 and 6/);
    expect(() => applyScar(wren(), 9, { total: 2 })).toThrow(/between 3 and 18/);
    expect(() => recoverFromScar(applyScar(wren(), 4, { d6: 1 }), 0, 13)).toThrow(
      /between 2 and 12/,
    );
  });

  it('only a pending scar can be recovered from', () => {
    expect(() => recoverFromScar(wren(), 0, 3)).toThrow(/no scar/);
    const done = recoverFromScar(applyScar(wren(), 3), 0, 3);
    expect(() => recoverFromScar(done, 0, 3)).toThrow(/no scar/);
  });
});
