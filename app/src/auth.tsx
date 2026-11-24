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
  /** Turns a guest into an account holder. They keep their uid, so they keep everything. */
  upgradeWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Says why sign-in failed, in words, with the code for whoever has to fix it. */
export function explainSignInFailure(code: string): string {
  const reasons: Record<string, string> = {
    'auth/operation-not-allowed': 'This way of signing in is not switched on for Waymark yet.',
    'auth/admin-restricted-operation': 'This way of signing in is not switched on for Waymark yet.',
    'auth/configuration-not-found': 'Sign-in has not been set up for Waymark yet.',
    'auth/unauthorized-domain': 'This web address is not approved for sign-in yet.',
    'auth/network-request-failed':
      'Waymark could not reach the sign-in service. Check your connection.',
    'auth/popup-blocked':
      'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    'auth/credential-already-in-use':
      'That Google account already has a Waymark account. Sign out and sign in with it instead.',
  };
  const reason = reasons[code] ?? 'Sign-in did not work. Please try again.';
  return code ? `${reason} (${code})` : reason;
}

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
  // Linking a guest to an account changes the same user object in place, so
  // a counter is what tells React to look again.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    getServices()
      .then(({ auth, authModule }) => {
        if (cancelled) return;
        stop = authModule.onIdTokenChanged(auth, (next) => {
          if (next) localStorage.setItem(SIGNED_IN_FLAG, '1');
          else localStorage.removeItem(SIGNED_IN_FLAG);
          setUser(next);
          setVersion((v) => v + 1);
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
        setError(explainSignInFailure(code));
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
      upgradeWithGoogle: () =>
        attempt(async () => {
          const started = getReadyServices();
          if (!started?.auth.currentUser) throw new Error('Not signed in');
          const { auth, authModule } = started;
          await authModule.linkWithPopup(auth.currentUser!, new authModule.GoogleAuthProvider());
          setVersion((v) => v + 1);
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
    // `version` is listed so that screens look again after a guest becomes an account holder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, ready, error, version]);

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
