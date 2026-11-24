import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { App } from './App';
import { AuthStateProvider, type AuthState } from './auth';

vi.mock('../../site/src/logo.svg?raw', () => ({ default: '<svg></svg>' }));
// No database in unit tests: the signed-in user simply has no characters.
vi.mock('./data/characters', () => ({
  characterId: (uid: string, slot: number) => `${uid}_${slot}`,
  watchCharacters: (_uid: string, onChange: (docs: unknown[]) => void) => {
    onChange([]);
    return () => {};
  },
  saveCharacter: async () => {},
  deleteCharacter: async () => {},
}));

function renderApp(user: AuthState['user'], path = '/') {
  const state: AuthState = {
    user,
    error: null,
    signInWithGoogle: async () => {},
    signInAsGuest: async () => {},
    signOut: async () => {},
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthStateProvider value={state}>
        <App />
      </AuthStateProvider>
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('shows a loading state while sign-in status is unknown', () => {
    renderApp(undefined);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('sends a signed-out visitor to the sign-in screen', () => {
    renderApp(null);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue as a guest' })).toBeInTheDocument();
  });

  it('greets a guest and offers sign-out', async () => {
    renderApp({ uid: 'g1', isAnonymous: true, displayName: null } as User);
    expect(await screen.findByRole('heading', { name: 'Welcome, guest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Make a character' })).toBeInTheDocument();
  });

  it('greets an account holder by name', async () => {
    renderApp({ uid: 'u1', isAnonymous: false, displayName: 'Esme' } as User);
    expect(await screen.findByRole('heading', { name: 'Welcome, Esme' })).toBeInTheDocument();
  });

  it('keeps a signed-in user off the sign-in screen', async () => {
    renderApp({ uid: 'g1', isAnonymous: true, displayName: null } as User, '/sign-in');
    expect(await screen.findByRole('heading', { name: 'Welcome, guest' })).toBeInTheDocument();
  });
});
