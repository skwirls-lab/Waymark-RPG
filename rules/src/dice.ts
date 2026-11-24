import { RulesError, type Die } from './types.ts';

/**
 * A source of die rolls: given a number of sides, returns 1..sides.
 * Every rule that rolls takes one, so tests can fix the outcome and the app
 * can substitute a number typed in from a real die.
 */
export type Rng = (sides: number) => number;

export const randomRng: Rng = (sides) => Math.floor(Math.random() * sides) + 1;

/** Returns the given results in order. Used for tests and for hand-entered rolls. */
export function sequenceRng(values: readonly number[]): Rng {
  let next = 0;
  return (sides) => {
    const value = values[next++];
    if (value === undefined) throw new RulesError('no-roll', 'No more rolls were supplied.');
    assertRoll(value, sides);
    return value;
  };
}

export function assertRoll(value: number, sides: number): void {
  if (!Number.isInteger(value) || value < 1 || value > sides) {
    throw new RulesError('bad-roll', `${value} is not a possible result on a d${sides}.`);
  }
}

export function roll(sides: Die, rng: Rng): number {
  const value = rng(sides);
  assertRoll(value, sides);
  return value;
}

/** Rolls several dice and adds them: `rollSum(3, 6, rng)` is 3d6. */
export function rollSum(count: number, sides: Die, rng: Rng): { rolls: number[]; total: number } {
  const rolls = Array.from({ length: count }, () => roll(sides, rng));
  return { rolls, total: rolls.reduce((a, b) => a + b, 0) };
}

/** The Die of Fate: 4 or more favors the characters. */
export function dieOfFate(rng: Rng): { roll: number; favorable: boolean } {
  const value = roll(6, rng);
  return { roll: value, favorable: value >= 4 };
}
