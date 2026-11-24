/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_EMULATORS?: string;
}

interface Window {
  /** Present only in emulator builds, for end-to-end tests. */
  __waymarkTest?: {
    signInAsGoogleUser: (name: string, email: string) => Promise<void>;
  };
}
