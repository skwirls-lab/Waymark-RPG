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

const CAMPAIGN = 'campaigns/k1';
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
const wardenCharacter = (over: Record<string, unknown> = {}) => ({
  name: 'Pip',
  description: '',
  notes: '',
  sheet: { hp: { current: 3, full: 3 } },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

// The cast: a Warden, two players (one a guest), and a stranger who is signed in but not a member.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db
      .doc(CAMPAIGN)
      .set({ name: 'The Rope Bridge', wardenUid: 'warden', joinCode: 'ABC234' });
    await db
      .doc(`${CAMPAIGN}/members/warden`)
      .set({ role: 'warden', displayName: 'Dana', control: 'direct' });
    await db
      .doc(`${CAMPAIGN}/members/player`)
      .set({ role: 'player', displayName: 'Sam', control: 'ask' });
    await db
      .doc(`${CAMPAIGN}/members/guest`)
      .set({ role: 'player', displayName: 'Jo', control: 'ask' });
    await db.doc('characters/player_1').set(character('player'));
    await db.doc('characters/guest_1').set(character('guest', { name: 'Tobin' }));
    await db.doc('characters/stranger_1').set(character('stranger', { campaignId: null }));
    await db
      .doc(`${CAMPAIGN}/summaries/player_1`)
      .set({ name: 'Wren', hp: { current: 4, full: 4 } });
    await db.doc(`${CAMPAIGN}/characters/w1`).set(wardenCharacter());
    await db.doc('users/player/memberships/k1').set({ name: 'The Rope Bridge', role: 'player' });
    await db.doc('joinCodes/ABC234').set({ campaignId: 'k1' });
    await db.doc('handovers/XYZ789').set({ campaignId: 'k1', characterId: 'w1' });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const everyone = ['warden', 'player', 'guest', 'stranger'] as const;
const members = ['warden', 'player', 'guest'] as const;

describe('phase 3: the campaign record', () => {
  it('can be read by every member', async () => {
    for (const uid of members) await assertSucceeds(as(uid).doc(CAMPAIGN).get());
  });
  it('cannot be read by a stranger or a signed-out visitor', async () => {
    await assertFails(as('stranger').doc(CAMPAIGN).get());
    await assertFails(env.unauthenticatedContext().firestore().doc(CAMPAIGN).get());
  });
  it('cannot be written from the browser by anyone, the Warden included', async () => {
    for (const uid of everyone) {
      await assertFails(as(uid).doc(CAMPAIGN).update({ name: 'Mine' }));
      await assertFails(as(uid).doc(CAMPAIGN).delete());
      await assertFails(as(uid).doc(`campaigns/${uid}_1`).set({ name: 'New', wardenUid: uid }));
    }
  });
});

describe('phase 3: the member list', () => {
  it('can be read by members and not by strangers', async () => {
    for (const uid of members)
      await assertSucceeds(as(uid).collection(`${CAMPAIGN}/members`).get());
    await assertFails(as('stranger').collection(`${CAMPAIGN}/members`).get());
  });
  it('lets a member change their own permission choice and name', async () => {
    await assertSucceeds(
      as('player').doc(`${CAMPAIGN}/members/player`).update({ control: 'direct' }),
    );
    await assertSucceeds(
      as('player').doc(`${CAMPAIGN}/members/player`).update({ displayName: 'Samuel' }),
    );
  });
  it('refuses a permission choice that is not one of the two', async () => {
    await assertFails(
      as('player').doc(`${CAMPAIGN}/members/player`).update({ control: 'anything' }),
    );
    await assertFails(as('player').doc(`${CAMPAIGN}/members/player`).update({ displayName: '' }));
  });
  it("lets nobody change someone else's choice, the Warden included", async () => {
    await assertFails(as('warden').doc(`${CAMPAIGN}/members/player`).update({ control: 'direct' }));
    await assertFails(as('guest').doc(`${CAMPAIGN}/members/player`).update({ control: 'direct' }));
  });
  it('lets nobody promote themselves, add themselves, or remove anyone from the browser', async () => {
    await assertFails(as('player').doc(`${CAMPAIGN}/members/player`).update({ role: 'warden' }));
    await assertFails(
      as('stranger')
        .doc(`${CAMPAIGN}/members/stranger`)
        .set({ role: 'player', displayName: 'X', control: 'ask' }),
    );
    await assertFails(as('warden').doc(`${CAMPAIGN}/members/player`).delete());
    await assertFails(as('player').doc(`${CAMPAIGN}/members/player`).delete());
  });
});

describe("phase 3: a player's character in a campaign", () => {
  it('is readable in full by its owner and by the Warden', async () => {
    await assertSucceeds(as('player').doc('characters/player_1').get());
    await assertSucceeds(as('warden').doc('characters/player_1').get());
  });
  it('is not readable in full by other members or strangers', async () => {
    await assertFails(as('guest').doc('characters/player_1').get());
    await assertFails(as('stranger').doc('characters/player_1').get());
  });
  it('cannot be changed or deleted by the Warden in this phase', async () => {
    await assertFails(as('warden').doc('characters/player_1').update({ name: 'Changed' }));
    await assertFails(as('warden').doc('characters/player_1').delete());
  });
  it('outside any campaign, is not readable by a Warden', async () => {
    await assertFails(as('warden').doc('characters/stranger_1').get());
  });
  it('can be taken out of the campaign by its owner', async () => {
    await assertSucceeds(
      as('player')
        .doc('characters/player_1')
        .set(character('player', { campaignId: null })),
    );
  });
  it('cannot be placed in a campaign its owner does not belong to', async () => {
    await assertFails(
      as('stranger')
        .doc('characters/stranger_1')
        .set(character('stranger', { campaignId: 'k1' })),
    );
  });
});

describe('phase 3: summaries', () => {
  it('can be read by every member', async () => {
    for (const uid of members)
      await assertSucceeds(as(uid).doc(`${CAMPAIGN}/summaries/player_1`).get());
  });
  it('cannot be read by a stranger', async () => {
    await assertFails(as('stranger').doc(`${CAMPAIGN}/summaries/player_1`).get());
  });
  it('cannot be written from the browser by anyone', async () => {
    for (const uid of everyone)
      await assertFails(as(uid).doc(`${CAMPAIGN}/summaries/player_1`).set({ name: 'Fake' }));
  });
});

describe('phase 3: characters the Warden runs', () => {
  it('can be read, created, changed and deleted by the Warden', async () => {
    await assertSucceeds(as('warden').doc(`${CAMPAIGN}/characters/w1`).get());
    await assertSucceeds(
      as('warden')
        .doc(`${CAMPAIGN}/characters/w2`)
        .set(wardenCharacter({ name: 'Orla' })),
    );
    await assertSucceeds(
      as('warden').doc(`${CAMPAIGN}/characters/w1`).update({ name: 'Pip the Brave' }),
    );
    await assertSucceeds(as('warden').doc(`${CAMPAIGN}/characters/w2`).delete());
  });
  it('are capped at six: ids outside w1 to w6 are refused', async () => {
    await assertSucceeds(as('warden').doc(`${CAMPAIGN}/characters/w6`).set(wardenCharacter()));
    for (const id of ['w7', 'w0', 'w10', 'x1', 'w', 'extra']) {
      await assertFails(as('warden').doc(`${CAMPAIGN}/characters/${id}`).set(wardenCharacter()));
    }
  });
  it('must be well formed', async () => {
    await assertFails(
      as('warden')
        .doc(`${CAMPAIGN}/characters/w2`)
        .set(wardenCharacter({ name: '' })),
    );
    await assertFails(
      as('warden')
        .doc(`${CAMPAIGN}/characters/w2`)
        .set(wardenCharacter({ sheet: 'no' })),
    );
    await assertFails(
      as('warden')
        .doc(`${CAMPAIGN}/characters/w2`)
        .set(wardenCharacter({ ownerUid: 'warden' })),
    );
  });
  it('cannot be read or written in full by players or strangers', async () => {
    for (const uid of ['player', 'guest', 'stranger']) {
      await assertFails(as(uid).doc(`${CAMPAIGN}/characters/w1`).get());
      await assertFails(as(uid).doc(`${CAMPAIGN}/characters/w2`).set(wardenCharacter()));
      await assertFails(as(uid).doc(`${CAMPAIGN}/characters/w1`).delete());
    }
  });
});

describe('phase 3: memberships, join codes and hand-over codes', () => {
  it("a user can read their own list of campaigns and nobody else's", async () => {
    await assertSucceeds(as('player').collection('users/player/memberships').get());
    await assertFails(as('warden').collection('users/player/memberships').get());
  });
  it('a membership cannot be written from the browser', async () => {
    await assertFails(
      as('player').doc('users/player/memberships/k9').set({ name: 'X', role: 'warden' }),
    );
  });
  it('join codes and hand-over codes cannot be read, listed or written by anyone', async () => {
    for (const uid of everyone) {
      await assertFails(as(uid).doc('joinCodes/ABC234').get());
      await assertFails(as(uid).collection('joinCodes').get());
      await assertFails(as(uid).doc('joinCodes/NEW234').set({ campaignId: 'k1' }));
      await assertFails(as(uid).doc('handovers/XYZ789').get());
      await assertFails(as(uid).collection('handovers').get());
    }
  });
});
