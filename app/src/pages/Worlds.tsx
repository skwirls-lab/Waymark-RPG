import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { EMPTY_CONTENT, deleteWorld, saveWorld, useWorlds, type World } from '../data/record';
import { WorkshopView } from './Workshop';

const size = (w: World) =>
  w.content.origins.length +
  w.content.abilities.length +
  w.content.gear.length +
  w.creatures.length;

/** Your worlds: sets of your own Origins, Abilities, gear and creatures, kept to use anywhere. */
export function Worlds() {
  const { user } = useAuth();
  const uid = user!.uid;
  const worlds = useWorlds(uid, true);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string>();

  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    saveWorld(uid, { name: name.trim(), content: EMPTY_CONTENT, creatures: [] }).then(
      (id) => navigate(`/worlds/${id}`),
      () => setProblem('That could not be saved. Check your connection and try again.'),
    );
  };

  return (
    <main className="screen">
      <p className="back">
        <Link to="/">← Home</Link>
      </p>
      <h1>Your worlds</h1>
      <p>
        A world is your own setting&rsquo;s Origins, Affinities, Abilities, gear and creatures,
        added to the rulebook&rsquo;s. Make one here, then use it when you build a character or
        bring it into any campaign you run.
      </p>
      {worlds.length === 0 && <p className="muted">You have no worlds yet.</p>}
      <ul className="character-list">
        {worlds.map((w) => (
          <li key={w.id}>
            <Link to={`/worlds/${w.id}`} className="character-card">
              <strong>{w.name}</strong>
              <span className="muted">
                {size(w) === 0 ? 'Nothing in it yet' : `${size(w)} things made`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <form className="form" aria-label="New world" onSubmit={create}>
        <label>
          New world&rsquo;s name
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="button primary" disabled={!name.trim()}>
          Make this world
        </button>
      </form>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </main>
  );
}

/** One world, opened in the workshop. */
export function WorldEditor() {
  const { id } = useParams();
  const { user } = useAuth();
  const uid = user!.uid;
  const navigate = useNavigate();
  const worlds = useWorlds(uid, true);
  const world = worlds.find((w) => w.id === id);
  const [confirming, setConfirming] = useState(false);

  if (!world) {
    return (
      <main className="screen">
        <p className="back">
          <Link to="/worlds">← Your worlds</Link>
        </p>
        <p className="muted">Loading…</p>
      </main>
    );
  }
  const save = (patch: Partial<World>) => saveWorld(uid, { ...world, ...patch });

  return (
    <main className="screen">
      <p className="back">
        <Link to="/worlds">← Your worlds</Link>
      </p>
      <p className="eyebrow">World</p>
      <h1>{world.name}</h1>
      <WorkshopView
        content={world.content}
        creatures={world.creatures}
        saveContentTo={(content) => save({ content })}
        saveCreaturesTo={(creatures) => save({ creatures })}
        intro="Everything here is made from the rulebook's own forms. Choose this world when you build a character, or bring it into a campaign from that campaign's Workshop tab."
      />
      <section className="danger-zone">
        {confirming ? (
          <p>
            Delete {world.name}? Campaigns and characters already using its content keep their
            copies.{' '}
            <button
              type="button"
              className="button small danger"
              onClick={() => deleteWorld(uid, world.id).then(() => navigate('/worlds'))}
            >
              Yes, delete
            </button>{' '}
            <button type="button" className="button small" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </p>
        ) : (
          <button type="button" className="link-button" onClick={() => setConfirming(true)}>
            Delete this world
          </button>
        )}
      </section>
    </main>
  );
}
