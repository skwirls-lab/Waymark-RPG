import type { FirebaseOptions } from 'firebase/app';

/**
 * The project's public web configuration. These values identify the project
 * to Firebase; they are not secrets. Access is controlled by security rules.
 *
 * Leave `apiKey` empty until the web app is registered. While it is empty,
 * the app asks Firebase Hosting for the configuration at start-up instead.
 */
export const committedConfig: FirebaseOptions = {
  apiKey: '',
  authDomain: 'waymark-rpg.firebaseapp.com',
  projectId: 'waymark-rpg',
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
