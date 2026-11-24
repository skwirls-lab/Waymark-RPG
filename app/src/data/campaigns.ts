import type { Character } from '@waymark/rules';
import { getDb, getServices, useEmulators } from '../firebase';

export interface Membership {
  campaignId: string;
  name: string;
  role: 'warden' | 'player';
}
export interface Campaign {
  id: string;
  name: string;
  wardenUid: string;
  joinCode: string;
}
export interface Member {
  uid: string;
  role: 'warden' | 'player';
  displayName: string;
  /** Whether the Warden may change this player's sheet directly, or must ask first. */
  control: 'direct' | 'ask';
}
/** What every member may see of every character. */
export interface Summary {
  id: string;
  name: string;
  hp: { current: number; full: number };
  status: string;
  deprived: boolean;
  kind: 'owned' | 'warden';
  ownerUid: string | null;
}
/** A character the Warden runs for a player without a device. */
export interface WardenCharacter {
  id: string;
  name: string;
  description: string;
  notes: string;
  sheet: Character;
  createdAt: number;
  updatedAt: number;
}

export const WARDEN_CHARACTER_IDS = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];

type Unsubscribe = () => void;

/** Watches a collection, online or off, and reports each change. Refusals report an empty list. */
function watchCollection<T>(
  path: string,
  map: (id: string, data: Record<string, unknown>) => T,
  onChange: (items: T[]) => void,
): Unsubscribe {
  let stop: Unsubscribe = () => {};
  let cancelled = false;
  void (async () => {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
    if (cancelled) return;
    stop = fs.onSnapshot(
      fs.collection(db, path),
      (snapshot) => onChange(snapshot.docs.map((d) => map(d.id, d.data()))),
      () => onChange([]),
    );
  })();
  return () => {
    cancelled = true;
    stop();
  };
}

export const watchMemberships = (uid: string, onChange: (items: Membership[]) => void) =>
  watchCollection(
    `users/${uid}/memberships`,
    (id, d) => ({ ...(d as Omit<Membership, 'campaignId'>), campaignId: id }),
    onChange,
  );
export const watchMembers = (campaignId: string, onChange: (items: Member[]) => void) =>
  watchCollection(
    `campaigns/${campaignId}/members`,
    (id, d) => ({ ...(d as Omit<Member, 'uid'>), uid: id }),
    onChange,
  );
export const watchSummaries = (campaignId: string, onChange: (items: Summary[]) => void) =>
  watchCollection(
    `campaigns/${campaignId}/summaries`,
    (id, d) => ({ ...(d as Omit<Summary, 'id'>), id }),
    onChange,
  );
export const watchWardenCharacters = (
  campaignId: string,
  onChange: (items: WardenCharacter[]) => void,
) =>
  watchCollection(
    `campaigns/${campaignId}/characters`,
    (id, d) => ({ ...(d as Omit<WardenCharacter, 'id'>), id }),
    onChange,
  );

/** Reports the campaign, or `null` if it is gone or the user is no longer a member. */
export function watchCampaign(
  campaignId: string,
  onChange: (campaign: Campaign | null) => void,
): Unsubscribe {
  let stop: Unsubscribe = () => {};
  let cancelled = false;
  void (async () => {
    const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
    if (cancelled) return;
    stop = fs.onSnapshot(
      fs.doc(db, 'campaigns', campaignId),
      (snapshot) =>
        onChange(
          snapshot.exists()
            ? { ...(snapshot.data() as Omit<Campaign, 'id'>), id: snapshot.id }
            : null,
        ),
      () => onChange(null),
    );
  })();
  return () => {
    cancelled = true;
    stop();
  };
}

export async function saveWardenCharacter(
  campaignId: string,
  character: WardenCharacter,
): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  const { id, ...data } = character;
  await fs.setDoc(fs.doc(db, 'campaigns', campaignId, 'characters', id), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deleteWardenCharacter(campaignId: string, id: string): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  await fs.deleteDoc(fs.doc(db, 'campaigns', campaignId, 'characters', id));
}

export async function setMyControl(
  campaignId: string,
  uid: string,
  control: Member['control'],
): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  await fs.updateDoc(fs.doc(db, 'campaigns', campaignId, 'members', uid), { control });
}

/** Calls one of the campaign Cloud Functions. Throws an Error whose message is fit to show. */
async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const [{ app }, fn] = await Promise.all([getServices(), import('firebase/functions')]);
  const functions = fn.getFunctions(app, 'us-central1');
  if (useEmulators) fn.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  try {
    return (await fn.httpsCallable(functions, name)(data)).data as T;
  } catch (problem) {
    const error = problem as { code?: string; message?: string };
    const known =
      error.code && error.code !== 'functions/internal' && error.code !== 'functions/unavailable';
    throw new Error(
      known && error.message
        ? error.message
        : 'That did not work. Check your connection and try again.',
    );
  }
}

export const createCampaign = (name: string, displayName: string) =>
  call<{ campaignId: string; joinCode: string }>('createCampaign', { name, displayName });
export const joinCampaign = (code: string, displayName: string) =>
  call<{ campaignId: string }>('joinCampaign', { code, displayName });
export const leaveCampaign = (campaignId: string) => call<void>('leaveCampaign', { campaignId });
export const removeMember = (campaignId: string, memberUid: string) =>
  call<void>('removeMember', { campaignId, memberUid });
export const deleteCampaign = (campaignId: string) => call<void>('deleteCampaign', { campaignId });
export const createHandover = (campaignId: string, characterId: string) =>
  call<{ code: string }>('createHandover', { campaignId, characterId });
export const redeemHandover = (code: string, displayName: string) =>
  call<{ characterId: string; campaignId: string }>('redeemHandover', { code, displayName });
