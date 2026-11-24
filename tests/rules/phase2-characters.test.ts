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
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const stranger = () => env.unauthenticatedContext().firestore();
const character = (ownerUid: string, slot = 1, over: Record<string, unknown> = {}) => ({
  ownerUid,
  slot,
  name: 'Wren',
  description: '',
  age: 31,
  notes: '',
  sheet: { hp: { current: 4, full: 4 } },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc(path).set(data));

describe('phase 2: a user profile', () => {
  it('can be written and read by its owner', async () => {
    await assertSucceeds(
      as('alice').doc('users/alice').set({ displayName: 'Alice', updatedAt: 1 }),
    );
    await assertSucceeds(as('alice').doc('users/alice').get());
  });

  it('cannot be read or written by anyone else', async () => {
    await seed('users/alice', { displayName: 'Alice' });
    await assertFails(as('bob').doc('users/alice').get());
    await assertFails(as('bob').doc('users/alice').set({ displayName: 'Bob' }));
    await assertFails(stranger().doc('users/alice').get());
  });

  it('cannot carry a plan or any other extra field', async () => {
    await assertFails(as('alice').doc('users/alice').set({ displayName: 'Alice', plan: 'paid' }));
    await assertFails(
      as('alice')
        .doc('users/alice')
        .set({ displayName: 'x'.repeat(81) }),
    );
    await assertFails(as('alice').doc('users/alice').set({ displayName: 7 }));
  });
});

describe('phase 2: entitlements', () => {
  it('can be read by their owner and nobody else', async () => {
    await seed('entitlements/alice', { plan: 'paid' });
    await assertSucceeds(as('alice').doc('entitlements/alice').get());
    await assertFails(as('bob').doc('entitlements/alice').get());
  });

  it('can never be written from the browser', async () => {
    await assertFails(as('alice').doc('entitlements/alice').set({ plan: 'paid' }));
    await seed('entitlements/alice', { plan: 'free' });
    await assertFails(as('alice').doc('entitlements/alice').update({ plan: 'paid' }));
  });
});

describe('phase 2: a character', () => {
  it('can be created, read, changed and deleted by its owner', async () => {
    const doc = as('alice').doc('characters/alice_1');
    await assertSucceeds(doc.set(character('alice')));
    await assertSucceeds(doc.get());
    await assertSucceeds(doc.set(character('alice', 1, { name: 'Wren the Bold', updatedAt: 2 })));
    await assertSucceeds(doc.delete());
  });

  it('can be listed by its owner', async () => {
    await seed('characters/alice_1', character('alice'));
    await assertSucceeds(
      as('alice').collection('characters').where('ownerUid', '==', 'alice').get(),
    );
  });

  it('cannot be read, listed, changed or deleted by another user', async () => {
    await seed('characters/alice_1', character('alice'));
    const doc = as('bob').doc('characters/alice_1');
    await assertFails(doc.get());
    await assertFails(as('bob').collection('characters').where('ownerUid', '==', 'alice').get());
    await assertFails(as('bob').collection('characters').get());
    await assertFails(doc.set(character('bob')));
    await assertFails(doc.update({ name: 'Mine now' }));
    await assertFails(doc.delete());
  });

  it('cannot be touched by someone who is not signed in', async () => {
    await seed('characters/alice_1', character('alice'));
    await assertFails(stranger().doc('characters/alice_1').get());
    await assertFails(stranger().doc('characters/x_1').set(character('x')));
  });

  it("cannot be created in another user's name or under another user's id", async () => {
    await assertFails(as('bob').doc('characters/alice_1').set(character('alice')));
    await assertFails(as('bob').doc('characters/alice_1').set(character('bob')));
    await assertFails(as('bob').doc('characters/bob_1').set(character('alice')));
  });

  it('cannot be handed to another owner or moved to another slot', async () => {
    await seed('characters/alice_1', character('alice'));
    await assertFails(as('alice').doc('characters/alice_1').update({ ownerUid: 'bob' }));
    await assertFails(as('alice').doc('characters/alice_1').update({ slot: 2 }));
  });

  it('must be well formed', async () => {
    const doc = as('alice').doc('characters/alice_1');
    await assertFails(doc.set(character('alice', 1, { name: '' })));
    await assertFails(doc.set(character('alice', 1, { name: 'x'.repeat(81) })));
    await assertFails(doc.set(character('alice', 1, { sheet: 'not a sheet' })));
    await assertFails(doc.set(character('alice', 1, { admin: true })));
    await assertFails(doc.set(character('alice', 1, { slot: '1' })));
  });
});

describe('phase 2: the one-character limit on free accounts', () => {
  it('refuses a second character', async () => {
    await assertSucceeds(as('alice').doc('characters/alice_1').set(character('alice', 1)));
    await assertFails(as('alice').doc('characters/alice_2').set(character('alice', 2)));
  });

  it('refuses slot numbers outside the allowance, including zero and negatives', async () => {
    await assertFails(as('alice').doc('characters/alice_0').set(character('alice', 0)));
    await assertFails(as('alice').doc('characters/alice_-1').set(character('alice', -1)));
    await assertFails(as('alice').doc('characters/alice_99').set(character('alice', 99)));
  });

  it('applies to guests as well', async () => {
    const guest = env
      .authenticatedContext('guest1', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore();
    await assertSucceeds(guest.doc('characters/guest1_1').set(character('guest1', 1)));
    await assertFails(guest.doc('characters/guest1_2').set(character('guest1', 2)));
  });

  it('frees the slot when the character is deleted', async () => {
    const doc = as('alice').doc('characters/alice_1');
    await assertSucceeds(doc.set(character('alice', 1)));
    await assertSucceeds(doc.delete());
    await assertSucceeds(doc.set(character('alice', 1, { name: 'Tobin' })));
  });

  it('allows more for a paid plan, which only the server can grant', async () => {
    await seed('entitlements/alice', { plan: 'paid' });
    await assertSucceeds(as('alice').doc('characters/alice_2').set(character('alice', 2)));
    await assertFails(as('alice').doc('characters/alice_51').set(character('alice', 51)));
  });
});
