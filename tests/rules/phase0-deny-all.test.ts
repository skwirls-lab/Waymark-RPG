import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-waymark',
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

// Paths nothing has opened yet. As later phases open a path, it moves out of
// this list and into that phase's own matrix of allowed and refused cases.
const unopenedPaths = ['campaigns/k1', 'anything/else', 'entitlements/alice/extra/x'];

describe('paths no phase has opened stay closed', () => {
  for (const path of unopenedPaths) {
    it(`refuses a signed-out visitor at ${path}`, async () => {
      const db = env.unauthenticatedContext().firestore();
      await assertFails(db.doc(path).get());
      await assertFails(db.doc(path).set({ a: 1 }));
    });

    it(`refuses a signed-in user at ${path}`, async () => {
      const db = env.authenticatedContext('alice').firestore();
      await assertFails(db.doc(path).get());
      await assertFails(db.doc(path).set({ a: 1 }));
    });
  }
});
