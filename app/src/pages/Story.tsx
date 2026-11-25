import { addEnemies, data, startFight, type AiResult } from '@waymark/rules';
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
  saveFight,
  saveNotes,
  setCardStatus,
  updateBeat,
  useBeats,
  useBrief,
  useCardDetails,
  useCardNotes,
  useCreatures,
  useCards,
  useNotes,
  type Card,
  type CardDetails,
  type CardKind,
  type CardStatus,
  type SessionBrief,
} from '../data/record';
import { AiNote, AiSuggest } from '../ui/AiSuggest';

interface Props {
  campaignId: string;
  uid: string;
  isWarden: boolean;
}

interface StoryProps extends Props {
  /** The characters in the campaign, for starting a fight from a card. */
  party?: { id: string; name: string }[];
  onFight?: () => void;
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
export function Story({ campaignId, uid, isWarden, party = [], onFight }: StoryProps) {
  return (
    <>
      <BriefSection campaignId={campaignId} isWarden={isWarden} />
      <Timeline campaignId={campaignId} uid={uid} isWarden={isWarden} />
      <Cards
        campaignId={campaignId}
        uid={uid}
        isWarden={isWarden}
        party={party}
        onFight={onFight}
      />
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
  const [reveal, setReveal] = useState(true);
  const [problem, setProblem] = useState<string>();
  const about = cards.find((c) => c.id === cardId);
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
    // Telling the table about a planned card can reveal it in the same breath.
    if (about?.status === 'planned' && reveal && !secret) {
      setCardStatus(campaignId, about.id, 'met').catch(fail);
    }
    setText('');
    setMilestone(false);
    setCardId('');
    setReveal(true);
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
          {about?.status === 'planned' && !secret && (
            <label className="check">
              <input
                type="checkbox"
                checked={reveal}
                onChange={(e) => setReveal(e.target.checked)}
              />
              Reveal {about.name} to the players as well
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
      {isWarden && beats.length > 0 && (
        <AiStory campaignId={campaignId} uid={uid} cards={cards} onProblem={fail} />
      )}
      {beats.length === 0 && <p className="muted">Nothing has happened yet.</p>}
      {/* Newest first: during play, the last thing that happened matters most. */}
      <ol className="record timeline" aria-label="Story beats, newest first">
        {[...beats].reverse().map((b) => (
          <li key={b.id} className={b.milestone ? 'milestone' : undefined}>
            <span className="muted small">{when(b.at)}</span>
            {b.milestone && <span className="tag">Milestone</span>}
            {b.kind === 'fight' && <span className="tag">Fight</span>}
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

/** What each kind of card is for, shown as the form is filled in. */
const KIND_HELP: Record<CardKind, { shown: string; secret: string }> = {
  person: {
    shown: 'Who they are, how they look and sound, what they want.',
    secret: 'What they are hiding, and what they will do about it.',
  },
  place: {
    shown: 'What the characters see, hear and smell on arriving.',
    secret: 'Dangers, ways in, and anything hidden here.',
  },
  creature: {
    shown: 'What it looks like from a safe distance.',
    secret: 'What it wants, and how the players will see it coming.',
  },
  fight: {
    shown: 'Where it happens and what can be seen as it starts.',
    secret: 'What the enemies want, when they would run, and what they carry.',
  },
  puzzle: {
    shown: 'What stands in the way, as the characters find it.',
    secret: 'Ways through, and what happens on a wrong try. Let any sensible plan work.',
  },
  faction: {
    shown: 'Who they are and what they are known for.',
    secret: 'What they are really after, and who leads them.',
  },
  item: {
    shown: 'What it is and what it plainly does.',
    secret: 'What else it does, where it is found, and who wants it.',
  },
  thread: {
    shown: 'The open question, as the players would put it.',
    secret: 'The answer, or your best guess at one.',
  },
};

interface CardsProps extends Omit<Props, 'uid'> {
  uid: string;
  party: { id: string; name: string }[];
  /** Called when a fight has been started from a card, to show the fight tracker. */
  onFight?: () => void;
}

function Cards({ campaignId, uid, isWarden, party, onFight }: CardsProps) {
  const cards = useCards(campaignId, isWarden);
  const notes = useCardNotes(campaignId, isWarden);
  const details = useCardDetails(campaignId, isWarden);
  const custom = useCreatures(campaignId, isWarden);
  const brief = useBrief(campaignId);
  const creatures = [...data.creatures, ...custom];
  const creature = (id: string | null | undefined) => creatures.find((c) => c.id === id);
  const [editing, setEditing] = useState<Partial<Card> | null>(null);
  // A card the AI suggested: its private note, and a number so each suggestion gets a fresh form.
  const [suggested, setSuggested] = useState<{ secret: string; n: number }>();
  const [show, setShow] = useState('');
  const [problem, setProblem] = useState<string>();
  const fail = () => setProblem('That could not be saved. Check your connection and try again.');
  const suggest = (kind: 'person' | 'place') => (proposal: AiResult<'person'>) => {
    setSuggested({ secret: proposal.secret, n: (suggested?.n ?? 0) + 1 });
    setEditing({ kind, name: proposal.name, text: proposal.text, status: 'planned' });
  };
  const closeForm = () => {
    setEditing(null);
    setSuggested(undefined);
  };
  const sessionTitle = (id: string | null | undefined) =>
    brief.sessions.find((s) => s.id === id)?.title;
  const visible = cards.filter((c) => show === '' || c.sessionId === show);

  /** Starts the fight a card describes, and notes it on the timeline. */
  const startFightFrom = (card: Card) => {
    let fight = startFight(party);
    for (const enemy of details[card.id]?.enemies ?? []) {
      const found = creature(enemy.creatureId);
      if (found) {
        fight = addEnemies(fight, { ...found, attack: found.attack ?? '' }, enemy.count, () =>
          crypto.randomUUID(),
        );
      }
    }
    saveFight(campaignId, fight).catch(fail);
    addBeat(campaignId, uid, {
      text: `A fight began: ${card.name}.`,
      milestone: false,
      private: false,
      cardId: card.id,
      kind: 'fight',
    }).catch(fail);
    if (card.status === 'planned') setCardStatus(campaignId, card.id, 'met').catch(fail);
    onFight?.();
  };

  return (
    <section aria-labelledby="cards">
      <h2 id="cards">
        {isWarden ? 'Cards: your plan and your record' : 'People, places and things'}
      </h2>
      {isWarden && (
        <p className="hint">
          Make a card for anything you want to plan or remember: a person, a place, a creature, a
          fight, a puzzle, loot, an open question. A planned card is yours alone until you reveal
          it, and players never see your private notes. Tie cards to a session to lay out its plan.
        </p>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {isWarden && brief.sessions.length > 0 && cards.length > 0 && (
        <label className="form-row">
          Show
          <select value={show} onChange={(e) => setShow(e.target.value)}>
            <option value="">Every card</option>
            {brief.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                The plan for {s.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {visible.length === 0 && (
        <p className="muted">{isWarden ? 'No cards yet.' : 'Nothing has been revealed yet.'}</p>
      )}
      <ul className="record">
        {visible.map((c) => {
          const stats =
            isWarden && c.kind === 'creature' ? creature(details[c.id]?.creatureId) : undefined;
          const enemies = isWarden && c.kind === 'fight' ? (details[c.id]?.enemies ?? []) : [];
          return (
            <li key={c.id} data-testid={`card-${c.name}`}>
              <strong>{c.name}</strong>
              <span className="tag quiet">{CARD_KIND_LABEL[c.kind]}</span>
              <span className={c.status === 'planned' ? 'tag warn' : 'tag'}>
                {c.status === 'planned' ? 'Planned' : CARD_STATUS_LABEL[c.status]}
              </span>
              {isWarden && sessionTitle(c.sessionId) && (
                <span className="tag quiet">{sessionTitle(c.sessionId)}</span>
              )}
              {c.text && <p className="prewrap">{c.text}</p>}
              {stats && (
                <p>
                  <em>{stats.name}:</em> HP {stats.hp} · Armor {stats.armor} · STR {stats.str} · DEX{' '}
                  {stats.dex} · WIL {stats.wil}
                  {stats.attack ? ` · ${stats.attack}` : ''}
                </p>
              )}
              {enemies.length > 0 && (
                <p>
                  <em>Enemies:</em>{' '}
                  {enemies
                    .map((e) => `${e.count} × ${creature(e.creatureId)?.name ?? 'unknown'}`)
                    .join(', ')}
                </p>
              )}
              {isWarden && notes[c.id] && (
                <p className="prewrap muted">
                  <em>Private:</em> {notes[c.id]}
                </p>
              )}
              {isWarden && (
                <div className="button-row">
                  {c.kind === 'fight' && enemies.length > 0 && (
                    <button
                      type="button"
                      className="button small primary"
                      onClick={() => startFightFrom(c)}
                    >
                      Start this fight<span className="sr-only">: {c.name}</span>
                    </button>
                  )}
                  {c.status === 'planned' && (
                    <button
                      type="button"
                      className={c.kind === 'fight' ? 'button small' : 'button small primary'}
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
          );
        })}
      </ul>
      {isWarden &&
        (editing ? (
          <CardForm
            key={editing.id ?? `new-${suggested?.n ?? 0}`}
            card={editing}
            suggested={!editing.id && suggested !== undefined}
            notes={editing.id ? (notes[editing.id] ?? '') : (suggested?.secret ?? '')}
            details={editing.id ? (details[editing.id] ?? {}) : {}}
            creatures={creatures.map((c) => ({ id: c.id, name: c.name }))}
            sessions={brief.sessions.map((s) => ({ id: s.id, title: s.title }))}
            onSave={(card, privateNotes, cardDetails) => {
              saveCard(campaignId, card, privateNotes, cardDetails).catch(fail);
              closeForm();
            }}
            onDelete={
              editing.id
                ? () => {
                    deleteCard(campaignId, editing.id!).catch(fail);
                    closeForm();
                  }
                : undefined
            }
            onCancel={() => closeForm()}
          />
        ) : (
          <button
            type="button"
            className="button small"
            onClick={() => setEditing(show ? { sessionId: show } : {})}
          >
            New card
          </button>
        ))}
      {isWarden && (
        <div className="ai-row">
          <AiSuggest
            action="person"
            campaignId={campaignId}
            label="Suggest a person"
            onProposal={suggest('person')}
          />
          <AiSuggest
            action="place"
            campaignId={campaignId}
            label="Suggest a place"
            hint={false}
            onProposal={suggest('place')}
          />
        </div>
      )}
    </section>
  );
}

function CardForm({
  card,
  notes,
  details,
  creatures,
  sessions,
  suggested = false,
  onSave,
  onDelete,
  onCancel,
}: {
  card: Partial<Card>;
  notes: string;
  details: CardDetails;
  creatures: { id: string; name: string }[];
  sessions: { id: string; title: string }[];
  /** Whether the AI filled this in. */
  suggested?: boolean;
  onSave: (
    card: Pick<Card, 'kind' | 'name' | 'text' | 'status' | 'sessionId'> & {
      id?: string;
      createdAt?: number;
    },
    notes: string,
    details: CardDetails,
  ) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<CardKind>(card.kind ?? 'person');
  const [name, setName] = useState(card.name ?? '');
  const [text, setText] = useState(card.text ?? '');
  const [status, setStatus] = useState<CardStatus>(card.status ?? 'planned');
  const [sessionId, setSessionId] = useState(card.sessionId ?? '');
  const [privateNotes, setPrivateNotes] = useState(notes);
  const [creatureId, setCreatureId] = useState(details.creatureId ?? '');
  const [enemies, setEnemies] = useState(
    details.enemies?.length ? details.enemies : [{ creatureId: creatures[0]!.id, count: 1 }],
  );
  const help = KIND_HELP[kind];
  const setEnemy = (index: number, patch: Partial<(typeof enemies)[number]>) =>
    setEnemies(enemies.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  return (
    <form
      className="form panel"
      aria-label={card.id ? `Edit ${card.name}` : 'New card'}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave(
          {
            id: card.id,
            createdAt: card.createdAt,
            kind,
            name: name.trim(),
            text,
            status,
            sessionId: sessionId || null,
          },
          privateNotes,
          {
            creatureId: kind === 'creature' ? creatureId || null : null,
            enemies: kind === 'fight' ? enemies.filter((x) => x.count > 0) : [],
          },
        );
      }}
    >
      {suggested && <AiNote />}
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
      {kind === 'creature' && (
        <label>
          Its numbers
          <select value={creatureId} onChange={(e) => setCreatureId(e.target.value)}>
            <option value="">None yet</option>
            {creatures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="hint">
            Choose a creature from the rulebook or your Workshop. Make a new one on the Workshop
            tab.
          </span>
        </label>
      )}
      {kind === 'fight' && (
        <fieldset className="choices">
          <legend>Who is in the fight</legend>
          {enemies.map((enemy, index) => (
            <div key={index} className="kit-row">
              <label>
                Enemy {index + 1}
                <select
                  value={enemy.creatureId}
                  onChange={(e) => setEnemy(index, { creatureId: e.target.value })}
                >
                  {creatures.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                How many<span className="sr-only"> of enemy {index + 1}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={12}
                  value={enemy.count}
                  onChange={(e) =>
                    setEnemy(index, {
                      count: Math.max(0, Math.min(12, Number(e.target.value) || 0)),
                    })
                  }
                />
              </label>
            </div>
          ))}
          {enemies.length < 4 && (
            <button
              type="button"
              className="link-button"
              onClick={() => setEnemies([...enemies, { creatureId: creatures[0]!.id, count: 1 }])}
            >
              Add another kind of enemy
            </button>
          )}
          <p className="hint">
            When the moment comes, &ldquo;Start this fight&rdquo; on the card sets up the fight
            tracker with these enemies.
          </p>
        </fieldset>
      )}
      <label>
        What the players can know
        <textarea
          rows={3}
          maxLength={2000}
          value={text}
          placeholder={help.shown}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <label>
        Your private notes
        <textarea
          rows={3}
          maxLength={2000}
          value={privateNotes}
          placeholder={help.secret}
          onChange={(e) => setPrivateNotes(e.target.value)}
        />
      </label>
      {sessions.length > 0 && (
        <label>
          Part of the plan for
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">No session in particular</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
      )}
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

/** The AI's two jobs on the timeline: a recap to share, and record-keeping to approve. */
function AiStory({
  campaignId,
  uid,
  cards,
  onProblem,
}: {
  campaignId: string;
  uid: string;
  cards: Card[];
  onProblem: () => void;
}) {
  const [recap, setRecap] = useState<AiResult<'recap'>>();
  const [text, setText] = useState('');
  const [filing, setFiling] = useState<AiResult<'filing'>>();
  // What has been accepted or skipped, so each proposal is dealt with once.
  const [dealt, setDealt] = useState<string[]>([]);
  const deal = (key: string) => setDealt((d) => [...d, key]);
  const cardName = (id: string) => cards.find((c) => c.id === id)?.name ?? 'A card';

  return (
    <div className="panel">
      <h3>AI help</h3>
      <div className="ai-row">
        <AiSuggest
          action="recap"
          campaignId={campaignId}
          label="Recap the session"
          hint={false}
          onProposal={(proposal) => {
            setRecap(proposal);
            setText(`${proposal.title}. ${proposal.summary}`);
            setDealt([]);
          }}
        />
        <AiSuggest
          action="filing"
          campaignId={campaignId}
          label="Suggest filing"
          hint={false}
          onProposal={(proposal) => {
            setFiling(proposal);
            setDealt([]);
          }}
        />
      </div>

      {recap && (
        <div role="group" aria-label="Suggested recap">
          <AiNote />
          <label className="form-row">
            Recap
            <textarea
              rows={6}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="button small primary"
              disabled={!text.trim()}
              onClick={() => {
                addBeat(campaignId, uid, {
                  text: text.trim(),
                  milestone: true,
                  private: false,
                  cardId: null,
                }).catch(onProblem);
                setRecap(undefined);
              }}
            >
              Add the recap to the timeline
            </button>
            <button type="button" className="button small" onClick={() => setRecap(undefined)}>
              Discard
            </button>
          </div>
          {recap.openThreads.length > 0 && (
            <ul className="record" aria-label="Suggested open threads">
              {recap.openThreads
                .filter((thread) => !dealt.includes(`thread:${thread}`))
                .map((thread) => (
                  <li key={thread}>
                    {thread}
                    <div className="button-row">
                      <button
                        type="button"
                        className="button small"
                        onClick={() => {
                          saveCard(
                            campaignId,
                            {
                              kind: 'thread',
                              name: thread.slice(0, 80),
                              text: '',
                              status: 'planned',
                            },
                            '',
                          ).catch(onProblem);
                          deal(`thread:${thread}`);
                        }}
                      >
                        Keep as an open thread
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {filing && (
        <div role="group" aria-label="Suggested filing">
          <AiNote />
          {filing.newCards.length + filing.changedCards.length === 0 && (
            <p className="muted">Nothing needs filing.</p>
          )}
          <ul className="record">
            {filing.newCards
              .filter((c) => !dealt.includes(`new:${c.name}`))
              .map((c) => (
                <li key={c.name}>
                  <strong>{c.name}</strong>
                  <span className="tag quiet">New {CARD_KIND_LABEL[c.kind].toLowerCase()}</span>
                  <p>{c.text}</p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button small primary"
                      aria-label={`Add a card for ${c.name}`}
                      onClick={() => {
                        saveCard(campaignId, { ...c, status: 'planned' }, '').catch(onProblem);
                        deal(`new:${c.name}`);
                      }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="button small"
                      aria-label={`Skip ${c.name}`}
                      onClick={() => deal(`new:${c.name}`)}
                    >
                      Skip
                    </button>
                  </div>
                </li>
              ))}
            {filing.changedCards
              .filter((c) => !dealt.includes(`changed:${c.id}`))
              .map((c) => (
                <li key={c.id}>
                  <strong>{cardName(c.id)}</strong>
                  <span className="tag quiet">
                    Mark as {CARD_STATUS_LABEL[c.status].toLowerCase()}
                  </span>
                  <p>{c.why}</p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button small primary"
                      aria-label={`Accept the change to ${cardName(c.id)}`}
                      onClick={() => {
                        setCardStatus(campaignId, c.id, c.status).catch(onProblem);
                        deal(`changed:${c.id}`);
                      }}
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      className="button small"
                      aria-label={`Skip the change to ${cardName(c.id)}`}
                      onClick={() => deal(`changed:${c.id}`)}
                    >
                      Skip
                    </button>
                  </div>
                </li>
              ))}
          </ul>
          <p className="hint">
            New cards are added as planned, so players do not see them until you reveal them.
          </p>
        </div>
      )}
    </div>
  );
}
