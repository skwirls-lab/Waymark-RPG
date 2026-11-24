import { armorValue, status } from '@waymark/rules';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useCharacterStore } from '../data/useCharacters';
import { Logo } from '../Logo';

/** A free account may own one character. Paid plans arrive in a later phase. */
const FREE_CHARACTERS = 1;

export function Home() {
  const { user, signOut } = useAuth();
  const { characters, problem } = useCharacterStore();
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
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <h2>Your characters</h2>
        {characters === undefined && <p className="muted">Loading…</p>}
        {characters?.length === 0 && (
          <p className="lede">You have no character yet. Making one takes about ten minutes.</p>
        )}
        <ul className="character-list">
          {characters?.map((c) => (
            <li key={c.id}>
              <Link to={`/c/${c.id}`} className="character-card">
                <strong>{c.name}</strong>
                <span className="muted">{c.sheet.background}</span>
                <span>
                  HP {c.sheet.hp.current} of {c.sheet.hp.full} · Armor {armorValue(c.sheet)}
                  {status(c.sheet) !== 'ok' && ` · ${status(c.sheet)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {characters !== undefined && characters.length < FREE_CHARACTERS && (
          <Link to="/new" className="button primary as-link">
            Make a character
          </Link>
        )}
        {characters !== undefined && characters.length >= FREE_CHARACTERS && (
          <p className="fineprint">
            A free account holds one character. Delete this one to make another.
          </p>
        )}
        {user?.isAnonymous && (
          <p className="note">You are playing as a guest. Nothing personal is stored about you.</p>
        )}
      </main>
    </>
  );
}
