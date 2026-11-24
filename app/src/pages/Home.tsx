import { useAuth } from '../auth';
import { Logo } from '../Logo';

export function Home() {
  const { user, signOut } = useAuth();
  const name = user?.isAnonymous ? 'guest' : (user?.displayName ?? 'traveler');
  return (
    <>
      <header className="app-header">
        <span className="brand">
          <Logo size={32} />
          Waymark
        </span>
        <button className="button small" onClick={signOut}>
          Sign out
        </button>
      </header>
      <main className="screen">
        <h1>Welcome, {name}</h1>
        <p className="lede">Your characters and campaigns will appear here.</p>
        {user?.isAnonymous && (
          <p className="note">You are playing as a guest. Nothing personal is stored about you.</p>
        )}
      </main>
    </>
  );
}
