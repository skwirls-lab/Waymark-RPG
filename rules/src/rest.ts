import { addFatigue, clone, isFull, type FatigueOptions } from './inventory.ts';
import type { Character } from './types.ts';

/** HP cannot come back while deprived, overloaded, unhealable by rest, or in a corrupted place. */
export function canRecoverHp(c: Character, inCorruptedPlace = false): boolean {
  return !c.deprived && !isFull(c) && c.healsByRest && !inCorruptedPlace && !c.critical;
}

/** A few minutes and a drink of water: all lost HP returns. */
export function shortRest(
  character: Character,
  options: { inCorruptedPlace?: boolean } = {},
): Character {
  const c = clone(character);
  if (canRecoverHp(c, options.inCorruptedPlace)) c.hp.current = c.hp.full;
  // Where Abilities need recovery time, a short rest makes them ready again.
  if (c.recovering) c.recovering = [];
  return c;
}

/** A full night's sleep somewhere safe removes all Fatigue, except tainted Fatigue. */
export function nightRest(
  character: Character,
  options: { safe: boolean; inCorruptedPlace?: boolean },
): Character {
  let c = clone(character);
  if (options.safe) {
    c.fatigue = 0;
    // Where Abilities cost charges, a night's rest refills them.
    if (c.abilityCharges) c.abilityCharges.current = c.abilityCharges.full;
  }
  c = shortRest(c, options);
  return c;
}

/** A week of rest with someone caring for you restores lost attribute points. */
export function weekRest(character: Character): Character {
  const c = clone(character);
  if (c.deprived || !c.healsByRest) return c;
  for (const score of Object.values(c.attributes)) score.current = score.full;
  c.critical = false;
  c.fatigue = 0;
  c.hp.current = isFull(c) ? 0 : c.hp.full;
  return c;
}

/** For Origins that rest does not heal: tools and someone who can repair them. */
export function repair(character: Character): Character {
  const c = clone(character);
  for (const score of Object.values(c.attributes)) score.current = score.full;
  c.critical = false;
  if (!isFull(c)) c.hp.current = c.hp.full;
  return c;
}

/** Lacking food, water, sleep or warmth. Meeting the need ends it. */
export function setDeprived(character: Character, deprived: boolean): Character {
  const c = clone(character);
  c.deprived = deprived;
  if (!deprived) c.daysDeprived = 0;
  return c;
}

/** Each day spent deprived after the first adds 1 Fatigue. */
export function passDayDeprived(character: Character, options: FatigueOptions = {}): Character {
  const c = clone(character);
  if (!c.deprived) return c;
  c.daysDeprived += 1;
  return c.daysDeprived > 1 ? addFatigue(c, options).character : c;
}

/** A haven clears tainted Fatigue and cures lasting corruption. */
export function restAtHaven(character: Character): Character {
  const c = clone(character);
  c.taintedFatigue = 0;
  c.corruption = { afflicted: false, failedSaves: 0 };
  return c;
}
