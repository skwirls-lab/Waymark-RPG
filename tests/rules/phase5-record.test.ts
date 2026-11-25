import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { serverTimestamp, Timestamp } from 'firebase/firestore';

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
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const card = (over: Record<string, unknown> = {}) => ({
  kind: 'person',
  name: 'Old Marrow',
  text: 'Keeps the ferry.',
  status: 'planned',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
const beat = (byUid: string, over: Record<string, unknown> = {}) => ({
  at: serverTimestamp(),
  text: 'The bridge fell.',
  milestone: false,
  private: false,
  cardId: null,
  byUid,
  ...over,
});

// A Warden, a player, and a stranger who is not in the campaign.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc(K).set({ name: 'The Rope Bridge', wardenUid: 'warden', joinCode: 'ABC234' });
    await db
      .doc(`${K}/members/warden`)
      .set({ role: 'warden', displayName: 'Dana', control: 'direct' });
    await db.doc(`${K}/members/player`).set({ role: 'player', displayName: 'Sam', control: 'ask' });
    await db.doc(`${K}/shared/brief`).set({ setting: 'A drowned valley.', sessions: [] });
    await db.doc(`${K}/private/notes`).set({ text: 'The ferryman is the thief.' });
    await db.doc(`${K}/private/creatures`).set({ list: [] });
    await db.doc(`${K}/private/fight`).set({ round: 1 });
    await db.doc(`${K}/cards/planned`).set(card());
    await db.doc(`${K}/cards/met`).set(card({ status: 'met', name: 'Tam' }));
    await db.doc(`${K}/cardNotes/met`).set({ text: 'Lying about the toll.' });
    await db.doc(`${K}/beats/open`).set({ ...beat('warden'), at: Timestamp.fromMillis(1000) });
    await db.doc(`${K}/beats/secret`).set({
      ...beat('warden', { private: true, text: 'Tam is lying.' }),
      at: Timestamp.fromMillis(2000),
    });
    await db
      .doc('users/warden/worlds/w1')
      .set({ name: 'Drowned Valley', content: {}, creatures: [], updatedAt: 1 });
  });
});

describe("the brief and the world's own content", () => {
  it('every member reads them; a stranger does not', async () => {
    await assertSucceeds(as('player').doc(`${K}/shared/brief`).get());
    await assertSucceeds(as('warden').doc(`${K}/shared/content`).get());
    await assertFails(as('stranger').doc(`${K}/shared/brief`).get());
  });

  it('only the Warden writes them, and only the two known documents', async () => {
    await assertSucceeds(
      as('warden').doc(`${K}/shared/brief`).set({ setting: 'New', sessions: [] }),
    );
    await assertSucceeds(as('warden').doc(`${K}/shared/content`).set({ origins: [] }));
    await assertFails(as('player').doc(`${K}/shared/brief`).set({ setting: 'Mine', sessions: [] }));
    await assertFails(as('warden').doc(`${K}/shared/other`).set({ a: 1 }));
  });
});

describe("the Warden's private papers", () => {
  it('the Warden reads and writes notes, creatures and the fight', async () => {
    for (const id of ['notes', 'creatures', 'fight']) {
      await assertSucceeds(as('warden').doc(`${K}/private/${id}`).get());
      await assertSucceeds(as('warden').doc(`${K}/private/${id}`).set({ text: 'x' }));
    }
    await assertFails(as('warden').doc(`${K}/private/other`).set({ text: 'x' }));
  });

  it('a player cannot read or write any of them, one at a time or as a list', async () => {
    for (const id of ['notes', 'creatures', 'fight']) {
      await assertFails(as('player').doc(`${K}/private/${id}`).get());
      await assertFails(as('player').doc(`${K}/private/${id}`).set({ text: 'x' }));
    }
    await assertFails(as('player').collection(`${K}/private`).get());
    await assertFails(as('stranger').doc(`${K}/private/notes`).get());
  });
});

describe('cards', () => {
  it('the Warden reads every card and its private notes', async () => {
    await assertSucceeds(as('warden').collection(`${K}/cards`).get());
    await assertSucceeds(as('warden').doc(`${K}/cardNotes/met`).get());
  });

  it('a player cannot read a planned card, by id or by listing everything', async () => {
    await assertFails(as('player').doc(`${K}/cards/planned`).get());
    await assertFails(as('player').collection(`${K}/cards`).get());
    await assertFails(as('player').collection(`${K}/cards`).where('status', '==', 'planned').get());
  });

  it('a player reads the cards that have been revealed', async () => {
    await assertSucceeds(as('player').doc(`${K}/cards/met`).get());
    await assertSucceeds(
      as('player').collection(`${K}/cards`).where('status', 'in', ['met', 'changed', 'gone']).get(),
    );
  });

  it("a player can never read the Warden's notes on a card, even a revealed one", async () => {
    await assertFails(as('player').doc(`${K}/cardNotes/met`).get());
    await assertFails(as('player').collection(`${K}/cardNotes`).get());
  });

  it('revealing a card lets the player read it', async () => {
    await assertSucceeds(
      as('warden').doc(`${K}/cards/planned`).update({ status: 'met', updatedAt: 2 }),
    );
    await assertSucceeds(as('player').doc(`${K}/cards/planned`).get());
  });

  it('only the Warden makes, changes and deletes cards', async () => {
    await assertSucceeds(as('warden').doc(`${K}/cards/new`).set(card()));
    await assertFails(
      as('player')
        .doc(`${K}/cards/mine`)
        .set(card({ status: 'met' })),
    );
    await assertFails(as('player').doc(`${K}/cards/met`).update({ text: 'Changed' }));
    await assertFails(as('player').doc(`${K}/cards/met`).delete());
    await assertSucceeds(as('warden').doc(`${K}/cards/met`).delete());
    await assertFails(as('stranger').doc(`${K}/cards/met`).get());
  });

  it('a card must be of a known kind and status, with a name', async () => {
    await assertFails(
      as('warden')
        .doc(`${K}/cards/a`)
        .set(card({ kind: 'weather' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/cards/b`)
        .set(card({ status: 'secret' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/cards/c`)
        .set(card({ name: '' })),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/cards/d`)
        .set(card({ extra: true })),
    );
  });
});

describe('the timeline', () => {
  it('a player reads the open beats and not the private ones', async () => {
    await assertSucceeds(as('player').doc(`${K}/beats/open`).get());
    await assertSucceeds(as('player').collection(`${K}/beats`).where('private', '==', false).get());
    await assertFails(as('player').doc(`${K}/beats/secret`).get());
    await assertFails(as('player').collection(`${K}/beats`).get());
  });

  it('the Warden reads them all', async () => {
    await assertSucceeds(as('warden').collection(`${K}/beats`).get());
  });

  it("the Warden adds a beat, stamped by the server's clock and no other", async () => {
    await assertSucceeds(as('warden').collection(`${K}/beats`).add(beat('warden')));
    await assertFails(
      as('warden')
        .collection(`${K}/beats`)
        .add({ ...beat('warden'), at: Timestamp.fromMillis(5) }),
    );
    await assertFails(
      as('warden')
        .collection(`${K}/beats`)
        .add(beat('warden', { text: '' })),
    );
    await assertFails(as('warden').collection(`${K}/beats`).add(beat('player')));
  });

  it('a beat can be reworded or marked, but its place in time cannot move', async () => {
    await assertSucceeds(
      as('warden').doc(`${K}/beats/open`).update({ text: 'The bridge burned.', milestone: true }),
    );
    await assertFails(
      as('warden')
        .doc(`${K}/beats/open`)
        .update({ at: Timestamp.fromMillis(1) }),
    );
    await assertSucceeds(as('warden').doc(`${K}/beats/open`).delete());
  });

  it('players and strangers cannot add or change beats', async () => {
    await assertFails(as('player').collection(`${K}/beats`).add(beat('player')));
    await assertFails(as('player').doc(`${K}/beats/open`).update({ text: 'No.' }));
    await assertFails(as('stranger').doc(`${K}/beats/open`).get());
  });
});

describe('worlds', () => {
  it('belong to the account that saved them', async () => {
    await assertSucceeds(as('warden').collection('users/warden/worlds').get());
    await assertSucceeds(
      as('warden')
        .doc('users/warden/worlds/w2')
        .set({ name: 'Rust Belt', content: {}, creatures: [], updatedAt: 2 }),
    );
    await assertSucceeds(as('warden').doc('users/warden/worlds/w1').delete());
    await assertFails(as('player').doc('users/warden/worlds/w1').get());
    await assertFails(
      as('player')
        .doc('users/warden/worlds/w3')
        .set({ name: 'X', content: {}, creatures: [], updatedAt: 2 }),
    );
  });

  it('need a name and the right shape', async () => {
    await assertFails(
      as('warden')
        .doc('users/warden/worlds/w2')
        .set({ name: '', content: {}, creatures: [], updatedAt: 2 }),
    );
    await assertFails(
      as('warden')
        .doc('users/warden/worlds/w2')
        .set({ name: 'A', content: 'x', creatures: [], updatedAt: 2 }),
    );
  });
});
