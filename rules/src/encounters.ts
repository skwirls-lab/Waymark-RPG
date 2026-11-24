import { rollSum, type Rng } from './dice.ts';
import { checkSave } from './saves.ts';
import { RulesError } from './types.ts';

export type Reaction = 'hostile' | 'wary' | 'curious' | 'kind' | 'helpful';

/** The 2d6 reaction table. */
export function reactionFor(total: number): Reaction {
  if (!Number.isInteger(total) || total < 2 || total > 12) {
    throw new RulesError('bad-roll', 'A reaction roll is 2d6: 2 to 12.');
  }
  if (total === 2) return 'hostile';
  if (total <= 5) return 'wary';
  if (total <= 8) return 'curious';
  if (total <= 11) return 'kind';
  return 'helpful';
}

export function rollReaction(rng: Rng): { rolls: number[]; total: number; reaction: Reaction } {
  const { rolls, total } = rollSum(2, 6, rng);
  return { rolls, total, reaction: reactionFor(total) };
}

export interface MoraleSituation {
  /** How many the enemy side started with. */
  total: number;
  /** How many of them are down now, counting the one that just fell. */
  down: number;
  /** For an enemy fighting alone: its HP has just reached 0. */
  loneAtZeroHp?: boolean;
}

/** Enemies check morale when the first falls, when half are down, and alone at 0 HP. */
export function moraleCheckDue(s: MoraleSituation): boolean {
  if (s.total <= 1) return s.loneAtZeroHp === true;
  return s.down === 1 || s.down === Math.ceil(s.total / 2);
}

/** A Willpower save. On a failure the enemies run, surrender or bargain. */
export function holdsNerve(willpower: number, d20: number): boolean {
  return checkSave(willpower, d20);
}

/** A Dexterity save at the start of a fight: succeed and act before the enemies. */
export function actsBeforeEnemies(dexterity: number, d20: number): boolean {
  return checkSave(dexterity, d20);
}

/** Running away needs somewhere to run to and a Dexterity save. */
export function escapes(dexterity: number, d20: number, hasSomewhereToGo: boolean): boolean {
  return hasSomewhereToGo && checkSave(dexterity, d20);
}

/** A shove, trip or disarm works if the target fails their save. It deals no damage. */
export function maneuverWorks(targetScore: number, d20: number): boolean {
  return !checkSave(targetScore, d20);
}

export type Band = 'close' | 'near' | 'far' | 'distant';

/** Tabletop measurements for a chosen move distance, in inches or squares. */
export function bandsFor(move: number): { close: number; near: number; far: number } {
  if (move <= 0) throw new RulesError('bad-move', 'A move distance must be more than zero.');
  return { close: 1, near: move, far: move * 3 };
}

export function bandAt(distance: number, move: number): Band {
  const bands = bandsFor(move);
  if (distance <= bands.close) return 'close';
  if (distance <= bands.near) return 'near';
  if (distance <= bands.far) return 'far';
  return 'distant';
}

/** Distances given in feet: 5 feet is 1 inch or 1 square. */
export const feetToInches = (feet: number): number => feet / 5;

/** Rough ground costs double. */
export const moveCost = (distance: number, rough: boolean): number =>
  rough ? distance * 2 : distance;
