import { describe, expect, it } from 'vitest';
import {
  RulesError,
  checkSave,
  dieOfFate,
  pickRoll,
  randomRng,
  roll,
  rollSave,
  rollSum,
  sequenceRng,
} from '../src/index.ts';

describe('Introduction: reading the dice', () => {
  it('3d6 means roll three six-sided dice and add them', () => {
    expect(rollSum(3, 6, sequenceRng([2, 5, 6]))).toEqual({ rolls: [2, 5, 6], total: 13 });
  });

  it('a real random roll always lands on the die', () => {
    for (const sides of [4, 6, 8, 10, 12, 20] as const) {
      for (let i = 0; i < 200; i++) {
        const value = roll(sides, randomRng);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(sides);
      }
    }
  });

  it('refuses a result the die cannot show', () => {
    expect(() => roll(6, sequenceRng([7]))).toThrow(RulesError);
    expect(() => roll(6, sequenceRng([0]))).toThrow(RulesError);
    expect(() => roll(6, sequenceRng([2.5]))).toThrow(RulesError);
    expect(() => roll(6, () => 9)).toThrow(RulesError);
  });

  it('refuses to roll when no more hand-entered results were given', () => {
    const rng = sequenceRng([3]);
    roll(6, rng);
    expect(() => roll(6, rng)).toThrow(/No more rolls/);
  });
});

describe('Introduction: saves', () => {
  it('succeeds on a roll equal to or under the score', () => {
    expect(checkSave(13, 9)).toBe(true); // the rulebook's bridge example
    expect(checkSave(13, 13)).toBe(true);
    expect(checkSave(13, 14)).toBe(false);
  });

  it('a 1 always succeeds, however low the score has fallen', () => {
    expect(checkSave(0, 1)).toBe(true);
  });

  it('a 20 always fails', () => {
    expect(checkSave(20, 20)).toBe(false);
    expect(checkSave(18, 20)).toBe(false);
  });

  it('refuses a roll that is not on a d20', () => {
    expect(() => checkSave(10, 21)).toThrow(RulesError);
  });

  it('advantage uses the lower of two rolls', () => {
    expect(pickRoll([15, 4], 'advantage')).toBe(4);
    expect(rollSave(10, sequenceRng([15, 4]), 'advantage')).toEqual({
      rolls: [15, 4],
      used: 4,
      success: true,
    });
  });

  it('disadvantage uses the higher of two rolls', () => {
    expect(pickRoll([15, 4], 'disadvantage')).toBe(15);
    expect(rollSave(10, sequenceRng([15, 4]), 'disadvantage').success).toBe(false);
  });

  it('a normal save rolls one die', () => {
    expect(rollSave(10, sequenceRng([10]))).toEqual({ rolls: [10], used: 10, success: true });
  });
});

describe('Advice for the Warden: the Die of Fate', () => {
  it('4, 5 or 6 goes well for the characters; 1, 2 or 3 does not', () => {
    expect([1, 2, 3, 4, 5, 6].map((r) => dieOfFate(sequenceRng([r])).favorable)).toEqual([
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });
});
