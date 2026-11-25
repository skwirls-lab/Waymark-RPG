import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { loadConfig } from './firebase-config';

type AuthModule = typeof import('firebase/auth');

export interface Services {
  app: FirebaseApp;
  auth: Auth;
  /** The sign-in library, already loaded, so sign-in can start without waiting. */
  authModule: AuthModule;
}

export const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';

let services: Promise<Services> | undefined;
let ready: Services | undefined;
let database: Promise<Firestore> | undefined;

/**
 * Starts Firebase once and returns the same services to every caller.
 * The Firebase libraries are loaded here, on demand, so the first screen can
 * paint before they arrive.
 */
export function getServices(): Promise<Services> {
  services ??= start();
  return services;
}

/**
 * The services, if Firebase has already started. Sign-in windows must be
 * opened in the same tick as the tap that asked for them, or browsers block
 * them, so the sign-in buttons cannot wait on a promise.
 */
export function getReadyServices(): Services | undefined {
  return ready;
}

async function start(): Promise<Services> {
  const [config, { initializeApp }, authModule] = await Promise.all([
    loadConfig(useEmulators),
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = initializeApp(config);
  const auth = authModule.getAuth(app);
  if (useEmulators) {
    authModule.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    // Emulator builds only: lets end-to-end tests sign in as a Google user
    // without Google's own sign-in window. The emulator accepts a plain JSON
    // token. This block is removed from production builds.
    window.__waymarkTest = {
      signInAsGoogleUser: async (name, email) => {
        const token = JSON.stringify({ sub: email, email, email_verified: true, name });
        await authModule.signInWithCredential(
          auth,
          authModule.GoogleAuthProvider.credential(token),
        );
      },
      // Stands in for the "create an account" window: links the current guest to a Google identity.
      linkGuestToGoogle: async (name, email) => {
        const token = JSON.stringify({ sub: email, email, email_verified: true, name });
        await authModule.linkWithCredential(
          auth.currentUser!,
          authModule.GoogleAuthProvider.credential(token),
        );
        await authModule.updateProfile(auth.currentUser!, { displayName: name });
        await auth.currentUser!.getIdToken(true);
      },
    };
  }
  ready = { app, auth, authModule };
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
  // After a spell offline Firestore waits longer and longer between attempts
  // to reconnect. When the browser says the connection is back, reconnect at
  // once, so changes made offline reach the server promptly.
  window.addEventListener('online', () => {
    void firestore.disableNetwork(db).then(() => firestore.enableNetwork(db));
  });
  return db;
}
