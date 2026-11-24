import { status, type Character } from '@waymark/rules';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Everything the server does for campaigns. Each function takes the database
 * and the caller's uid, so it can be tested directly against the emulator.
 */

/** Letters and digits that are hard to mistake for one another when read aloud or typed. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const WARDEN_CHARACTER_LIMIT = 6;
const PAID_SLOTS = 50;

export type Random = () => number;

export function newCode(random: Random = Math.random): string {
  return Array.from(
    { length: CODE_LENGTH },
    () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)],
  ).join('');
}

/** Codes are typed by people: ignore case, spaces and dashes. */
export const normalizeCode = (code: unknown): string =>
  typeof code === 'string' ? code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

function cleanName(value: unknown, what: string, max = 60): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (name.length === 0 || name.length > max) {
    throw new HttpsError('invalid-argument', `${what} must be between 1 and ${max} characters.`);
  }
  return name;
}

async function slotsFor(db: Firestore, uid: string): Promise<number> {
  const entitlements = await db.doc(`entitlements/${uid}`).get();
  const plan = entitlements.exists ? entitlements.get('plan') : 'free';
  return plan === 'free' || plan === undefined ? 1 : PAID_SLOTS;
}

/** Reserves a code that nothing else is using, in the given collection. */
async function reserveCode(
  db: Firestore,
  collection: string,
  data: Record<string, unknown>,
  random: Random,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = newCode(random);
    try {
      await db.doc(`${collection}/${code}`).create(data);
      return code;
    } catch (problem) {
      // 6 is ALREADY_EXISTS: that code is taken, so try another.
      if ((problem as { code?: number }).code !== 6) throw problem;
    }
  }
  throw new HttpsError('resource-exhausted', 'Could not find a free code. Please try again.');
}

export interface Summary {
  name: string;
  hp: { current: number; full: number };
  status: string;
  deprived: boolean;
  kind: 'owned' | 'warden';
  ownerUid: string | null;
}

/** What other members may see of a character: name, HP and conditions. Never the full sheet. */
export function summarize(
  name: string,
  sheet: Character,
  kind: Summary['kind'],
  ownerUid: string | null,
): Summary {
  return {
    name,
    hp: { current: sheet.hp.current, full: sheet.hp.full },
    status: status(sheet),
    deprived: sheet.deprived,
    kind,
    ownerUid,
  };
}

export async function createCampaign(
  db: Firestore,
  uid: string,
  input: { name?: unknown; displayName?: unknown },
  random: Random = Math.random,
): Promise<{ campaignId: string; joinCode: string }> {
  const name = cleanName(input.name, 'The campaign name');
  const displayName = cleanName(input.displayName, 'Your name', 40);
  const slots = await slotsFor(db, uid);

  // A campaign's id is its Warden's uid and a slot number, so the limit
  // cannot be passed by two requests arriving together.
  for (let slot = 1; slot <= slots; slot++) {
    const campaignId = `${uid}_${slot}`;
    const ref = db.doc(`campaigns/${campaignId}`);
    if ((await ref.get()).exists) continue;
    const joinCode = await reserveCode(db, 'joinCodes', { campaignId }, random);
    const now = Date.now();
    try {
      const batch = db.batch();
      batch.create(ref, { name, wardenUid: uid, joinCode, createdAt: now });
      batch.set(ref.collection('members').doc(uid), {
        role: 'warden',
        displayName,
        control: 'direct',
        joinedAt: now,
      });
      batch.set(db.doc(`users/${uid}/memberships/${campaignId}`), {
        name,
        role: 'warden',
        joinedAt: now,
      });
      await batch.commit();
    } catch (problem) {
      await db.doc(`joinCodes/${joinCode}`).delete();
      if ((problem as { code?: number }).code === 6) continue;
      throw problem;
    }
    return { campaignId, joinCode };
  }
  throw new HttpsError(
    'failed-precondition',
    slots === 1
      ? 'A free account can run one campaign. Delete it to start another.'
      : 'You have reached the limit of campaigns.',
  );
}

export async function joinCampaign(
  db: Firestore,
  uid: string,
  input: { code?: unknown; displayName?: unknown },
): Promise<{ campaignId: string }> {
  const code = normalizeCode(input.code);
  const displayName = cleanName(input.displayName, 'Your name', 40);
  const found = code.length === CODE_LENGTH ? await db.doc(`joinCodes/${code}`).get() : null;
  if (!found?.exists)
    throw new HttpsError('not-found', 'No campaign has that code. Check it and try again.');

  const campaignId = found.get('campaignId') as string;
  const campaign = await db.doc(`campaigns/${campaignId}`).get();
  const member = db.doc(`campaigns/${campaignId}/members/${uid}`);
  if (!(await member.get()).exists) {
    const now = Date.now();
    const batch = db.batch();
    // New players start with "ask me first". They can change it at any time.
    batch.set(member, { role: 'player', displayName, control: 'ask', joinedAt: now });
    batch.set(db.doc(`users/${uid}/memberships/${campaignId}`), {
      name: campaign.get('name'),
      role: 'player',
      joinedAt: now,
    });
    await batch.commit();
  }
  return { campaignId };
}

async function requireWarden(db: Firestore, uid: string, campaignId: unknown) {
  if (typeof campaignId !== 'string' || campaignId === '')
    throw new HttpsError('invalid-argument', 'Which campaign?');
  const campaign = await db.doc(`campaigns/${campaignId}`).get();
  if (!campaign.exists) throw new HttpsError('not-found', 'That campaign does not exist.');
  if (campaign.get('wardenUid') !== uid)
    throw new HttpsError('permission-denied', 'Only the Warden can do that.');
  return campaign;
}

/** Removes one member and everything that ties them to the campaign. */
async function detachMember(db: Firestore, campaignId: string, memberUid: string): Promise<void> {
  const batch = db.batch();
  const theirs = await db
    .collection('characters')
    .where('ownerUid', '==', memberUid)
    .where('campaignId', '==', campaignId)
    .get();
  for (const character of theirs.docs) {
    batch.update(character.ref, { campaignId: null });
    batch.delete(db.doc(`campaigns/${campaignId}/summaries/${character.id}`));
  }
  batch.delete(db.doc(`campaigns/${campaignId}/members/${memberUid}`));
  batch.delete(db.doc(`users/${memberUid}/memberships/${campaignId}`));
  await batch.commit();
}

export async function leaveCampaign(
  db: Firestore,
  uid: string,
  input: { campaignId?: unknown },
): Promise<void> {
  const campaignId = typeof input.campaignId === 'string' ? input.campaignId : '';
  const member = campaignId ? await db.doc(`campaigns/${campaignId}/members/${uid}`).get() : null;
  if (!member?.exists) throw new HttpsError('not-found', 'You are not in that campaign.');
  if (member.get('role') === 'warden') {
    throw new HttpsError(
      'failed-precondition',
      'The Warden cannot leave. Delete the campaign instead.',
    );
  }
  await detachMember(db, campaignId, uid);
}

export async function removeMember(
  db: Firestore,
  uid: string,
  input: { campaignId?: unknown; memberUid?: unknown },
): Promise<void> {
  const campaign = await requireWarden(db, uid, input.campaignId);
  const memberUid = typeof input.memberUid === 'string' ? input.memberUid : '';
  if (memberUid === uid)
    throw new HttpsError('failed-precondition', 'The Warden cannot be removed.');
  if (!memberUid || !(await campaign.ref.collection('members').doc(memberUid).get()).exists) {
    throw new HttpsError('not-found', 'That person is not in the campaign.');
  }
  await detachMember(db, campaign.id, memberUid);
}

export async function deleteCampaign(
  db: Firestore,
  uid: string,
  input: { campaignId?: unknown },
): Promise<void> {
  const campaign = await requireWarden(db, uid, input.campaignId);
  const members = await campaign.ref.collection('members').get();
  for (const member of members.docs) await detachMember(db, campaign.id, member.id);

  const batch = db.batch();
  for (const sub of ['characters', 'summaries']) {
    for (const doc of (await campaign.ref.collection(sub).get()).docs) batch.delete(doc.ref);
  }
  for (const handover of (
    await db.collection('handovers').where('campaignId', '==', campaign.id).get()
  ).docs) {
    batch.delete(handover.ref);
  }
  batch.delete(db.doc(`joinCodes/${campaign.get('joinCode')}`));
  batch.delete(campaign.ref);
  await batch.commit();
}

/** The Warden asks for a one-time code that hands a Warden-run character to a player. */
export async function createHandover(
  db: Firestore,
  uid: string,
  input: { campaignId?: unknown; characterId?: unknown },
  random: Random = Math.random,
): Promise<{ code: string }> {
  const campaign = await requireWarden(db, uid, input.campaignId);
  const characterId = typeof input.characterId === 'string' ? input.characterId : '';
  if (
    !characterId ||
    !(await campaign.ref.collection('characters').doc(characterId).get()).exists
  ) {
    throw new HttpsError('not-found', 'That character is not in this campaign.');
  }
  const code = await reserveCode(
    db,
    'handovers',
    { campaignId: campaign.id, characterId, createdAt: Date.now() },
    random,
  );
  return { code };
}

/** Whoever redeems the code becomes the character's owner, if they have a free slot. */
export async function redeemHandover(
  db: Firestore,
  uid: string,
  input: { code?: unknown; displayName?: unknown },
): Promise<{ characterId: string; campaignId: string }> {
  const code = normalizeCode(input.code);
  const displayName = cleanName(input.displayName, 'Your name', 40);
  const slots = await slotsFor(db, uid);
  const handoverRef = db.doc(`handovers/${code || 'none'}`);

  return db.runTransaction(async (tx) => {
    const handover = await tx.get(handoverRef);
    if (!handover.exists)
      throw new HttpsError('not-found', 'That code is not valid, or has already been used.');
    const campaignId = handover.get('campaignId') as string;
    const source = db.doc(`campaigns/${campaignId}/characters/${handover.get('characterId')}`);
    const character = await tx.get(source);
    if (!character.exists) throw new HttpsError('not-found', 'That character no longer exists.');

    let slot = 0;
    for (let candidate = 1; candidate <= slots && slot === 0; candidate++) {
      if (!(await tx.get(db.doc(`characters/${uid}_${candidate}`))).exists) slot = candidate;
    }
    if (slot === 0) {
      throw new HttpsError(
        'failed-precondition',
        'You have no free character slot. A free account holds one character.',
      );
    }
    const campaign = await tx.get(db.doc(`campaigns/${campaignId}`));
    const member = db.doc(`campaigns/${campaignId}/members/${uid}`);
    const isMember = (await tx.get(member)).exists;

    const now = Date.now();
    const characterId = `${uid}_${slot}`;
    tx.set(db.doc(`characters/${characterId}`), {
      ownerUid: uid,
      slot,
      name: character.get('name'),
      description: character.get('description') ?? '',
      age: null,
      notes: character.get('notes') ?? '',
      sheet: character.get('sheet'),
      campaignId,
      createdAt: character.get('createdAt') ?? now,
      updatedAt: now,
    });
    tx.delete(source);
    tx.delete(db.doc(`campaigns/${campaignId}/summaries/${source.id}`));
    tx.delete(handoverRef);
    if (!isMember) {
      tx.set(member, { role: 'player', displayName, control: 'ask', joinedAt: now });
      tx.set(db.doc(`users/${uid}/memberships/${campaignId}`), {
        name: campaign.get('name'),
        role: 'player',
        joinedAt: now,
      });
    }
    return { characterId, campaignId };
  });
}

/**
 * Whether a stored sheet has the parts a summary needs. Security rules only
 * check that a sheet is a map, so a tampered browser could store nonsense;
 * such a character simply gets no summary.
 */
export function isSheet(sheet: unknown): sheet is Character {
  const s = sheet as Partial<Character> | null | undefined;
  const score = (v: unknown) =>
    typeof (v as { current?: unknown } | undefined)?.current === 'number';
  return (
    !!s &&
    score(s.hp) &&
    !!s.attributes &&
    score(s.attributes.str) &&
    score(s.attributes.dex) &&
    score(s.attributes.wil)
  );
}

/** Keeps the summary other members see in step with a character a player owns. */
export async function syncOwnedSummary(
  db: Firestore,
  characterId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
): Promise<void> {
  const was = before?.campaignId as string | null | undefined;
  const now = after?.campaignId as string | null | undefined;
  if (was && was !== now) await db.doc(`campaigns/${was}/summaries/${characterId}`).delete();
  if (after && now && isSheet(after.sheet)) {
    await db
      .doc(`campaigns/${now}/summaries/${characterId}`)
      .set(summarize(after.name, after.sheet, 'owned', after.ownerUid));
  }
}

/** The same, for a character the Warden runs. */
export async function syncWardenSummary(
  db: Firestore,
  campaignId: string,
  characterId: string,
  after: FirebaseFirestore.DocumentData | undefined,
): Promise<void> {
  const ref = db.doc(`campaigns/${campaignId}/summaries/${characterId}`);
  if (!after || !isSheet(after.sheet)) await ref.delete();
  else await ref.set(summarize(after.name, after.sheet, 'warden', null));
}
