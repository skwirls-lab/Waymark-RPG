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
  sessionId: 's1',
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
    await db.doc(`${K}/shared/session`).set({ activeId: 's1' });
    await db.doc(`${K}/sessions/s1`).set({
      number: 1,
      startedAt: 1,
      endedAt: null,
      wardenKind: 'human',
      players: ['Sam'],
      summary: '',
    });
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

  it("a card can be a fight or a puzzle, and can belong to a session's plan", async () => {
    await assertSucceeds(
      as('warden')
        .doc(`${K}/cards/f1`)
        .set(card({ kind: 'fight', name: 'Ambush', sessionId: 's1' })),
    );
    await assertSucceeds(
      as('warden')
        .doc(`${K}/cards/p1`)
        .set(card({ kind: 'puzzle', name: 'The sealed door', sessionId: null })),
    );
    await assertSucceeds(
      as('warden')
        .doc(`${K}/cardNotes/f1`)
        .set({ text: '', creatureId: null, enemies: [{ creatureId: 'bandit', count: 2 }] }),
    );
    await assertFails(as('player').doc(`${K}/cardNotes/f1`).get());
  });

  it("the fight tracker's own lines on the timeline are marked as such, and nothing else may be", async () => {
    await assertSucceeds(
      as('warden')
        .collection(`${K}/beats`)
        .add({ ...beat('warden'), kind: 'fight' }),
    );
    await assertFails(
      as('warden')
        .collection(`${K}/beats`)
        .add({ ...beat('warden'), kind: 'system' }),
    );
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

describe("an AI-run campaign's story", () => {
  it('members read it; nobody writes it from a browser', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .doc(`${K}/turns/t1`)
        .set({ at: 1, order: 0, kind: 'narration', who: 'The Warden', text: 'Hello.' });
    });
    await assertSucceeds(as('player').collection(`${K}/turns`).get());
    await assertFails(as('stranger').collection(`${K}/turns`).get());
    await assertFails(
      as('warden')
        .doc(`${K}/turns/t2`)
        .set({ at: 2, order: 0, kind: 'narration', who: 'The Warden', text: 'You win.' }),
    );
    await assertFails(as('player').doc(`${K}/turns/t1`).delete());
    await assertFails(as('player').doc(`${K}/private/scene`).get());
    await assertFails(as('warden').doc(`${K}/private/scene`).set({ pending: null }));
  });
});

describe('sessions', () => {
  const session = (over: Record<string, unknown> = {}) => ({
    number: 2,
    startedAt: 5,
    endedAt: null,
    wardenKind: 'human',
    players: ['Sam'],
    summary: '',
    ...over,
  });

  it('the Warden starts and ends them; every member can read them', async () => {
    await assertSucceeds(as('warden').doc(`${K}/sessions/s2`).set(session()));
    await assertSucceeds(as('warden').doc(`${K}/shared/session`).set({ activeId: 's2' }));
    await assertSucceeds(
      as('warden')
        .doc(`${K}/sessions/s2`)
        .set(session({ endedAt: 9, summary: 'They crossed.' })),
    );
    await assertSucceeds(as('player').collection(`${K}/sessions`).get());
    await assertSucceeds(as('player').doc(`${K}/shared/session`).get());
    await assertFails(as('stranger').collection(`${K}/sessions`).get());
  });

  it('a player cannot start, end or rewrite one, and nobody can delete one', async () => {
    await assertFails(as('player').doc(`${K}/sessions/s2`).set(session()));
    await assertFails(as('player').doc(`${K}/shared/session`).set({ activeId: null }));
    await assertFails(as('player').doc(`${K}/sessions/s1`).update({ summary: 'We won.' }));
    await assertFails(as('warden').doc(`${K}/sessions/s1`).delete());
    await assertFails(
      as('warden')
        .doc(`${K}/sessions/s3`)
        .set(session({ wardenKind: 'robot' })),
    );
  });

  it('nothing goes on the timeline between sessions, or into a session that is not the one being played', async () => {
    await assertFails(
      as('warden')
        .collection(`${K}/beats`)
        .add(beat('warden', { sessionId: 'old' })),
    );
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc(`${K}/shared/session`).set({ activeId: null });
    });
    await assertFails(as('warden').collection(`${K}/beats`).add(beat('warden')));
    await assertFails(
      as('player')
        .collection(`${K}/beats`)
        .add(beat('player', { kind: 'roll' })),
    );
  });

  it("during a session a player's own rolls and sheet changes go on the timeline, in the open", async () => {
    await assertSucceeds(
      as('player')
        .collection(`${K}/beats`)
        .add(beat('player', { kind: 'roll', text: 'Sam rolled a d6: 4' })),
    );
    await assertSucceeds(
      as('player')
        .collection(`${K}/beats`)
        .add(beat('player', { kind: 'change', text: 'Wren took 2 damage.' })),
    );
    // But not a story beat, a fight line, a milestone, a private line, or one under another name.
    await assertFails(as('player').collection(`${K}/beats`).add(beat('player')));
    await assertFails(
      as('player')
        .collection(`${K}/beats`)
        .add(beat('player', { kind: 'fight' })),
    );
    await assertFails(
      as('player')
        .collection(`${K}/beats`)
        .add(beat('player', { kind: 'roll', milestone: true })),
    );
    await assertFails(
      as('player')
        .collection(`${K}/beats`)
        .add(beat('player', { kind: 'roll', private: true })),
    );
    await assertFails(
      as('player')
        .collection(`${K}/beats`)
        .add(beat('warden', { kind: 'roll' })),
    );
    await assertFails(
      as('stranger')
        .collection(`${K}/beats`)
        .add(beat('stranger', { kind: 'roll' })),
    );
  });

  it('a beat cannot be moved to another session afterwards', async () => {
    const added = await as('warden').collection(`${K}/beats`).add(beat('warden'));
    await assertFails(added.update({ sessionId: 'other' }));
    await assertSucceeds(added.update({ milestone: true }));
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
