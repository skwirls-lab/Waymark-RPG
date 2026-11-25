import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import type { Character } from '@waymark/rules';
import {
  changeSheetAt,
  deleteCharacter,
  saveCharacter,
  undoSheetAt,
  watchCharacters,
  type CharacterDoc,
} from './characters';

export interface CharacterStore {
  /** `undefined` until the first answer arrives. */
  characters: CharacterDoc[] | undefined;
  /** Saves a whole character: a new one, or fields other than the sheet. */
  save: (doc: CharacterDoc) => void;
  /** Changes a sheet. The function is re-run on the latest saved sheet; see `changeSheetAt`. */
  change: (id: string, apply: (sheet: Character) => Character, text: string) => void;
  /** Puts back the sheet from before the most recent change. */
  undo: (id: string) => void;
  remove: (id: string) => void;
  /** Set when a save was refused, for example by the one-character limit. */
  problem: string | null;
}

const StoreContext = createContext<CharacterStore | null>(null);

/**
 * Combines what the database reports with changes made here that it has not
 * caught up with yet. The database echoes every write back, sometimes after
 * a newer one has been made; an older echo must never replace newer work, or
 * the next tap would build on a stale sheet.
 */
export function mergeWithLocal(
  reported: CharacterDoc[],
  local: Map<string, CharacterDoc>,
  removed: Set<string>,
): CharacterDoc[] {
  const merged = new Map<string, CharacterDoc>();
  for (const doc of reported) {
    if (removed.has(doc.id)) continue;
    const mine = local.get(doc.id);
    if (mine && mine.updatedAt > doc.updatedAt) merged.set(doc.id, mine);
    else {
      merged.set(doc.id, doc);
      local.delete(doc.id); // the database has caught up
    }
  }
  // Removed ids the database no longer reports are settled.
  for (const id of removed) if (!reported.some((doc) => doc.id === id)) removed.delete(id);
  // Characters made here that the database has not reported yet.
  for (const [id, doc] of local) if (!merged.has(id)) merged.set(id, doc);
  return [...merged.values()].sort((a, b) => a.slot - b.slot);
}

export function CharacterStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<CharacterDoc[] | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const local = useRef(new Map<string, CharacterDoc>());
  const removed = useRef(new Set<string>());
  const reported = useRef<CharacterDoc[]>([]);
  const clock = useRef(0);

  useEffect(() => {
    setCharacters(undefined);
    local.current.clear();
    removed.current.clear();
    reported.current = [];
    if (!user) return;
    return watchCharacters(user.uid, (docs) => {
      reported.current = docs;
      setCharacters(mergeWithLocal(docs, local.current, removed.current));
    });
  }, [user]);

  const show = () =>
    setCharacters(mergeWithLocal(reported.current, local.current, removed.current));
  const refused = () =>
    setProblem('That change could not be saved. Check your connection and try again.');

  const store: CharacterStore = {
    characters,
    problem,
    // The screen updates at once from the local copy, so quick taps in a row
    // each build on the last. The server catches up when it can.
    save: (doc) => {
      setProblem(null);
      // Strictly increasing, even for two saves in the same millisecond.
      clock.current = Math.max(Date.now(), clock.current + 1);
      const stamped = { ...doc, updatedAt: clock.current };
      removed.current.delete(stamped.id);
      local.current.set(stamped.id, stamped);
      show();
      saveCharacter(stamped).catch(() => {
        local.current.delete(stamped.id);
        show();
        refused();
      });
    },
    change: (id, apply, text) => {
      setProblem(null);
      const current = (characters ?? []).find((c) => c.id === id);
      if (!current) return;
      clock.current = Math.max(Date.now(), clock.current + 1);
      const at = clock.current;
      let sheet: Character;
      try {
        sheet = apply(current.sheet);
      } catch {
        setProblem('That change is not possible right now.');
        return;
      }
      const stamped = {
        ...current,
        sheet,
        name: sheet.name,
        undo: { sheet: current.sheet, text, at },
        updatedAt: at,
      };
      local.current.set(id, stamped);
      show();
      const fallback: Record<string, unknown> = { ...stamped };
      delete fallback.id;
      changeSheetAt(['characters', id], apply, { text, at }, fallback).catch(() => {
        local.current.delete(id);
        show();
        refused();
      });
    },
    undo: (id) => {
      setProblem(null);
      const current = (characters ?? []).find((c) => c.id === id);
      if (!current?.undo) return;
      clock.current = Math.max(Date.now(), clock.current + 1);
      const at = clock.current;
      local.current.set(id, {
        ...current,
        sheet: current.undo.sheet,
        name: current.undo.sheet.name,
        undo: null,
        updatedAt: at,
      });
      show();
      undoSheetAt(['characters', id], at).catch(() => {
        local.current.delete(id);
        show();
        refused();
      });
    },
    remove: (id) => {
      setProblem(null);
      local.current.delete(id);
      removed.current.add(id);
      show();
      deleteCharacter(id).catch(() => {
        removed.current.delete(id);
        show();
        refused();
      });
    },
  };
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** Lets tests supply characters without a database. */
export function CharacterStoreValue({
  value,
  children,
}: {
  value: CharacterStore;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useCharacterStore(): CharacterStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useCharacterStore must be used inside a CharacterStoreProvider');
  return store;
}
