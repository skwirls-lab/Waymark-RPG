import type { FirebaseOptions } from 'firebase/app';

/**
 * The project's public web configuration. These values identify the project
 * to Firebase; they are not secrets. Access is controlled by security rules.
 *
 * If `apiKey` is ever emptied, the app falls back to asking Firebase Hosting
 * for the configuration at start-up.
 */
export const committedConfig: FirebaseOptions = {
  apiKey: 'AIzaSyA7GfExjMTyfSryQrqp7hGR0zOsi0i79VI',
  authDomain: 'waymark-rpg.firebaseapp.com',
  projectId: 'waymark-rpg',
  storageBucket: 'waymark-rpg.firebasestorage.app',
  messagingSenderId: '786714793025',
  appId: '1:786714793025:web:eefedf57f7c5e95ad0e2c0',
  measurementId: 'G-Y2719ZT0BX',
};

export const emulatorConfig: FirebaseOptions = {
  apiKey: 'demo-key',
  authDomain: 'demo-waymark.firebaseapp.com',
  projectId: 'demo-waymark',
};

const STORAGE_KEY = 'waymark.firebaseConfig';

/** Works out which configuration to use, fetching it from Hosting if needed. */
export async function loadConfig(useEmulators: boolean): Promise<FirebaseOptions> {
  if (useEmulators) return emulatorConfig;
  if (committedConfig.apiKey) return committedConfig;
  try {
    const response = await fetch('/__/firebase/init.json');
    if (response.ok) {
      const config = (await response.json()) as FirebaseOptions;
      if (config.apiKey) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        return config;
      }
    }
  } catch {
    // Offline or not on Firebase Hosting: fall through to the saved copy.
  }
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) return JSON.parse(saved) as FirebaseOptions;
  throw new Error('Waymark could not load its Firebase configuration.');
}
