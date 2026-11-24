import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getReadyServices, getServices } from './firebase';

export interface AuthState {
  /** `undefined` while we are still finding out; `null` when signed out. */
  user: User | null | undefined;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    getServices()
      .then(({ auth }) => {
        if (!cancelled) stop = onAuthStateChanged(auth, setUser);
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
      error,
      signInWithGoogle: () =>
        attempt(() => {
          // No awaiting before the popup opens: see getReadyServices.
          const started = getReadyServices();
          if (!started) throw new Error('Firebase has not started yet');
          return signInWithPopup(started.auth, new GoogleAuthProvider());
        }),
      signInAsGuest: () => attempt(async () => signInAnonymously((await getServices()).auth)),
      signOut: () => attempt(async () => firebaseSignOut((await getServices()).auth)),
    };
  }, [user, error]);

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
