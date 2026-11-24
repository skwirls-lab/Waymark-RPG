import { describe, expect, it } from 'vitest';
import {
  RulesError,
  actsBeforeEnemies,
  armorAgainstOpposingAbilities,
  bandAt,
  bandsFor,
  escapes,
  feetToInches,
  holdsNerve,
  imbueItem,
  maneuverWorks,
  moraleCheckDue,
  moveCost,
  reactionFor,
  rollReaction,
  saveScore,
  sequenceRng,
} from '../src/index.ts';
import { exhausted, wren } from './helpers.ts';

describe('Imbued gear', () => {
  it('a passed Willpower save imbues the item', () => {
    const result = imbueItem(wren(), 'sword', 'light', 11);
    expect(result.success).toBe(true);
    expect(result.character.items.find((i) => i.id === 'sword')!.imbued).toBe('light');
  });

  it('a failed save leaves the item unchanged and gives the crafter 1 Fatigue', () => {
    const result = imbueItem(wren(), 'sword', 'light', 12);
    expect(result.success).toBe(false);
    expect(result.character.items.find((i) => i.id === 'sword')!.imbued).toBeUndefined();
    expect(result.character.fatigue).toBe(1);
  });

  it('an item can only be imbued once', () => {
    const once = imbueItem(wren(), 'sword', 'dark', 2).character;
    expect(() => imbueItem(once, 'sword', 'light', 2)).toThrow(/once/);
  });

  it('the item must be carried', () => {
    expect(() => imbueItem(wren(), 'crown', 'light', 2)).toThrow(RulesError);
  });

  it('imbued armor adds 1 to Willpower against fear, illusions and attacks on the mind', () => {
    const warded = imbueItem(wren(), 'jacket', 'light', 2).character;
    expect(saveScore(warded, 'wil', { againstTheMind: true })).toBe(12);
    expect(saveScore(warded, 'wil')).toBe(11);
    expect(saveScore(warded, 'dex', { againstTheMind: true })).toBe(13);
    expect(saveScore(wren(), 'wil', { againstTheMind: true })).toBe(11);
  });

  it('dark armor counts as 1 lower against opposing Abilities, never below 0', () => {
    const dark = imbueItem(wren(), 'jacket', 'dark', 2).character;
    expect(armorAgainstOpposingAbilities(dark, 1)).toBe(0);
    expect(armorAgainstOpposingAbilities(dark, 0)).toBe(0);
    expect(armorAgainstOpposingAbilities(wren(), 1)).toBe(1);
  });

  it('a failed attempt by a crafter with no room costs Strength, per the Fatigue rule', () => {
    const spent = {
      ...exhausted(),
      items: [{ ...wren().items[0]!, slots: 0 as const, id: 'charm' }],
    };
    expect(imbueItem(spent, 'charm', 'light', 20).character.attributes.str.current).toBe(8);
  });
});

describe('Meeting people and creatures', () => {
  it('reads the 2d6 reaction table', () => {
    expect([2, 3, 5, 6, 8, 9, 11, 12].map(reactionFor)).toEqual([
      'hostile',
      'wary',
      'wary',
      'curious',
      'curious',
      'kind',
      'kind',
      'helpful',
    ]);
    expect(rollReaction(sequenceRng([3, 4]))).toEqual({
      rolls: [3, 4],
      total: 7,
      reaction: 'curious',
    });
  });

  it('refuses a total 2d6 cannot make', () => {
    expect(() => reactionFor(1)).toThrow(RulesError);
    expect(() => reactionFor(13)).toThrow(RulesError);
    expect(() => reactionFor(6.5)).toThrow(RulesError);
  });

  it('enemies check morale when the first falls and when half are down', () => {
    expect(moraleCheckDue({ total: 6, down: 1 })).toBe(true);
    expect(moraleCheckDue({ total: 6, down: 2 })).toBe(false);
    expect(moraleCheckDue({ total: 6, down: 3 })).toBe(true);
    expect(moraleCheckDue({ total: 5, down: 3 })).toBe(true);
    expect(moraleCheckDue({ total: 6, down: 4 })).toBe(false);
  });

  it('an enemy fighting alone checks when its HP reaches 0', () => {
    expect(moraleCheckDue({ total: 1, down: 0, loneAtZeroHp: true })).toBe(true);
    expect(moraleCheckDue({ total: 1, down: 0 })).toBe(false);
  });

  it('morale is a Willpower save', () => {
    expect(holdsNerve(8, 8)).toBe(true);
    expect(holdsNerve(8, 9)).toBe(false);
  });
});

describe('Fighting: order, escape and maneuvers', () => {
  it('a passed Dexterity save acts before the enemies', () => {
    expect(actsBeforeEnemies(13, 13)).toBe(true);
    expect(actsBeforeEnemies(13, 14)).toBe(false);
  });

  it('running away needs somewhere to go and a Dexterity save', () => {
    expect(escapes(13, 5, true)).toBe(true);
    expect(escapes(13, 5, false)).toBe(false);
    expect(escapes(13, 18, true)).toBe(false);
  });

  it('a maneuver works if the target fails their save', () => {
    expect(maneuverWorks(10, 15)).toBe(true);
    expect(maneuverWorks(10, 4)).toBe(false);
  });
});

describe('Playing on a tabletop', () => {
  it('with a 6-inch move: Close 1, Near 6, Far 18', () => {
    expect(bandsFor(6)).toEqual({ close: 1, near: 6, far: 18 });
  });

  it('with an 8-inch move: Near 8, Far 24', () => {
    expect(bandsFor(8)).toEqual({ close: 1, near: 8, far: 24 });
  });

  it('names the band for a measured distance', () => {
    expect([1, 1.5, 6, 6.5, 18, 19].map((d) => bandAt(d, 6))).toEqual([
      'close',
      'near',
      'near',
      'far',
      'far',
      'distant',
    ]);
  });

  it('5 feet is 1 inch or square', () => {
    expect(feetToInches(30)).toBe(6);
    expect(feetToInches(10)).toBe(2);
  });

  it('rough ground costs double', () => {
    expect(moveCost(3, true)).toBe(6);
    expect(moveCost(3, false)).toBe(3);
  });

  it('a move distance must be more than zero', () => {
    expect(() => bandsFor(0)).toThrow(RulesError);
  });
});
