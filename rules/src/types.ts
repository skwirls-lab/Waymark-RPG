export type AttributeKey = 'str' | 'dex' | 'wil';
export type Die = 4 | 6 | 8 | 10 | 12 | 20;

/** A value that can be worn down and restored: `current` never exceeds `full`. */
export interface Score {
  current: number;
  full: number;
}

export type ItemKind = 'weapon' | 'armor' | 'tool' | 'special';
export type ItemPlace = 'hand' | 'body' | 'pack';

export interface Item {
  id: string;
  name: string;
  kind: ItemKind;
  /** 0 for small items, 1 for most things, 2 for bulky ones. */
  slots: 0 | 1 | 2;
  place: ItemPlace;
  damage?: Die;
  armor?: number;
  /** True for shields and helmets, which add to a suit of armor. */
  stacks?: boolean;
  imbued?: 'light' | 'dark';
  /** For special items: uses left, and how many a full recharge gives. */
  charges?: Score;
}

export interface ScarRecord {
  roll: number;
  name: string;
  /** True while the scar's lasting effect or reward is still to come. */
  pending: boolean;
  detail?: string;
}

export interface Character {
  name: string;
  background: string;
  originId: string | null;
  attributes: Record<AttributeKey, Score>;
  hp: Score;
  slotCapacity: number;
  items: Item[];
  fatigue: number;
  /** Fatigue gained in a corrupted place. Only a haven clears it. */
  taintedFatigue: number;
  deprived: boolean;
  daysDeprived: number;
  /** False for Origins that rest and medicine do not heal. */
  healsByRest: boolean;
  /** Helpless and dying after a failed Strength save. */
  critical: boolean;
  doomed: boolean;
  /** Taken by corruption: now the Warden's. */
  lost: boolean;
  primaryAffinity: string | null;
  secondaryAffinity: string | null;
  abilities: string[];
  tier: number;
  corruption: { afflicted: boolean; failedSaves: number };
  scars: ScarRecord[];
  conditions: string[];
  coins: number;
  /**
   * Content from a world, not the rulebook, that this character uses. Kept
   * on the character so the sheet still reads correctly if the character
   * leaves the campaign it was made in.
   */
  homebrew?: {
    origin?: { name: string; trait: string; drawback: string | null };
    affinities?: Record<string, string>;
    abilities?: Record<string, { name: string; text: string }>;
  };
  /** Only in worlds where Abilities cost charges instead of Fatigue. */
  abilityCharges?: Score;
  /** Only in worlds where an Ability needs a short rest before it can be used again. */
  recovering?: string[];
  rulesVersion: string;
}

export type Status = 'ok' | 'critical' | 'dead' | 'paralyzed' | 'delirious' | 'lost';

/** Thrown when an action is not allowed by the rules. `code` is stable; `message` is for people. */
export class RulesError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RulesError';
  }
}
