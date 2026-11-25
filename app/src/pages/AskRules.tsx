import { useState, type FormEvent } from 'react';
import { askAi, type RulesAnswer } from '../data/ai';

/** A rules question, answered from the rulebook with a link to the section it came from. */
export function AskRules() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<RulesAnswer>();
  const [problem, setProblem] = useState<string>();

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    if (question.trim().length < 3) return;
    setBusy(true);
    setProblem(undefined);
    setAnswer(undefined);
    try {
      setAnswer((await askAi('rules', { question: question.trim() })).proposal as RulesAnswer);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="ask">
      <h2 id="ask">Ask the rulebook</h2>
      <form className="form" aria-label="Ask the rulebook" onSubmit={ask}>
        <label>
          Your question
          <input
            value={question}
            maxLength={300}
            placeholder="Who goes first in a fight?"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button small ai-button"
          disabled={busy || question.trim().length < 3}
        >
          {busy ? 'Looking it up…' : 'Ask'}
        </button>
      </form>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      {answer && (
        <div className="note" role="status" aria-label="Answer">
          <p>{answer.answer}</p>
          {answer.link && (
            <p>
              <a href={answer.link}>Read the rule: {answer.sectionTitle}</a>
            </p>
          )}
          <p className="hint">
            Written by AI from the rulebook. The rulebook and your Warden have the last word.
          </p>
        </div>
      )}
    </section>
  );
}
