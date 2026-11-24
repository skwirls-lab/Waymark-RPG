import type { User } from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getReadyServices, getServices } from './firebase';

export interface AuthState {
  /** `undefined` while we are still finding out; `null` when signed out. */
  user: User | null | undefined;
  /** False until the sign-in library has loaded. The sign-in buttons wait for it. */
  ready: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Remembers whether this browser was signed in, so a new visitor sees the sign-in screen at once. */
const SIGNED_IN_FLAG = 'waymark.signedIn';

export function AuthProvider({ children }: { children: ReactNode }) {
  // Someone who has never signed in here is shown the sign-in screen without
  // waiting for the sign-in library. A returning user waits for their session.
  const [user, setUser] = useState<User | null | undefined>(() =>
    localStorage.getItem(SIGNED_IN_FLAG) ? undefined : null,
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    getServices()
      .then(({ auth, authModule }) => {
        if (cancelled) return;
        stop = authModule.onAuthStateChanged(auth, (next) => {
          if (next) localStorage.setItem(SIGNED_IN_FLAG, '1');
          else localStorage.removeItem(SIGNED_IN_FLAG);
          setUser(next);
          setReady(true);
        });
      })
      .catch(() => {
        setUser(null);
        setError('Waymark could not start. Check your connection and reload.');
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const attempt = async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
      } catch (problem) {
        const code = (problem as { code?: string }).code ?? '';
        // Closing the sign-in window is a choice, not an error.
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
        console.error('Sign-in failed:', code || problem);
        setError('Sign-in did not work. Please try again.');
      }
    };
    return {
      user,
      ready,
      error,
      signInWithGoogle: () =>
        attempt(() => {
          // No awaiting before the popup opens: see getReadyServices.
          const started = getReadyServices();
          if (!started) throw new Error('Firebase has not started yet');
          const { auth, authModule } = started;
          return authModule.signInWithPopup(auth, new authModule.GoogleAuthProvider());
        }),
      signInAsGuest: () =>
        attempt(async () => {
          const { auth, authModule } = await getServices();
          return authModule.signInAnonymously(auth);
        }),
      signOut: () =>
        attempt(async () => {
          const { auth, authModule } = await getServices();
          return authModule.signOut(auth);
        }),
    };
  }, [user, ready, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Lets tests and stories supply a ready-made auth state. */
export function AuthStateProvider({ value, children }: { value: AuthState; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth must be used inside an AuthProvider');
  return state;
}
