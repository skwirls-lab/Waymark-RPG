import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { createCampaign, joinCampaign, redeemHandover } from '../data/campaigns';

/** One small form for the three things that need a name and a word: start, join, and redeem. */
function NameAndWord({
  title,
  wordLabel,
  wordHint,
  button,
  initialWord = '',
  onSubmit,
}: {
  title: string;
  wordLabel: string;
  wordHint?: string;
  button: string;
  initialWord?: string;
  onSubmit: (word: string, name: string) => Promise<string>;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [word, setWord] = useState(initialWord);
  const [name, setName] = useState(user?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(undefined);
    try {
      navigate(await onSubmit(word.trim(), name.trim()));
    } catch (error) {
      setProblem((error as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="form panel" onSubmit={submit} aria-label={title}>
      <h3>{title}</h3>
      <label>
        {wordLabel}
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={60}
          autoComplete="off"
          autoCapitalize="characters"
        />
      </label>
      {wordHint && <p className="hint">{wordHint}</p>}
      <label>
        Your name, as the others will see it
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="nickname"
        />
      </label>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <button
        type="submit"
        className="button primary"
        disabled={busy || word.trim() === '' || name.trim() === ''}
      >
        {busy ? 'Working…' : button}
      </button>
    </form>
  );
}

export const StartCampaignForm = () => (
  <NameAndWord
    title="Start a campaign"
    wordLabel="Campaign name"
    button="Start campaign"
    onSubmit={async (name, displayName) =>
      `/k/${(await createCampaign(name, displayName)).campaignId}`
    }
  />
);

export const JoinCampaignForm = ({ code = '' }: { code?: string }) => (
  <NameAndWord
    title="Join a campaign"
    wordLabel="Join code"
    wordHint="Six letters and numbers, from your Warden."
    button="Join"
    initialWord={code}
    onSubmit={async (joinCode, displayName) =>
      `/k/${(await joinCampaign(joinCode, displayName)).campaignId}`
    }
  />
);

export const RedeemHandoverForm = () => (
  <NameAndWord
    title="Take over a character"
    wordLabel="Hand-over code"
    wordHint="A one-time code from your Warden, for a character they have been running for you."
    button="Take over"
    onSubmit={async (code, displayName) =>
      `/c/${(await redeemHandover(code, displayName)).characterId}`
    }
  />
);

/** Where a join link or QR code lands. */
export function JoinPage() {
  const { code } = useParams();
  return (
    <main className="screen">
      <h1>Join a campaign</h1>
      <p>Enter the name the others will know you by.</p>
      <JoinCampaignForm code={code} />
    </main>
  );
}
