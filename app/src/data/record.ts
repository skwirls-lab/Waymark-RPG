import type {
  Fight,
  CustomAbility,
  CustomAffinity,
  CustomCreature,
  CustomGear,
  CustomOrigin,
} from '@waymark/rules';
import { useEffect, useState } from 'react';
import { getDb } from '../firebase';
import { watchCollection, watchDoc } from './campaigns';

/** The mission for one session or adventure. */
export interface SessionBrief {
  id: string;
  title: string;
  mission: string;
  stakes: string;
  expected: string;
}
/** The setting for the whole campaign, and a brief for each session. */
export interface Brief {
  setting: string;
  sessions: SessionBrief[];
}
export const EMPTY_BRIEF: Brief = { setting: '', sessions: [] };

/** One thing that happened. The timeline is these, in order. */
export interface Beat {
  id: string;
  at: number;
  text: string;
  milestone: boolean;
  /** Only the Warden sees it. */
  private: boolean;
  cardId: string | null;
  byUid: string;
  /** Set on lines the fight tracker adds by itself. */
  kind?: 'fight';
}

export const CARD_KINDS = [
  'person',
  'place',
  'creature',
  'fight',
  'puzzle',
  'faction',
  'item',
  'thread',
] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export const CARD_KIND_LABEL: Record<CardKind, string> = {
  person: 'Person',
  place: 'Place',
  creature: 'Creature',
  fight: 'Fight',
  puzzle: 'Puzzle or obstacle',
  faction: 'Faction',
  item: 'Item',
  thread: 'Open thread',
};
export const CARD_STATUSES = ['planned', 'met', 'changed', 'gone'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];
export const CARD_STATUS_LABEL: Record<CardStatus, string> = {
  planned: 'Planned (hidden from players)',
  met: 'Met',
  changed: 'Changed',
  gone: 'Gone',
};
export interface Card {
  id: string;
  kind: CardKind;
  name: string;
  text: string;
  status: CardStatus;
  /** The session brief this card is part of the plan for, if any. */
  sessionId?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** What only the Warden keeps about a card, beyond a private note. */
export interface CardDetails {
  /** For a creature card: which creature's numbers it uses. */
  creatureId?: string | null;
  /** For an item card: which piece of the world's gear it is. */
  gearId?: string | null;
  /** For a fight card: who is in it. */
  enemies?: { creatureId: string; count: number }[];
}

/** A world's own Origins, Affinities, Abilities and gear. */
export type { Combatant, Fight } from '@waymark/rules';

export interface Content {
  origins: CustomOrigin[];
  affinities: CustomAffinity[];
  abilities: CustomAbility[];
  gear: CustomGear[];
}
export const EMPTY_CONTENT: Content = { origins: [], affinities: [], abilities: [], gear: [] };

/** A set of custom content, saved to reuse in other campaigns. */
export interface World {
  id: string;
  name: string;
  content: Content;
  creatures: CustomCreature[];
  updatedAt: number;
}

const newId = () => crypto.randomUUID().slice(0, 12);
export const contentId = () => `x-${newId()}`;

async function tools() {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  return { db, fs };
}

/** Replaces one of the campaign's single documents. */
async function put(campaignId: string, path: string, value: object): Promise<void> {
  const { db, fs } = await tools();
  // Firestore refuses `undefined`; a round trip through JSON drops it.
  await fs.setDoc(fs.doc(db, `campaigns/${campaignId}/${path}`), JSON.parse(JSON.stringify(value)));
}

export const saveBrief = (campaignId: string, brief: Brief) =>
  put(campaignId, 'shared/brief', brief);
export const saveContent = (campaignId: string, content: Content) =>
  put(campaignId, 'shared/content', content);
export const saveNotes = (campaignId: string, text: string) =>
  put(campaignId, 'private/notes', { text });
export const saveCreatures = (campaignId: string, list: CustomCreature[]) =>
  put(campaignId, 'private/creatures', { list });
export const saveFight = (campaignId: string, fight: Fight | null) =>
  put(campaignId, 'private/fight', { fight });

export async function addBeat(
  campaignId: string,
  byUid: string,
  beat: Pick<Beat, 'text' | 'milestone' | 'private' | 'cardId'> & { kind?: 'fight' },
): Promise<void> {
  const { db, fs } = await tools();
  await fs.addDoc(fs.collection(db, `campaigns/${campaignId}/beats`), {
    ...beat,
    byUid,
    at: fs.serverTimestamp(),
  });
}
export async function updateBeat(
  campaignId: string,
  id: string,
  patch: Partial<Pick<Beat, 'text' | 'milestone' | 'private'>>,
): Promise<void> {
  const { db, fs } = await tools();
  await fs.updateDoc(fs.doc(db, `campaigns/${campaignId}/beats/${id}`), patch);
}
export async function deleteBeat(campaignId: string, id: string): Promise<void> {
  const { db, fs } = await tools();
  await fs.deleteDoc(fs.doc(db, `campaigns/${campaignId}/beats/${id}`));
}

/** Saves a card and, separately, what only the Warden knows about it. */
export async function saveCard(
  campaignId: string,
  card: Omit<Card, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number },
  notes: string,
  details: CardDetails = {},
): Promise<void> {
  const { db, fs } = await tools();
  const id = card.id ?? newId();
  const now = Date.now();
  const batch = fs.writeBatch(db);
  batch.set(fs.doc(db, `campaigns/${campaignId}/cards/${id}`), {
    kind: card.kind,
    name: card.name,
    text: card.text,
    status: card.status,
    sessionId: card.sessionId ?? null,
    createdAt: card.createdAt ?? now,
    updatedAt: now,
  });
  batch.set(fs.doc(db, `campaigns/${campaignId}/cardNotes/${id}`), {
    text: notes,
    creatureId: details.creatureId ?? null,
    gearId: details.gearId ?? null,
    enemies: details.enemies ?? [],
  });
  await batch.commit();
}
export async function setCardStatus(campaignId: string, id: string, status: CardStatus) {
  const { db, fs } = await tools();
  await fs.updateDoc(fs.doc(db, `campaigns/${campaignId}/cards/${id}`), {
    status,
    updatedAt: Date.now(),
  });
}
export async function deleteCard(campaignId: string, id: string): Promise<void> {
  const { db, fs } = await tools();
  const batch = fs.writeBatch(db);
  batch.delete(fs.doc(db, `campaigns/${campaignId}/cards/${id}`));
  batch.delete(fs.doc(db, `campaigns/${campaignId}/cardNotes/${id}`));
  await batch.commit();
}

/** Saves a world, new or existing, and returns its id. */
export async function saveWorld(
  uid: string,
  world: Omit<World, 'id' | 'updatedAt'> & { id?: string },
): Promise<string> {
  const { db, fs } = await tools();
  const { id = newId(), ...rest } = world;
  await fs.setDoc(
    fs.doc(db, `users/${uid}/worlds/${id}`),
    JSON.parse(JSON.stringify({ ...rest, updatedAt: Date.now() })),
  );
  return id;
}
export async function deleteWorld(uid: string, id: string): Promise<void> {
  const { db, fs } = await tools();
  await fs.deleteDoc(fs.doc(db, `users/${uid}/worlds/${id}`));
}

const millis = (value: unknown): number =>
  typeof (value as { toMillis?: unknown } | null)?.toMillis === 'function'
    ? (value as { toMillis: () => number }).toMillis()
    : Date.now();

/** Oldest first; beats stamped in the same millisecond keep one fixed order everywhere. */
export const inOrder = (beats: Beat[]): Beat[] =>
  [...beats].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));

function useDoc<T>(path: string | null, empty: T): T {
  const [value, setValue] = useState<T>(empty);
  useEffect(() => {
    if (!path) {
      setValue(empty);
      return;
    }
    return watchDoc<T>(path, (found) => setValue(found ?? empty));
    // `empty` is a constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return value;
}

/** The brief, as every member sees it. */
export const useBrief = (campaignId: string): Brief => {
  const brief = useDoc<Partial<Brief>>(`campaigns/${campaignId}/shared/brief`, EMPTY_BRIEF);
  return { ...EMPTY_BRIEF, ...brief };
};
/** The campaign's own Origins, Affinities, Abilities and gear. `null` campaign: none. */
export const useContent = (campaignId: string | null | undefined): Content => {
  const content = useDoc<Partial<Content>>(
    campaignId ? `campaigns/${campaignId}/shared/content` : null,
    EMPTY_CONTENT,
  );
  return { ...EMPTY_CONTENT, ...content };
};
const NO_NOTES = { text: '' };
const NO_CREATURES = { list: [] as CustomCreature[] };
const NO_FIGHT = { fight: null as Fight | null };
/** Warden only. */
export const useNotes = (campaignId: string, enabled: boolean): string =>
  useDoc(enabled ? `campaigns/${campaignId}/private/notes` : null, NO_NOTES).text;
/** Warden only. */
export const useCreatures = (campaignId: string, enabled: boolean): CustomCreature[] =>
  useDoc(enabled ? `campaigns/${campaignId}/private/creatures` : null, NO_CREATURES).list;
/** Warden only. */
export const useFight = (campaignId: string, enabled: boolean): Fight | null =>
  useDoc(enabled ? `campaigns/${campaignId}/private/fight` : null, NO_FIGHT).fight;

/** The timeline, oldest first. Players get only the beats that are not private. */
export function useBeats(campaignId: string, isWarden: boolean): Beat[] {
  const [beats, setBeats] = useState<Beat[]>([]);
  useEffect(
    () =>
      watchCollection<Beat>(
        `campaigns/${campaignId}/beats`,
        (id, d) => ({ ...(d as Omit<Beat, 'id' | 'at'>), id, at: millis(d.at) }),
        (items) => setBeats(inOrder(items)),
        (fs) => (isWarden ? [] : [fs.where('private', '==', false)]),
      ),
    [campaignId, isWarden],
  );
  return beats;
}

/** Cards by name. Players get only those the Warden has revealed. */
export function useCards(campaignId: string, isWarden: boolean): Card[] {
  const [cards, setCards] = useState<Card[]>([]);
  useEffect(
    () =>
      watchCollection<Card>(
        `campaigns/${campaignId}/cards`,
        (id, d) => ({ ...(d as Omit<Card, 'id'>), id }),
        (items) => setCards(items.sort((a, b) => a.name.localeCompare(b.name))),
        (fs) => (isWarden ? [] : [fs.where('status', 'in', ['met', 'changed', 'gone'])]),
      ),
    [campaignId, isWarden],
  );
  return cards;
}

/** Warden only: the private note on each card, by card id. */
export function useCardNotes(campaignId: string, enabled: boolean): Record<string, string> {
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) {
      setNotes({});
      return;
    }
    return watchCollection<[string, string]>(
      `campaigns/${campaignId}/cardNotes`,
      (id, d) => [id, String(d.text ?? '')],
      (items) => setNotes(Object.fromEntries(items)),
    );
  }, [campaignId, enabled]);
  return notes;
}

/** Warden only: the creature or enemies behind each card, by card id. */
export function useCardDetails(campaignId: string, enabled: boolean): Record<string, CardDetails> {
  const [details, setDetails] = useState<Record<string, CardDetails>>({});
  useEffect(() => {
    if (!enabled) {
      setDetails({});
      return;
    }
    return watchCollection<[string, CardDetails]>(
      `campaigns/${campaignId}/cardNotes`,
      (id, d) => [
        id,
        {
          creatureId: (d.creatureId as string | null | undefined) ?? null,
          gearId: (d.gearId as string | null | undefined) ?? null,
          enemies: Array.isArray(d.enemies) ? (d.enemies as CardDetails['enemies']) : [],
        },
      ],
      (items) => setDetails(Object.fromEntries(items)),
    );
  }, [campaignId, enabled]);
  return details;
}

export function useWorlds(uid: string, enabled: boolean): World[] {
  const [worlds, setWorlds] = useState<World[]>([]);
  useEffect(() => {
    if (!enabled) {
      setWorlds([]);
      return;
    }
    return watchCollection<World>(
      `users/${uid}/worlds`,
      (id, d) => ({ ...(d as Omit<World, 'id'>), id }),
      (items) => setWorlds(items.sort((a, b) => a.name.localeCompare(b.name))),
    );
  }, [uid, enabled]);
  return worlds;
}
