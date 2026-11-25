import type { AiAction, AiResult } from '@waymark/rules';
import { useId, useState } from 'react';
import { askAi } from '../data/ai';

interface Props<A extends AiAction> {
  action: A;
  campaignId: string;
  /** What the button says, such as "Suggest a creature". */
  label: string;
  /** Whether to offer a box for a few words about what is wanted. */
  hint?: boolean;
  onProposal: (proposal: AiResult<A>) => void;
}

/**
 * One AI button. It asks for a single proposal and hands it on to be
 * checked and changed by a person. Nothing is saved from here.
 */
export function AiSuggest<A extends AiAction>({
  action,
  campaignId,
  label,
  hint = true,
  onProposal,
}: Props<A>) {
  const id = useId();
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();
  const [count, setCount] = useState<string>();

  const ask = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const answer = await askAi(action, { campaignId, hint: words.trim() });
      setCount(`${answer.used} of ${answer.allowance} AI requests used this month.`);
      onProposal(answer.proposal);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai">
      {hint && (
        <label htmlFor={id}>
          Anything in mind? (optional)
          <input
            id={id}
            value={words}
            maxLength={300}
            placeholder="A few words, or leave empty"
            onChange={(e) => setWords(e.target.value)}
          />
        </label>
      )}
      <button type="button" className="button small ai-button" disabled={busy} onClick={ask}>
        {busy ? 'Thinking…' : label}
      </button>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <p className="hint" role="status">
        {count}
      </p>
    </div>
  );
}

/** Shown above a form that the AI filled in. */
export function AiNote() {
  return (
    <p className="note">
      <strong>Suggested by AI.</strong> Check it and change what you like. Nothing is saved until
      you save it.
    </p>
  );
}
