import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { rollForWarden, sayToWarden, usePlayState, useTurns, type PendingRoll } from '../data/play';
import { RollInput } from '../ui/RollInput';
import { Narrator, deviceVoice, loadSpeech, saveSpeech, type SpeechSettings } from '../ui/speech';

interface Props {
  campaignId: string;
  uid: string;
  isOwner: boolean;
  /** Whether a session is being played. The story moves only during one. */
  running: boolean;
}

/** An AI-run campaign: the story so far, what you do next, and the Warden's voice. */
export function Play({ campaignId, uid, isOwner, running }: Props) {
  const turns = useTurns(campaignId);
  const { pending, suggestions } = usePlayState(campaignId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [roll, setRoll] = useState<number>();
  const [settings, setSettings] = useState<SpeechSettings>(() => loadSpeech());
  const [paused, setPaused] = useState(false);
  const voice = useMemo(() => deviceVoice(), []);
  const narrator = useRef<Narrator>(null);
  if (!narrator.current) narrator.current = new Narrator(voice, settings);
  const spokenUpTo = useRef<number | null>(null);
  const end = useRef<HTMLDivElement>(null);

  // New narration is read aloud. What was already there when the page opened is not.
  useEffect(() => {
    const latest = turns.at(-1)?.at ?? 0;
    if (spokenUpTo.current === null) {
      if (turns.length > 0) spokenUpTo.current = latest;
      return;
    }
    for (const turn of turns) {
      if (turn.kind === 'narration' && turn.at > spokenUpTo.current)
        narrator.current!.say(turn.text);
    }
    spokenUpTo.current = Math.max(spokenUpTo.current, latest);
    end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns]);
  useEffect(() => () => narrator.current?.stop(), []);

  const change = (next: SpeechSettings) => {
    setSettings(next);
    saveSpeech(next);
    narrator.current!.update(next);
  };
  const send = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setProblem(undefined);
    // An empty story has nothing to compare against, so mark the start now.
    if (spokenUpTo.current === null) spokenUpTo.current = 0;
    try {
      await action();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const say = (words: string) => {
    if (!words.trim() || busy) return;
    setText('');
    void send(() => sayToWarden(campaignId, words.trim()));
  };
  const mine = (p: PendingRoll) => p.characterId.startsWith(`${uid}_`) || isOwner;

  return (
    <section aria-labelledby="play">
      <h2 id="play">The story</h2>
      <div className="speech" role="group" aria-label="Narration voice">
        {voice ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.on}
                onChange={(e) => change({ ...settings, on: e.target.checked })}
              />
              Read narration aloud
            </label>
            <button
              type="button"
              className="button small"
              onClick={() => {
                if (paused) narrator.current!.resume();
                else narrator.current!.pause();
                setPaused(!paused);
              }}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              className="button small"
              onClick={() => narrator.current!.replay()}
            >
              Replay
            </button>
            <label className="inline-field">
              Speed
              <select
                value={settings.rate}
                onChange={(e) => change({ ...settings, rate: Number(e.target.value) })}
              >
                <option value={0.8}>Slow</option>
                <option value={1}>Normal</option>
                <option value={1.25}>Fast</option>
              </select>
            </label>
            {voice.voices().length > 1 && (
              <label className="inline-field">
                Voice
                <select
                  value={settings.voice ?? ''}
                  onChange={(e) => change({ ...settings, voice: e.target.value || null })}
                >
                  <option value="">The device&rsquo;s usual voice</option>
                  {voice.voices().map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        ) : (
          <p className="hint">This device cannot read aloud. The story is all here in text.</p>
        )}
      </div>

      {turns.length === 0 && (
        <p className="muted">
          The story has not started. Say what your character does, or ask the Warden to set the
          scene.
        </p>
      )}
      <ol className="story" aria-label="The story so far" aria-live="polite">
        {turns.map((turn) => (
          <li key={turn.id} className={`story-${turn.kind}`}>
            <span className="story-who">{turn.who}</span>
            <p>{turn.text}</p>
          </li>
        ))}
      </ol>
      <div ref={end} />

      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      {!running ? (
        <p className="note">
          No session is being played.{' '}
          {isOwner
            ? 'Start one, above, to play.'
            : 'The campaign\u2019s owner starts one when the group sits down to play.'}
        </p>
      ) : pending ? (
        <div className="panel alert" role="group" aria-label="A roll is needed">
          <p>
            <strong>{pending.label}</strong>
          </p>
          {mine(pending) ? (
            <>
              <RollInput
                label="Your roll"
                spec={{ count: 1, sides: pending.sides }}
                value={roll}
                onChange={setRoll}
              />
              <button
                type="button"
                className="button primary"
                disabled={busy || roll === undefined || roll < 1 || roll > pending.sides}
                onClick={() => {
                  const value = roll!;
                  setRoll(undefined);
                  void send(() => rollForWarden(campaignId, value));
                }}
              >
                {busy ? 'The Warden is thinking…' : 'Send the roll'}
              </button>
            </>
          ) : (
            <p className="hint">Waiting for that player to roll.</p>
          )}
        </div>
      ) : (
        <>
          {suggestions.length > 0 && (
            <div className="button-row" role="group" aria-label="Suggestions">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="button small"
                  disabled={busy}
                  onClick={() => say(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            className="form"
            aria-label="What do you do?"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              say(text);
            }}
          >
            <label>
              What do you do?
              <input
                value={text}
                maxLength={500}
                placeholder="Say it in your own words"
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button type="submit" className="button primary" disabled={busy || !text.trim()}>
              {busy ? 'The Warden is thinking…' : 'Send'}
            </button>
          </form>
        </>
      )}
      <p className="hint">
        The Warden is an AI. It tells the story; the app&rsquo;s rules decide every roll and number.
      </p>
    </section>
  );
}
