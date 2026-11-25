import { useEffect, useState, type FormEvent } from 'react';
import {
  CARD_KINDS,
  CARD_KIND_LABEL,
  CARD_STATUSES,
  CARD_STATUS_LABEL,
  addBeat,
  deleteBeat,
  deleteCard,
  saveBrief,
  saveCard,
  saveNotes,
  setCardStatus,
  updateBeat,
  useBeats,
  useBrief,
  useCardNotes,
  useCards,
  useNotes,
  type Card,
  type CardKind,
  type CardStatus,
  type SessionBrief,
} from '../data/record';

interface Props {
  campaignId: string;
  uid: string;
  isWarden: boolean;
}

const when = (at: number) =>
  new Date(at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

/** Tells the person a save worked, or why it did not. */
function useSaver() {
  const [message, setMessage] = useState<string>();
  const run = (action: () => Promise<unknown>, done: string) => {
    setMessage(undefined);
    action().then(
      () => setMessage(done),
      () => setMessage('That could not be saved. Check your connection and try again.'),
    );
  };
  return { message, run };
}

/** The campaign's story: the brief, what has happened, and who and what is in it. */
export function Story({ campaignId, uid, isWarden }: Props) {
  return (
    <>
      <BriefSection campaignId={campaignId} isWarden={isWarden} />
      <Timeline campaignId={campaignId} uid={uid} isWarden={isWarden} />
      <Cards campaignId={campaignId} isWarden={isWarden} />
      {isWarden && <PrivateNotes campaignId={campaignId} />}
    </>
  );
}

function BriefSection({ campaignId, isWarden }: Omit<Props, 'uid'>) {
  const brief = useBrief(campaignId);
  const [setting, setSetting] = useState<string>();
  const [editing, setEditing] = useState<SessionBrief | null>(null);
  const { message, run } = useSaver();
  const shown = setting ?? brief.setting;

  const saveSession = (session: SessionBrief) => {
    const exists = brief.sessions.some((s) => s.id === session.id);
    const sessions = exists
      ? brief.sessions.map((s) => (s.id === session.id ? session : s))
      : [...brief.sessions, session];
    run(() => saveBrief(campaignId, { setting: shown, sessions }), 'Session saved.');
    setEditing(null);
  };

  return (
    <section aria-labelledby="brief">
      <h2 id="brief">The brief</h2>
      {isWarden ? (
        <>
          <label className="form-row">
            Setting and backdrop
            <textarea
              rows={5}
              maxLength={4000}
              value={shown}
              placeholder="Where and when is this? What is going on in the world? What do the characters all know?"
              onChange={(e) => setSetting(e.target.value)}
            />
          </label>
          <p className="hint">Every player can read this.</p>
          <button
            type="button"
            className="button small"
            onClick={() =>
              run(
                () => saveBrief(campaignId, { setting: shown, sessions: brief.sessions }),
                'Setting saved.',
              )
            }
          >
            Save the setting
          </button>
        </>
      ) : brief.setting ? (
        <p className="note prewrap">{brief.setting}</p>
      ) : (
        <p className="muted">The Warden has not written a setting yet.</p>
      )}

      <h3>Sessions</h3>
      {brief.sessions.length === 0 && <p className="muted">No session briefs yet.</p>}
      <ul className="record">
        {brief.sessions.map((s) => (
          <li key={s.id}>
            <strong>{s.title}</strong>
            {s.mission && (
              <p>
                <em>The mission:</em> {s.mission}
              </p>
            )}
            {s.stakes && (
              <p>
                <em>The stakes:</em> {s.stakes}
              </p>
            )}
            {s.expected && (
              <p>
                <em>What to expect:</em> {s.expected}
              </p>
            )}
            {isWarden && (
              <div className="button-row">
                <button
                  type="button"
                  className="button small"
                  aria-label={`Edit ${s.title}`}
                  onClick={() => setEditing(s)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="button small"
                  aria-label={`Delete ${s.title}`}
                  onClick={() =>
                    run(
                      () =>
                        saveBrief(campaignId, {
                          setting: shown,
                          sessions: brief.sessions.filter((x) => x.id !== s.id),
                        }),
                      'Session deleted.',
                    )
                  }
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isWarden &&
        (editing ? (
          <SessionForm session={editing} onSave={saveSession} onCancel={() => setEditing(null)} />
        ) : (
          <button
            type="button"
            className="button small"
            onClick={() =>
              setEditing({
                id: crypto.randomUUID().slice(0, 8),
                title: '',
                mission: '',
                stakes: '',
                expected: '',
              })
            }
          >
            Add a session
          </button>
        ))}
      <p className="hint" role="status">
        {message}
      </p>
    </section>
  );
}

function SessionForm({
  session,
  onSave,
  onCancel,
}: {
  session: SessionBrief;
  onSave: (session: SessionBrief) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(session);
  const field = (key: keyof Omit<SessionBrief, 'id'>, label: string, placeholder: string) => (
    <label>
      {label}
      {key === 'title' ? (
        <input
          value={draft[key]}
          maxLength={80}
          required
          placeholder={placeholder}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      ) : (
        <textarea
          rows={2}
          maxLength={1000}
          value={draft[key]}
          placeholder={placeholder}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <form
      className="form panel"
      aria-label="Session brief"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.title.trim()) onSave({ ...draft, title: draft.title.trim() });
      }}
    >
      {field('title', 'Session title', 'The Rope Bridge')}
      {field('mission', 'The mission', 'What are the characters trying to do?')}
      {field('stakes', 'The stakes', 'What happens if they fail, or do nothing?')}
      {field(
        'expected',
        'What to expect',
        'Travel, talking, danger? Anything players should bring?',
      )}
      <div className="button-row">
        <button type="submit" className="button small primary">
          Save session
        </button>
        <button type="button" className="button small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Timeline({ campaignId, uid, isWarden }: Props) {
  const beats = useBeats(campaignId, isWarden);
  const cards = useCards(campaignId, isWarden);
  const [text, setText] = useState('');
  const [milestone, setMilestone] = useState(false);
  const [secret, setSecret] = useState(false);
  const [cardId, setCardId] = useState('');
  const [problem, setProblem] = useState<string>();
  const cardName = (id: string | null) => cards.find((c) => c.id === id)?.name;
  const fail = () => setProblem('That could not be saved. Check your connection and try again.');

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setProblem(undefined);
    addBeat(campaignId, uid, {
      text: text.trim(),
      milestone,
      private: secret,
      cardId: cardId || null,
    }).catch(fail);
    setText('');
    setMilestone(false);
    setCardId('');
  };

  return (
    <section aria-labelledby="timeline">
      <h2 id="timeline">Timeline</h2>
      {isWarden && (
        <form className="form" aria-label="Add a story beat" onSubmit={add}>
          <label>
            What just happened?
            <input
              value={text}
              maxLength={500}
              placeholder="One sentence is enough."
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="checks">
            <label className="check">
              <input
                type="checkbox"
                checked={milestone}
                onChange={(e) => setMilestone(e.target.checked)}
              />
              Milestone
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={secret}
                onChange={(e) => setSecret(e.target.checked)}
              />
              Only I can see this
            </label>
          </div>
          {cards.length > 0 && (
            <label>
              About (optional)
              <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                <option value="">Nothing in particular</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="button primary" disabled={!text.trim()}>
            Add to the timeline
          </button>
        </form>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {beats.length === 0 && <p className="muted">Nothing has happened yet.</p>}
      {/* Newest first: during play, the last thing that happened matters most. */}
      <ol className="record timeline" aria-label="Story beats, newest first">
        {[...beats].reverse().map((b) => (
          <li key={b.id} className={b.milestone ? 'milestone' : undefined}>
            <span className="muted small">{when(b.at)}</span>
            {b.milestone && <span className="tag">Milestone</span>}
            {b.private && <span className="tag quiet">Only you</span>}
            {cardName(b.cardId) && <span className="tag quiet">{cardName(b.cardId)}</span>}
            <p>{b.text}</p>
            {isWarden && (
              <div className="button-row">
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    updateBeat(campaignId, b.id, { milestone: !b.milestone }).catch(fail)
                  }
                >
                  {b.milestone ? 'Not a milestone' : 'Mark as a milestone'}
                </button>
                <button
                  type="button"
                  className="link-button"
                  aria-label={`Delete beat: ${b.text}`}
                  onClick={() => deleteBeat(campaignId, b.id).catch(fail)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Cards({ campaignId, isWarden }: Omit<Props, 'uid'>) {
  const cards = useCards(campaignId, isWarden);
  const notes = useCardNotes(campaignId, isWarden);
  const [editing, setEditing] = useState<Partial<Card> | null>(null);
  const [problem, setProblem] = useState<string>();
  const fail = () => setProblem('That could not be saved. Check your connection and try again.');

  return (
    <section aria-labelledby="cards">
      <h2 id="cards">People, places and things</h2>
      {isWarden && (
        <p className="hint">
          A planned card is yours alone. Players see it once you reveal it. They never see your
          private notes.
        </p>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {cards.length === 0 && (
        <p className="muted">{isWarden ? 'No cards yet.' : 'Nothing has been revealed yet.'}</p>
      )}
      <ul className="record">
        {cards.map((c) => (
          <li key={c.id} data-testid={`card-${c.name}`}>
            <strong>{c.name}</strong>
            <span className="tag quiet">{CARD_KIND_LABEL[c.kind]}</span>
            <span className={c.status === 'planned' ? 'tag warn' : 'tag'}>
              {c.status === 'planned' ? 'Planned' : CARD_STATUS_LABEL[c.status]}
            </span>
            {c.text && <p className="prewrap">{c.text}</p>}
            {isWarden && notes[c.id] && (
              <p className="prewrap muted">
                <em>Private:</em> {notes[c.id]}
              </p>
            )}
            {isWarden && (
              <div className="button-row">
                {c.status === 'planned' && (
                  <button
                    type="button"
                    className="button small primary"
                    onClick={() => setCardStatus(campaignId, c.id, 'met').catch(fail)}
                  >
                    Reveal <span className="sr-only">{c.name} </span>to players
                  </button>
                )}
                <button
                  type="button"
                  className="button small"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => setEditing(c)}
                >
                  Edit
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isWarden &&
        (editing ? (
          <CardForm
            key={editing.id ?? 'new'}
            card={editing}
            notes={editing.id ? (notes[editing.id] ?? '') : ''}
            onSave={(card, privateNotes) => {
              saveCard(campaignId, card, privateNotes).catch(fail);
              setEditing(null);
            }}
            onDelete={
              editing.id
                ? () => {
                    deleteCard(campaignId, editing.id!).catch(fail);
                    setEditing(null);
                  }
                : undefined
            }
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button type="button" className="button small" onClick={() => setEditing({})}>
            New card
          </button>
        ))}
    </section>
  );
}

function CardForm({
  card,
  notes,
  onSave,
  onDelete,
  onCancel,
}: {
  card: Partial<Card>;
  notes: string;
  onSave: (
    card: Pick<Card, 'kind' | 'name' | 'text' | 'status'> & { id?: string; createdAt?: number },
    notes: string,
  ) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<CardKind>(card.kind ?? 'person');
  const [name, setName] = useState(card.name ?? '');
  const [text, setText] = useState(card.text ?? '');
  const [status, setStatus] = useState<CardStatus>(card.status ?? 'planned');
  const [privateNotes, setPrivateNotes] = useState(notes);
  return (
    <form
      className="form panel"
      aria-label={card.id ? `Edit ${card.name}` : 'New card'}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave(
          { id: card.id, createdAt: card.createdAt, kind, name: name.trim(), text, status },
          privateNotes,
        );
      }}
    >
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as CardKind)}>
          {CARD_KINDS.map((k) => (
            <option key={k} value={k}>
              {CARD_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        What the players can know
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        Your private notes
        <textarea
          rows={3}
          maxLength={2000}
          value={privateNotes}
          onChange={(e) => setPrivateNotes(e.target.value)}
        />
      </label>
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as CardStatus)}>
          {CARD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CARD_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="button-row">
        <button type="submit" className="button small primary">
          Save card
        </button>
        <button type="button" className="button small" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className="button small danger" onClick={onDelete}>
            Delete card
          </button>
        )}
      </div>
    </form>
  );
}

function PrivateNotes({ campaignId }: { campaignId: string }) {
  const saved = useNotes(campaignId, true);
  const [text, setText] = useState<string>();
  const { message, run } = useSaver();
  // Another device's save shows here unless this one has unsaved typing.
  useEffect(() => setText(undefined), [saved]);
  return (
    <section aria-labelledby="notes">
      <h2 id="notes">Your private notes</h2>
      <label className="form-row">
        <span className="sr-only">Private notes</span>
        <textarea
          rows={6}
          maxLength={8000}
          value={text ?? saved}
          placeholder="Secrets, plans, things to remember. No player can read this."
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="button small"
        onClick={() => run(() => saveNotes(campaignId, text ?? saved), 'Notes saved.')}
      >
        Save notes
      </button>
      <p className="hint" role="status">
        {message}
      </p>
    </section>
  );
}
