import { assertRoll, roll, type Rng } from './dice.ts';

export type SaveMode = 'normal' | 'advantage' | 'disadvantage';

/** Equal to or under the score succeeds. A 1 always succeeds; a 20 always fails. */
export function checkSave(score: number, d20: number): boolean {
  assertRoll(d20, 20);
  if (d20 === 1) return true;
  if (d20 === 20) return false;
  return d20 <= score;
}

/** Advantage uses the lower of two rolls; disadvantage the higher. */
export function pickRoll(rolls: readonly number[], mode: SaveMode): number {
  if (mode === 'advantage') return Math.min(...rolls);
  if (mode === 'disadvantage') return Math.max(...rolls);
  return rolls[0]!;
}

export interface SaveResult {
  rolls: number[];
  used: number;
  success: boolean;
}

export function rollSave(score: number, rng: Rng, mode: SaveMode = 'normal'): SaveResult {
  const rolls = mode === 'normal' ? [roll(20, rng)] : [roll(20, rng), roll(20, rng)];
  const used = pickRoll(rolls, mode);
  return { rolls, used, success: checkSave(score, used) };
}
