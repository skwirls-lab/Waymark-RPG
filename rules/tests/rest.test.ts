import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  catchCorruption,
  loseAttribute,
  nightRest,
  passDayDeprived,
  repair,
  restAtHaven,
  setDeprived,
  shortRest,
  status,
  weekRest,
} from '../src/index.ts';
import { item, wren } from './helpers.ts';

const hurt = () => applyDamage(wren(), 3).character; // 2 HP left

describe('Rest and recovery', () => {
  it('a short rest restores all lost HP', () => {
    expect(hurt().hp.current).toBe(2);
    expect(shortRest(hurt()).hp.current).toBe(4);
  });

  it('a full night somewhere safe removes all Fatigue', () => {
    const tired = { ...hurt(), fatigue: 3 };
    const rested = nightRest(tired, { safe: true });
    expect(rested.fatigue).toBe(0);
    expect(rested.hp.current).toBe(4);
  });

  it('a night that is not safe removes none', () => {
    expect(nightRest({ ...wren(), fatigue: 3 }, { safe: false }).fatigue).toBe(3);
  });

  it('a week of care restores lost attribute points', () => {
    const wounded = loseAttribute(applyDamage(wren(), 7).character, 'dex', 5);
    const healed = weekRest({ ...wounded, critical: true, fatigue: 2 });
    expect(healed.attributes.str.current).toBe(9);
    expect(healed.attributes.dex.current).toBe(13);
    expect(healed.hp.current).toBe(4);
    expect(healed.fatigue).toBe(0);
    expect(status(healed)).toBe('ok');
  });

  it('a week of rest leaves an overloaded character at 0 HP', () => {
    const loaded = { ...wren(), items: Array.from({ length: 10 }, () => item()) };
    expect(weekRest(loaded).hp.current).toBe(0);
  });
});

describe('Going without', () => {
  it('a deprived character cannot get back HP or attribute points', () => {
    const deprived = setDeprived(applyDamage(wren(), 7).character, true);
    expect(shortRest(deprived).hp.current).toBe(0);
    expect(nightRest(deprived, { safe: true }).hp.current).toBe(0);
    expect(weekRest(deprived).attributes.str.current).toBe(7);
  });

  it('after more than a day deprived, each day adds 1 Fatigue', () => {
    let c = setDeprived(wren(), true);
    c = passDayDeprived(c);
    expect(c.fatigue).toBe(0);
    c = passDayDeprived(c);
    expect(c.fatigue).toBe(1);
    c = passDayDeprived(c);
    expect(c.fatigue).toBe(2);
  });

  it('meeting the need ends it and resets the count', () => {
    let c = passDayDeprived(passDayDeprived(setDeprived(wren(), true)));
    c = setDeprived(c, false);
    expect(c).toMatchObject({ deprived: false, daysDeprived: 0 });
    expect(passDayDeprived(c).fatigue).toBe(1); // unchanged: not deprived
  });
});

describe('Rest: the limits', () => {
  it('an overloaded character stays at 0 HP until they put something down', () => {
    const overloaded = { ...wren(), fatigue: 4, hp: { current: 0, full: 4 } };
    expect(shortRest(overloaded).hp.current).toBe(0);
  });

  it('nobody gets HP back inside a corrupted place', () => {
    expect(shortRest(hurt(), { inCorruptedPlace: true }).hp.current).toBe(2);
    expect(nightRest(hurt(), { safe: true, inCorruptedPlace: true }).hp.current).toBe(2);
  });

  it("a night's rest does not clear tainted Fatigue; a haven does", () => {
    const tainted = { ...wren(), fatigue: 2, taintedFatigue: 2 };
    const rested = nightRest(tainted, { safe: true });
    expect(rested).toMatchObject({ fatigue: 0, taintedFatigue: 2 });
    expect(restAtHaven(rested).taintedFatigue).toBe(0);
  });

  it('a haven cures lasting corruption', () => {
    const afflicted = catchCorruption(wren());
    afflicted.corruption.failedSaves = 2;
    expect(restAtHaven(afflicted).corruption).toEqual({ afflicted: false, failedSaves: 0 });
  });

  it('someone with critical damage does not recover HP until tended', () => {
    expect(shortRest({ ...hurt(), critical: true }).hp.current).toBe(2);
  });

  it('the Built are not healed by rest; repair restores them', () => {
    const built = { ...loseAttribute(hurt(), 'str', 3), healsByRest: false, critical: true };
    expect(shortRest(built).hp.current).toBe(2);
    expect(weekRest(built).attributes.str.current).toBe(6);
    const fixed = repair(built);
    expect(fixed.attributes.str.current).toBe(9);
    expect(fixed.hp.current).toBe(4);
    expect(fixed.critical).toBe(false);
  });

  it('repair leaves an overloaded character at 0 HP', () => {
    const loaded = { ...wren(), healsByRest: false, fatigue: 4, hp: { current: 0, full: 4 } };
    expect(repair(loaded).hp.current).toBe(0);
  });
});
