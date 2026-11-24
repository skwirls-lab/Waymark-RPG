import type { CharacterDoc } from './characters';
import { mergeWithLocal } from './useCharacters';

const doc = (id: string, updatedAt: number, slot = 1): CharacterDoc =>
  ({
    id,
    slot,
    updatedAt,
    name: id,
    ownerUid: 'u',
    description: '',
    age: null,
    notes: '',
    createdAt: 0,
  }) as CharacterDoc;

describe("combining the database's report with local changes", () => {
  it('an older echo never replaces a newer local change', () => {
    const local = new Map([['a', doc('a', 20)]]);
    expect(mergeWithLocal([doc('a', 10)], local, new Set())[0]!.updatedAt).toBe(20);
    expect(local.has('a')).toBe(true);
  });

  it('once the database has caught up, its copy is used and the local one is dropped', () => {
    const local = new Map([['a', doc('a', 20)]]);
    expect(mergeWithLocal([doc('a', 20)], local, new Set())[0]!.updatedAt).toBe(20);
    expect(local.has('a')).toBe(false);
    expect(
      mergeWithLocal([doc('a', 30)], new Map([['a', doc('a', 20)]]), new Set())[0]!.updatedAt,
    ).toBe(30);
  });

  it('a character made here shows before the database reports it', () => {
    const merged = mergeWithLocal([], new Map([['a', doc('a', 5)]]), new Set());
    expect(merged.map((d) => d.id)).toEqual(['a']);
  });

  it('a character deleted here stays gone even if an old report still lists it', () => {
    const removed = new Set(['a']);
    expect(mergeWithLocal([doc('a', 5)], new Map(), removed)).toEqual([]);
    expect(removed.has('a')).toBe(true);
    // Once the database agrees, the note is cleared.
    mergeWithLocal([], new Map(), removed);
    expect(removed.has('a')).toBe(false);
  });

  it('keeps characters in slot order', () => {
    const merged = mergeWithLocal([doc('b', 1, 2)], new Map([['a', doc('a', 1, 1)]]), new Set());
    expect(merged.map((d) => d.id)).toEqual(['a', 'b']);
  });
});
