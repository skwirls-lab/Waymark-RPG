import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-waymark',
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});
afterAll(() => env.cleanup());

const K = 'campaigns/k1';
const character = (ownerUid: string, over: Record<string, unknown> = {}) => ({
  ownerUid,
  slot: 1,
  name: 'Wren',
  description: '',
  age: null,
  notes: '',
  sheet: { hp: { current: 4, full: 4 } },
  campaignId: 'k1',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
const request = (over: Record<string, unknown> = {}) => ({
  fromUid: 'warden',
  toUid: 'asker',
  characterId: 'asker_1',
  kind: 'change',
  text: 'Take 5 damage',
  action: { type: 'damage', amount: 5 },
  status: 'pending',
  createdAt: 1,
  ...over,
});

// A Warden; "direct", who lets the Warden change their sheet; "asker", who
// asks to be asked first; and a stranger who is not in the campaign.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(K).set({ name: 'The Rope Bridge', wardenUid: 'warden', joinCode: 'ABC234' });
    await db
      .doc(`${K}/members/warden`)
      .set({ role: 'warden', displayName: 'Dana', control: 'direct' });
    await db
      .doc(`${K}/members/direct`)
      .set({ role: 'player', displayName: 'Sam', control: 'direct' });
    await db.doc(`${K}/members/asker`).set({ role: 'player', displayName: 'Jo', control: 'ask' });
    await db.doc('characters/direct_1').set(character('direct'));
    await db.doc('characters/asker_1').set(character('asker', { name: 'Tobin' }));
    await db.doc('characters/stranger_1').set(character('stranger', { campaignId: null }));
    await db.doc(`${K}/requests/r1`).set(request());
    await db
      .doc(`${K}/log/e1`)
      .set({ at: 1, byUid: 'direct', byName: 'Sam', text: 'Sam rolled a d20: 14' });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const newSheet = {
  sheet: { hp: { current: 1, full: 4 } },
  undo: { sheet: { hp: { current: 4, full: 4 } }, text: 'x', at: 2 },
  updatedAt: 2,
};

describe("phase 4: the Warden changing a player's sheet", () => {
  it('is allowed for a player who chose "directly"', async () => {
    await assertSucceeds(as('warden').doc('characters/direct_1').update(newSheet));
  });

  it('is refused for a player who chose "ask me first"', async () => {
    await assertFails(as('warden').doc('characters/asker_1').update(newSheet));
  });

  it("follows the player's choice as soon as they change it", async () => {
    await as('asker').doc(`${K}/members/asker`).update({ control: 'direct' });
    await assertSucceeds(as('warden').doc('characters/asker_1').update(newSheet));
    await as('direct').doc(`${K}/members/direct`).update({ control: 'ask' });
    await assertFails(as('warden').doc('characters/direct_1').update(newSheet));
  });

  it('covers the sheet only: not the owner, slot, campaign, notes or description', async () => {
    const doc = as('warden').doc('characters/direct_1');
    await assertFails(doc.update({ ownerUid: 'warden' }));
    await assertFails(doc.update({ slot: 2 }));
    await assertFails(doc.update({ campaignId: null }));
    await assertFails(doc.update({ notes: 'read your diary' }));
    await assertFails(doc.update({ description: 'changed' }));
    await assertFails(doc.update({ sheet: 'not a sheet' }));
    await assertFails(doc.update({ name: '' }));
    await assertFails(doc.delete());
  });

  it('is refused to other players, and to the Warden for characters outside the campaign', async () => {
    await assertFails(as('asker').doc('characters/direct_1').update(newSheet));
    await assertFails(as('warden').doc('characters/stranger_1').update(newSheet));
  });

  it('lets the Warden list every sheet in the campaign, and nobody else', async () => {
    const inCampaign = (uid: string) =>
      as(uid).collection('characters').where('campaignId', '==', 'k1').get();
    await assertSucceeds(inCampaign('warden'));
    await assertFails(inCampaign('direct'));
    await assertFails(inCampaign('stranger'));
  });

  it('still lets the owner change their own sheet, and undo', async () => {
    await assertSucceeds(as('asker').doc('characters/asker_1').update(newSheet));
    await assertSucceeds(as('asker').doc('characters/asker_1').update({ undo: null }));
  });
});

describe('phase 4: requests from the Warden', () => {
  it('can be created only by the Warden, as pending, to a member', async () => {
    await assertSucceeds(as('warden').doc(`${K}/requests/r2`).set(request()));
    await assertSucceeds(
      as('warden')
        .doc(`${K}/requests/r3`)
        .set(request({ kind: 'save', text: 'Make a Dexterity save' })),
    );
    await assertFails(
      as('direct')
        .doc(`${K}/requests/r4`)
        .set(request({ fromUid: 'direct' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/requests/r5`)
        .set(request({ status: 'accepted' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/requests/r6`)
        .set(request({ toUid: 'stranger' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/requests/r7`)
        .set(request({ fromUid: 'someone-else' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/requests/r8`)
        .set(request({ kind: 'anything' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/requests/r9`)
        .set(request({ text: 'x'.repeat(301) })),
    );
  });

  it('can be read by the Warden and by the player they are for, and by no one else', async () => {
    await assertSucceeds(as('warden').doc(`${K}/requests/r1`).get());
    await assertSucceeds(as('asker').doc(`${K}/requests/r1`).get());
    await assertSucceeds(
      as('asker').collection(`${K}/requests`).where('toUid', '==', 'asker').get(),
    );
    await assertFails(as('direct').doc(`${K}/requests/r1`).get());
    await assertFails(as('direct').collection(`${K}/requests`).get());
    await assertFails(as('stranger').doc(`${K}/requests/r1`).get());
  });

  it('can be answered only by the player they are for', async () => {
    await assertFails(as('direct').doc(`${K}/requests/r1`).update({ status: 'accepted' }));
    await assertFails(as('warden').doc(`${K}/requests/r1`).update({ status: 'accepted' }));
    await assertSucceeds(
      as('asker')
        .doc(`${K}/requests/r1`)
        .update({ status: 'accepted', result: 'HP 0', answeredAt: 2 }),
    );
  });

  it('can be answered once, with a real answer, changing nothing else', async () => {
    const doc = as('asker').doc(`${K}/requests/r1`);
    await assertFails(doc.update({ status: 'pending' }));
    await assertFails(doc.update({ status: 'whatever' }));
    await assertFails(doc.update({ status: 'declined', action: { type: 'heal', hp: true } }));
    await assertFails(doc.update({ status: 'declined', text: 'Take 0 damage' }));
    await assertSucceeds(doc.update({ status: 'declined', answeredAt: 2 }));
    await assertFails(doc.update({ status: 'accepted' }));
  });

  it('can be cleared away by the Warden only', async () => {
    await assertFails(as('asker').doc(`${K}/requests/r1`).delete());
    await assertSucceeds(as('warden').doc(`${K}/requests/r1`).delete());
  });
});

describe('phase 4: the activity feed', () => {
  const entry = (byUid: string, over: Record<string, unknown> = {}) => ({
    at: 2,
    byUid,
    byName: 'X',
    text: 'Rolled a d6: 4',
    ...over,
  });

  it('can be read by members and not by strangers', async () => {
    for (const uid of ['warden', 'direct', 'asker'])
      await assertSucceeds(as(uid).collection(`${K}/log`).get());
    await assertFails(as('stranger').collection(`${K}/log`).get());
  });

  it('can be added to by members, in their own name', async () => {
    await assertSucceeds(as('direct').collection(`${K}/log`).add(entry('direct')));
    await assertFails(as('direct').collection(`${K}/log`).add(entry('warden')));
    await assertFails(as('stranger').collection(`${K}/log`).add(entry('stranger')));
  });

  it('takes only short text entries', async () => {
    await assertFails(
      as('direct')
        .collection(`${K}/log`)
        .add(entry('direct', { text: '' })),
    );
    await assertFails(
      as('direct')
        .collection(`${K}/log`)
        .add(entry('direct', { text: 'x'.repeat(501) })),
    );
    await assertFails(
      as('direct')
        .collection(`${K}/log`)
        .add(entry('direct', { sheet: {} })),
    );
  });

  it('cannot be altered or erased by anyone, the Warden included', async () => {
    for (const uid of ['warden', 'direct']) {
      await assertFails(as(uid).doc(`${K}/log/e1`).update({ text: 'Rewritten' }));
      await assertFails(as(uid).doc(`${K}/log/e1`).delete());
    }
  });
});

describe('phase 4: presence', () => {
  it('lets a member say they are here, and members see who is', async () => {
    await assertSucceeds(
      as('direct').doc(`${K}/presence/direct`).set({ at: 5, displayName: 'Sam' }),
    );
    await assertSucceeds(as('asker').collection(`${K}/presence`).get());
  });

  it('cannot be set for someone else, by a stranger, or with extra fields', async () => {
    await assertFails(as('direct').doc(`${K}/presence/asker`).set({ at: 5, displayName: 'Jo' }));
    await assertFails(
      as('stranger').doc(`${K}/presence/stranger`).set({ at: 5, displayName: 'X' }),
    );
    await assertFails(
      as('direct').doc(`${K}/presence/direct`).set({ at: 5, displayName: 'Sam', role: 'warden' }),
    );
    await assertFails(as('stranger').collection(`${K}/presence`).get());
  });
});
