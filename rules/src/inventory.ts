import { RulesError, type Character, type Item, type Status } from './types.ts';

export const clone = (c: Character): Character => structuredClone(c);

export function slotsUsed(c: Character): number {
  return c.items.reduce((sum, item) => sum + item.slots, 0) + c.fatigue + c.taintedFatigue;
}

export function freeSlots(c: Character): number {
  return c.slotCapacity - slotsUsed(c);
}

/** Every slot filled, with gear or with Fatigue. */
export function isFull(c: Character): boolean {
  return freeSlots(c) <= 0;
}

/** A character with every slot full is at 0 HP until they put something down. */
export function settle(c: Character): Character {
  if (isFull(c)) c.hp.current = 0;
  return c;
}

export function status(c: Character): Status {
  if (c.attributes.str.current <= 0) return 'dead';
  if (c.lost) return 'lost';
  if (c.critical) return 'critical';
  if (c.attributes.dex.current <= 0) return 'paralyzed';
  if (c.attributes.wil.current <= 0) return 'delirious';
  return 'ok';
}

export function addItem(character: Character, item: Item): Character {
  if (item.slots > freeSlots(character)) {
    throw new RulesError('no-room', 'There is no room to carry that.');
  }
  const c = clone(character);
  c.items.push(item);
  return settle(c);
}

export function removeItem(character: Character, itemId: string): Character {
  const c = clone(character);
  const index = c.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new RulesError('no-item', 'That item is not being carried.');
  c.items.splice(index, 1);
  return c;
}

export type FatigueOutcome = 'slot' | 'dropped' | 'strength';

export interface FatigueOptions {
  /** Gained in a corrupted place: rest will not clear it. */
  tainted?: boolean;
  /** The item to drop if there is no free slot. */
  dropItemId?: string;
}

/**
 * Adds one Fatigue. It fills a free slot. With no free slot, an item must be
 * dropped to make room. With every slot already Fatigue, it costs 1 Strength.
 */
export function addFatigue(
  character: Character,
  options: FatigueOptions = {},
): { character: Character; outcome: FatigueOutcome } {
  const c = clone(character);
  let outcome: FatigueOutcome = 'slot';
  if (freeSlots(c) < 1) {
    const droppable = c.items.filter((item) => item.slots > 0);
    if (droppable.length === 0) {
      c.attributes.str.current = Math.max(0, c.attributes.str.current - 1);
      return { character: settle(c), outcome: 'strength' };
    }
    if (!options.dropItemId) {
      throw new RulesError('must-drop', 'There is no free slot. Choose an item to drop.');
    }
    if (!droppable.some((item) => item.id === options.dropItemId)) {
      throw new RulesError('no-item', 'That item cannot be dropped to make room.');
    }
    // Remove an item that actually frees a slot, even if a small item shares its id.
    const index = c.items.findIndex((item) => item.id === options.dropItemId && item.slots > 0);
    c.items.splice(index, 1);
    outcome = 'dropped';
  }
  if (options.tainted) c.taintedFatigue += 1;
  else c.fatigue += 1;
  return { character: settle(c), outcome };
}

/** Worn armor added together, never more than 3. One suit counts, plus shield and helmet. */
export function armorValue(c: Character): number {
  const worn = c.items.filter((i) => i.kind === 'armor' && i.place !== 'pack' && i.armor);
  const suit = Math.max(0, ...worn.filter((i) => !i.stacks).map((i) => i.armor!));
  const extras = worn.filter((i) => i.stacks).reduce((sum, i) => sum + i.armor!, 0);
  return Math.min(3, suit + extras);
}
