import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { serverTimestamp } from 'firebase/firestore';
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

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const character = (ownerUid: string, slot: number, over: Record<string, unknown> = {}) => ({
  ownerUid,
  slot,
  name: `Character ${slot}`,
  description: '',
  age: null,
  notes: '',
  sheet: { hp: { current: 4, full: 4 } },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
const seed = (write: (db: FirebaseFirestore.Firestore) => Promise<unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await write(ctx.firestore() as never);
  });

// "lapsed" was on the paid plan and is now free, with three characters and
// two campaigns. "payer" is on the paid plan.
beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (db) => {
    await db.doc('entitlements/payer').set({ plan: 'paid', status: 'active' });
    await db.doc('entitlements/lapsed').set({ plan: 'free', status: 'none' });
    for (const slot of [1, 2, 3])
      await db.doc(`characters/lapsed_${slot}`).set(character('lapsed', slot));
    for (const slot of [1, 2]) {
      const id = `lapsed_${slot}`;
      await db
        .doc(`campaigns/${id}`)
        .set({ name: `Campaign ${slot}`, wardenUid: 'lapsed', slot, joinCode: `ABC23${slot}` });
      await db
        .doc(`campaigns/${id}/members/lapsed`)
        .set({ role: 'warden', displayName: 'Lee', control: 'direct' });
      await db
        .doc(`campaigns/${id}/members/player`)
        .set({ role: 'player', displayName: 'Sam', control: 'direct' });
      await db.doc(`campaigns/${id}/shared/brief`).set({ setting: 'Old', sessions: [] });
    }
    await db.doc('characters/player_1').set(character('player', 1, { campaignId: 'lapsed_2' }));
  });
});

describe('limits by plan', () => {
  it('a free account makes one character, in the first slot only', async () => {
    await assertSucceeds(as('new').doc('characters/new_1').set(character('new', 1)));
    await assertFails(as('new').doc('characters/new_2').set(character('new', 2)));
    await assertFails(as('new').doc('characters/new_0').set(character('new', 0)));
  });

  it('a paid account makes up to fifty', async () => {
    await assertSucceeds(as('payer').doc('characters/payer_2').set(character('payer', 2)));
    await assertSucceeds(as('payer').doc('characters/payer_50').set(character('payer', 50)));
    await assertFails(as('payer').doc('characters/payer_51').set(character('payer', 51)));
  });

  it('nobody can write their own plan', async () => {
    await assertFails(as('new').doc('entitlements/new').set({ plan: 'paid' }));
    await assertFails(as('lapsed').doc('entitlements/lapsed').update({ plan: 'paid' }));
    await assertSucceeds(as('lapsed').doc('entitlements/lapsed').get());
    await assertFails(as('new').doc('entitlements/lapsed').get());
  });
});

describe('after a paid plan ends, nothing is deleted', () => {
  it('every character can still be read and deleted', async () => {
    for (const slot of [1, 2, 3])
      await assertSucceeds(as('lapsed').doc(`characters/lapsed_${slot}`).get());
    await assertSucceeds(as('lapsed').doc('characters/lapsed_3').delete());
  });

  it('the first character stays in use; the others are read-only', async () => {
    await assertSucceeds(as('lapsed').doc('characters/lapsed_1').update({ notes: 'Still mine.' }));
    await assertFails(as('lapsed').doc('characters/lapsed_2').update({ notes: 'Locked.' }));
    await assertFails(as('lapsed').doc('characters/lapsed_3').update({ notes: 'Locked.' }));
  });

  it('the owner can choose a different one to keep, and then that one is in use instead', async () => {
    await assertSucceeds(
      as('lapsed')
        .doc('users/lapsed')
        .set({ keepCharacters: ['lapsed_3'] }),
    );
    await assertSucceeds(as('lapsed').doc('characters/lapsed_3').update({ notes: 'Chosen.' }));
    await assertFails(as('lapsed').doc('characters/lapsed_1').update({ notes: 'Locked now.' }));
  });

  it('choosing more than the plan allows changes nothing', async () => {
    await assertSucceeds(
      as('lapsed')
        .doc('users/lapsed')
        .set({ keepCharacters: ['lapsed_2', 'lapsed_3'] }),
    );
    await assertFails(as('lapsed').doc('characters/lapsed_3').update({ notes: 'No.' }));
    await assertSucceeds(as('lapsed').doc('characters/lapsed_1').update({ notes: 'Yes.' }));
  });

  it('a new character cannot be slipped into a low slot while another is kept', async () => {
    await seed((db) => db.doc('characters/lapsed_1').delete());
    await assertSucceeds(
      as('lapsed')
        .doc('users/lapsed')
        .set({ keepCharacters: ['lapsed_3'] }),
    );
    await assertFails(as('lapsed').doc('characters/lapsed_1').set(character('lapsed', 1)));
    await assertSucceeds(as('lapsed').doc('users/lapsed').set({ keepCharacters: [] }));
    await assertSucceeds(as('lapsed').doc('characters/lapsed_1').set(character('lapsed', 1)));
  });

  it('nobody else can make the choice for them', async () => {
    await assertFails(
      as('player')
        .doc('users/lapsed')
        .set({ keepCharacters: ['lapsed_2'] }),
    );
    await assertFails(as('lapsed').doc('users/lapsed').set({ keepCharacters: 'lapsed_2' }));
    await assertFails(as('lapsed').doc('users/lapsed').set({ plan: 'paid' }));
  });

  it('paying again puts everything back in use', async () => {
    await seed((db) => db.doc('entitlements/lapsed').set({ plan: 'paid', status: 'active' }));
    await assertSucceeds(as('lapsed').doc('characters/lapsed_3').update({ notes: 'Back.' }));
    await assertSucceeds(
      as('lapsed').doc('campaigns/lapsed_2/shared/brief').set({ setting: 'New', sessions: [] }),
    );
  });
});

describe('a campaign over the limit is read-only', () => {
  const beat = {
    at: serverTimestamp(),
    text: 'Something.',
    milestone: false,
    private: false,
    cardId: null,
    byUid: 'lapsed',
  };

  it('the Warden still runs the first campaign', async () => {
    await assertSucceeds(
      as('lapsed').doc('campaigns/lapsed_1/shared/brief').set({ setting: 'New', sessions: [] }),
    );
    await assertSucceeds(as('lapsed').collection('campaigns/lapsed_1/beats').add(beat));
  });

  it('the Warden cannot change the second, in any of its parts', async () => {
    const K = 'campaigns/lapsed_2';
    await assertFails(as('lapsed').doc(`${K}/shared/brief`).set({ setting: 'New', sessions: [] }));
    await assertFails(as('lapsed').doc(`${K}/private/notes`).set({ text: 'x' }));
    await assertFails(as('lapsed').collection(`${K}/beats`).add(beat));
    await assertFails(
      as('lapsed').doc(`${K}/cards/c`).set({
        kind: 'person',
        name: 'A',
        text: '',
        status: 'planned',
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    await assertFails(
      as('lapsed')
        .doc(`${K}/characters/w1`)
        .set({ name: 'Pip', sheet: {}, createdAt: 1, updatedAt: 1 }),
    );
    await assertFails(
      as('lapsed')
        .doc('characters/player_1')
        .update({ sheet: { hp: { current: 1, full: 4 } } }),
    );
    await assertFails(
      as('lapsed')
        .collection(`${K}/requests`)
        .add({ fromUid: 'lapsed', toUid: 'player', kind: 'save', text: 'Save', status: 'pending' }),
    );
  });

  it('everyone in it can still read it', async () => {
    await assertSucceeds(as('lapsed').doc('campaigns/lapsed_2/shared/brief').get());
    await assertSucceeds(as('player').doc('campaigns/lapsed_2/shared/brief').get());
    await assertSucceeds(as('lapsed').doc('characters/player_1').get());
  });

  it('the Warden can choose to keep the second instead', async () => {
    await assertSucceeds(
      as('lapsed')
        .doc('users/lapsed')
        .set({ keepCampaigns: ['lapsed_2'] }),
    );
    await assertSucceeds(
      as('lapsed').doc('campaigns/lapsed_2/shared/brief').set({ setting: 'New', sessions: [] }),
    );
    await assertFails(
      as('lapsed').doc('campaigns/lapsed_1/shared/brief').set({ setting: 'New', sessions: [] }),
    );
  });

  it('a campaign made before slots were recorded counts as the first', async () => {
    await seed(async (db) => {
      await db.doc('campaigns/old_1').set({ name: 'Old', wardenUid: 'old', joinCode: 'ABC239' });
      await db
        .doc('campaigns/old_1/members/old')
        .set({ role: 'warden', displayName: 'O', control: 'direct' });
    });
    await assertSucceeds(
      as('old').doc('campaigns/old_1/shared/brief').set({ setting: 'x', sessions: [] }),
    );
  });
});
