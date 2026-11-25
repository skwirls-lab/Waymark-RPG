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
  /** The campaign this character is playing in, if any. */
  campaignId?: string | null;
  /** The sheet as it was before the most recent change, so that change can be undone. */
  undo?: { sheet: Character; text: string; at: number } | null;
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
    stop = fs.onSnapshot(mine, { includeMetadataChanges: true }, (snapshot) => {
      // Firestore knows whether it is hearing from the server; remember it.
      servedFromCache = snapshot.metadata.fromCache;
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
export function saveCharacter(doc: CharacterDoc): Promise<void> {
  const { id, ...data } = doc;
  // Tracked from this moment, before anything is awaited.
  return trackSave(
    `characters/${id}`,
    (async () => {
      const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
      await fs.setDoc(fs.doc(db, 'characters', id), data);
    })(),
  );
}

/** Whole-document saves that the server has not confirmed yet, by document path. */
const pendingSaves = new Map<string, Promise<void>>();

/**
 * Remembers a save until the server confirms it. A change made straight
 * after (a tap on a sheet created a moment ago) waits for it, because the
 * server cannot change, or even show, a document it has not received yet.
 */
export function trackSave(key: string, sent: Promise<void>): Promise<void> {
  const settled: Promise<void> = sent
    .then(
      () => {},
      () => {},
    )
    .finally(() => {
      if (pendingSaves.get(key) === settled) pendingSaves.delete(key);
    });
  pendingSaves.set(key, settled);
  return sent;
}

export async function deleteCharacter(id: string): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  await fs.deleteDoc(fs.doc(db, 'characters', id));
}

export type SheetChange = (sheet: Character) => Character;

/**
 * Applies a change to a stored sheet, wherever it is kept. Online, the change
 * is run on the sheet as the server has it now, inside a transaction, so two
 * people changing the same character at the same moment both keep their
 * change. Offline, the already-computed result is queued instead.
 *
 * `path` is the document's path; `fallback` is the document as this device
 * computed it, used when offline.
 */
export function changeSheetAt(
  path: string[],
  apply: SheetChange,
  meta: { text: string; at: number },
  fallback: Record<string, unknown>,
): Promise<void> {
  // Changes to one character are sent one after another, in the order made.
  const key = path.join('/');
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => sendChange(key, apply, meta, fallback));
  queues.set(key, next);
  return next;
}

const queues = new Map<string, Promise<void>>();

/** True while the latest answer from Firestore came from this device's own copy, not the server. */
let servedFromCache = false;
/** How many offline writes to each document have not yet reached the server. */
const waitingOffline = new Map<string, number>();

/**
 * Whether a change to this document should be queued instead of run as a
 * transaction. The browser's own online flag is not enough: it can say
 * "online" for a moment while the connection is still down. So this also
 * asks Firestore, and never lets a transaction jump ahead of an earlier
 * change to the same document that is still waiting to be sent.
 */
function mustQueue(key: string): boolean {
  return !navigator.onLine || servedFromCache || (waitingOffline.get(key) ?? 0) > 0;
}

async function sendChange(
  key: string,
  apply: SheetChange,
  meta: { text: string; at: number },
  fallback: Record<string, unknown>,
): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  const ref = fs.doc(db, key);
  // Queued by Firestore and sent when the connection returns. Not awaited:
  // it only settles once the server has it, which offline may be much later.
  const settle = () => waitingOffline.set(key, Math.max(0, (waitingOffline.get(key) ?? 1) - 1));
  const queueOffline = () => {
    waitingOffline.set(key, (waitingOffline.get(key) ?? 0) + 1);
    void fs.setDoc(ref, fallback).then(settle, settle);
  };

  if (mustQueue(key)) return queueOffline();
  // A save of this document still on its way must land first.
  await pendingSaves.get(key);
  try {
    await fs.runTransaction(db, async (tx) => {
      const current = await tx.get(ref);
      if (!current.exists()) throw new Error('That character no longer exists.');
      const before = current.get('sheet') as Character;
      const after = apply(before);
      tx.update(ref, {
        sheet: after,
        name: after.name,
        undo: { sheet: before, text: meta.text, at: meta.at },
        updatedAt: meta.at,
      });
    });
  } catch (problem) {
    const code = (problem as { code?: string }).code;
    // The connection dropped without the browser noticing: queue it instead.
    if (code === 'unavailable' || code === 'deadline-exceeded') return queueOffline();
    throw problem;
  }
}

/** Puts back the sheet from before the most recent change, if it is still the most recent. */
export async function undoSheetAt(path: string[], at: number): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  const ref = fs.doc(db, path.join('/'));
  await fs.runTransaction(db, async (tx) => {
    const current = await tx.get(ref);
    const undo = current.get('undo') as CharacterDoc['undo'];
    if (!current.exists() || !undo) return;
    tx.update(ref, { sheet: undo.sheet, name: undo.sheet.name, undo: null, updatedAt: at });
  });
}
