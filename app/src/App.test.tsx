import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { App } from './App';
import { AuthStateProvider, type AuthState } from './auth';

vi.mock('../../site/src/logo.svg?raw', () => ({ default: '<svg></svg>' }));

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

  it('greets a guest and offers sign-out', () => {
    renderApp({ isAnonymous: true, displayName: null } as User);
    expect(screen.getByRole('heading', { name: 'Welcome, guest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('greets an account holder by name', () => {
    renderApp({ isAnonymous: false, displayName: 'Esme' } as User);
    expect(screen.getByRole('heading', { name: 'Welcome, Esme' })).toBeInTheDocument();
  });

  it('keeps a signed-in user off the sign-in screen', () => {
    renderApp({ isAnonymous: true, displayName: null } as User, '/sign-in');
    expect(screen.getByRole('heading', { name: 'Welcome, guest' })).toBeInTheDocument();
  });
});
