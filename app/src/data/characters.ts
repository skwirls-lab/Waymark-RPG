import type { Character } from '@waymark/rules';
import { getDb } from '../firebase';

/** A character as stored: the rules library's sheet plus a few descriptive fields. */
export interface CharacterDoc {
  id: string;
  ownerUid: string;
  /** Which of the owner's character slots this fills. Free accounts have one. */
  slot: number;
  name: string;
  description: string;
  age: number | null;
  notes: string;
  sheet: Character;
  createdAt: number;
  updatedAt: number;
}

export const characterId = (uid: string, slot: number) => `${uid}_${slot}`;

type Unsubscribe = () => void;

/** Calls back with the user's characters now and whenever they change, online or off. */
export function watchCharacters(
  uid: string,
  onChange: (docs: CharacterDoc[]) => void,
): Unsubscribe {
  let stop: Unsubscribe = () => {};
  let cancelled = false;
  void (async () => {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
    if (cancelled) return;
    const mine = fs.query(fs.collection(db, 'characters'), fs.where('ownerUid', '==', uid));
    stop = fs.onSnapshot(mine, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({
        ...(d.data() as Omit<CharacterDoc, 'id'>),
        id: d.id,
      }));
      onChange(docs.sort((a, b) => a.slot - b.slot));
    });
  })();
  return () => {
    cancelled = true;
    stop();
  };
}

/**
 * Saves a character. The returned promise settles when the server confirms,
 * which may be much later if offline; the local copy updates at once, so
 * screens should not wait on it.
 */
export async function saveCharacter(doc: CharacterDoc): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  const { id, ...data } = doc;
  await fs.setDoc(fs.doc(db, 'characters', id), { ...data, updatedAt: Date.now() });
}

export async function deleteCharacter(id: string): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  await fs.deleteDoc(fs.doc(db, 'characters', id));
}
