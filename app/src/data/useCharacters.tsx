import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { deleteCharacter, saveCharacter, watchCharacters, type CharacterDoc } from './characters';

export interface CharacterStore {
  /** `undefined` until the first answer arrives. */
  characters: CharacterDoc[] | undefined;
  save: (doc: CharacterDoc) => void;
  remove: (id: string) => void;
  /** Set when a save was refused, for example by the one-character limit. */
  problem: string | null;
}

const StoreContext = createContext<CharacterStore | null>(null);

export function CharacterStoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [characters, setCharacters] = useState<CharacterDoc[] | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setCharacters(undefined);
    if (!user) return;
    return watchCharacters(user.uid, setCharacters);
  }, [user]);

  const refused = () =>
    setProblem('That change could not be saved. Check your connection and try again.');
  const store: CharacterStore = {
    characters,
    problem,
    // The screen updates at once from the local copy, so quick taps in a row
    // each build on the last. The server catches up when it can.
    save: (doc) => {
      setProblem(null);
      setCharacters((current) => {
        const others = (current ?? []).filter((c) => c.id !== doc.id);
        return [...others, doc].sort((x, y) => x.slot - y.slot);
      });
      saveCharacter(doc).catch(refused);
    },
    remove: (id) => {
      setProblem(null);
      setCharacters((current) => current?.filter((c) => c.id !== id));
      deleteCharacter(id).catch(refused);
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
