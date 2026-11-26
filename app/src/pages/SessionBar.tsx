import { useEffect, useState } from 'react';
import { endSession, startSession, type PlaySession } from '../data/record';

interface Props {
  campaignId: string;
  isWarden: boolean;
  aiWarden: boolean;
  sessions: PlaySession[];
  active: PlaySession | null;
  loaded: boolean;
  /** The players in the campaign, for the session's record. */
  players: string[];
}

const clock = (at: number) => new Date(at).toLocaleTimeString([], { timeStyle: 'short' });

/**
 * A campaign is played in sessions: one sitting, started and ended. This
 * shows whether one is running, and lets the Warden start and end it.
 */
export function SessionBar({
  campaignId,
  isWarden,
  aiWarden,
  sessions,
  active,
  loaded,
  players,
}: Props) {
  const [problem, setProblem] = useState<string>();
  const [, tick] = useState(0);
  // Keeps "for 42 min" moving while a session runs.
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, [active]);
  if (!loaded) return null;
  const fail = () => setProblem('That could not be saved. Check your connection and try again.');
  const minutes = active ? Math.max(0, Math.round((Date.now() - active.startedAt) / 60_000)) : 0;
  const last = sessions.at(-1);

  return (
    <div
      className={active ? 'session-bar running' : 'session-bar'}
      role="group"
      aria-label="Session"
    >
      {active ? (
        <>
          <p data-testid="session-status">
            <strong>Session {active.number} is being played.</strong> Started at{' '}
            {clock(active.startedAt)}
            {minutes > 0 ? `, ${minutes} min ago` : ''}. Everything that happens goes on the
            timeline.
          </p>
          {isWarden && (
            <button
              type="button"
              className="button small"
              onClick={() => {
                setProblem(undefined);
                endSession(campaignId, active).catch(fail);
              }}
            >
              End the session
            </button>
          )}
        </>
      ) : (
        <>
          <p data-testid="session-status">
            <strong>No session is being played.</strong>{' '}
            {isWarden
              ? 'Start one when you sit down to play. Rolls, changes, fights and story beats are recorded only during a session.'
              : 'The Warden starts one when the group sits down to play.'}
          </p>
          {isWarden && (
            <button
              type="button"
              className="button small primary"
              onClick={() => {
                setProblem(undefined);
                startSession(campaignId, {
                  number: (last?.number ?? 0) + 1,
                  wardenKind: aiWarden ? 'ai' : 'human',
                  players,
                }).catch(fail);
              }}
            >
              Start session {(last?.number ?? 0) + 1}
            </button>
          )}
        </>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}
