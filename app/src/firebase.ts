import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { loadConfig } from './firebase-config';

export interface Services {
  app: FirebaseApp;
  auth: Auth;
}

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

let services: Promise<Services> | undefined;
let ready: Services | undefined;

/**
 * The services, if Firebase has already started. Sign-in windows must be
 * opened in the same tick as the tap that asked for them, or browsers block
 * them, so the sign-in buttons cannot wait on a promise.
 */
export function getReadyServices(): Services | undefined {
  return ready;
}
let database: Promise<Firestore> | undefined;

/** Starts Firebase once and returns the same services to every caller. */
export function getServices(): Promise<Services> {
  services ??= start();
  return services;
}

async function start(): Promise<Services> {
  const app = initializeApp(await loadConfig(useEmulators));
  const auth = getAuth(app);
  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    // Emulator builds only: lets end-to-end tests sign in as a Google user
    // without Google's own sign-in window. The emulator accepts a plain JSON
    // token. This block is removed from production builds.
    const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
    window.__waymarkTest = {
      signInAsGoogleUser: async (name, email) => {
        const token = JSON.stringify({ sub: email, email, email_verified: true, name });
        await signInWithCredential(auth, GoogleAuthProvider.credential(token));
      },
    };
  }
  ready = { app, auth };
  return ready;
}

/**
 * The database, loaded on first use. Firestore is the largest part of the
 * app's code, so the sign-in screen does not wait for it.
 */
export function getDb(): Promise<Firestore> {
  database ??= startDb();
  return database;
}

async function startDb(): Promise<Firestore> {
  const [{ app }, firestore] = await Promise.all([getServices(), import('firebase/firestore')]);
  // Offline persistence: sheets must keep working without a connection.
  const db = firestore.initializeFirestore(app, {
    // Sheets have optional fields; leave them out rather than refuse the write.
    ignoreUndefinedProperties: true,
    localCache: firestore.persistentLocalCache({
      tabManager: firestore.persistentMultipleTabManager(),
    }),
  });
  if (useEmulators) firestore.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return db;
}
