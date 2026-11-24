import { createCharacter, type Character, type Item } from '../src/index.ts';

let n = 0;
export const item = (over: Partial<Item> = {}): Item => ({
  id: `t${++n}`,
  name: 'Thing',
  kind: 'tool',
  slots: 1,
  place: 'pack',
  ...over,
});

/** Wren, the rulebook's running example: STR 9, DEX 13, WIL 11, 4 HP, leather jacket. */
export function wren(over: Partial<Character> = {}): Character {
  const base = createCharacter({
    name: 'Wren',
    background: 'Scout',
    attributes: { str: 9, dex: 13, wil: 11 },
    hp: 4,
    coins: 10,
    items: [
      item({ id: 'sword', name: 'Short sword', kind: 'weapon', damage: 8 }),
      item({ id: 'jacket', name: 'Leather jacket', kind: 'armor', armor: 1 }),
      item({ id: 'rope', name: 'Rope' }),
      item({ id: 'hook', name: 'Grappling hook' }),
    ],
  });
  return { ...base, ...over };
}

/** A character with every slot filled by Fatigue and nothing to drop. */
export const exhausted = (): Character => ({
  ...wren(),
  items: [],
  fatigue: 10,
  hp: { current: 0, full: 4 },
});

/** Tobin the healer: Mending, with Mend and Cleanse. */
export const tobin = (over: Partial<Character> = {}): Character => ({
  ...createCharacter({
    name: 'Tobin',
    background: 'Herbalist',
    attributes: { str: 8, dex: 10, wil: 12 },
    hp: 3,
    coins: 7,
    primaryAffinity: 'mending',
    abilities: ['mend', 'cleanse'],
    items: [],
  }),
  ...over,
});
