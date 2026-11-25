import { GUEST_AI_REQUESTS, PRICES, UNLIMITED } from '@waymark/rules';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  deleteMyAccount,
  exportMyData,
  openPortal,
  saveKeep,
  startCheckout,
  useAccount,
} from '../data/account';
import { useAiUsed } from '../data/ai';
import { useMemberships } from '../data/useCampaign';
import { useCharacterStore } from '../data/useCharacters';

const SITE = 'https://waymark-rpg.web.app';
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (at: number | null) =>
  at ? new Date(at).toLocaleDateString([], { dateStyle: 'long' }) : 'the end of the period';
const limitText = (used: number, limit: number) =>
  limit >= UNLIMITED ? `${used}, with no limit` : `${used} of ${limit}`;

const PLAN_NAME = { free: 'Free', paid: 'Paid', 'ai-warden': 'AI Warden' } as const;

/** Your plan, what you are using, and your data: export it or delete it. */
export function Account() {
  const { user, signOut } = useAuth();
  const uid = user!.uid;
  const navigate = useNavigate();
  const account = useAccount(uid);
  const { characters = [] } = useCharacterStore();
  const run = (useMemberships(uid) ?? []).filter((m) => m.role === 'warden');
  const aiUsed = useAiUsed(uid);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  // A choice shows at once; the saved value follows.
  const [chosen, setChosen] = useState<{ character?: string; campaign?: string }>({});
  const { entitlement, plan, limits } = account;

  const attempt = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(undefined);
    try {
      await action();
    } catch (problem) {
      setMessage((problem as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const go = (address: () => Promise<{ url: string }>) =>
    attempt(async () => {
      window.location.assign((await address()).url);
    });
  const download = () =>
    attempt(async () => {
      const data = await exportMyData();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      link.download = 'waymark-my-data.json';
      link.click();
      URL.revokeObjectURL(link.href);
      setMessage('Your data has been downloaded.');
    });
  const remove = () =>
    attempt(async () => {
      await deleteMyAccount();
      await signOut().catch(() => {});
      navigate('/');
    });

  const overCharacters = characters.length > limits.characters;
  const overCampaigns = run.length > limits.campaigns;
  const keptCharacter =
    characters.find((c) => account.characterInUse(c.id, c.slot))?.id ?? characters[0]?.id;
  const keptCampaign = run.find((m) => account.campaignInUse(m.campaignId))?.campaignId;

  return (
    <main className="screen">
      <p className="back">
        <Link to="/">← Home</Link>
      </p>
      <h1>Your account</h1>
      <p className="muted">
        {user?.isAnonymous ? 'You are playing as a guest.' : (user?.email ?? user?.displayName)}
      </p>
      <p className="note" role="status" hidden={!message}>
        {message}
      </p>

      <section aria-labelledby="plan">
        <h2 id="plan">Your plan</h2>
        {entitlement === undefined ? (
          <p className="muted">Loading…</p>
        ) : (
          <>
            <p data-testid="plan">
              <strong>{PLAN_NAME[plan]} plan.</strong>{' '}
              {plan === 'free' && 'One character of your own, and one campaign to run.'}
              {plan !== 'free' &&
                entitlement.status === 'active' &&
                `Renews on ${day(entitlement.renewsAt)}.`}
              {plan !== 'free' &&
                entitlement.status === 'ending' &&
                `Cancelled. It runs until ${day(entitlement.renewsAt)}.`}
              {plan !== 'free' &&
                entitlement.status === 'past_due' &&
                'Your last payment did not go through. Please check your card.'}
            </p>
            <ul className="record">
              <li data-testid="usage-characters">
                Your characters: {limitText(characters.length, limits.characters)}
              </li>
              <li data-testid="usage-campaigns">
                Campaigns you run: {limitText(run.length, limits.campaigns)}
              </li>
              <li>Campaigns you join as a player: no limit</li>
              <li data-testid="usage-ai">
                AI help this month: {aiUsed} of{' '}
                {user?.isAnonymous ? GUEST_AI_REQUESTS : limits.aiRequests} requests
              </li>
            </ul>
            {plan === 'free' ? (
              user?.isAnonymous ? (
                <p className="hint">
                  To take a paid plan, first create an account from the home screen.
                </p>
              ) : (
                <>
                  <p>The paid plan removes both limits.</p>
                  <div className="button-row">
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy}
                      onClick={() => go(() => startCheckout('monthly'))}
                    >
                      {dollars(PRICES.monthly)} a month
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={busy}
                      onClick={() => go(() => startCheckout('yearly'))}
                    >
                      {dollars(PRICES.yearly)} a year
                    </button>
                  </div>
                  <p className="hint">Cancel at any time. Nothing you made is ever deleted.</p>
                </>
              )
            ) : (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => go(openPortal)}
              >
                Change card or cancel
              </button>
            )}
          </>
        )}
      </section>

      {(overCharacters || overCampaigns) && (
        <section aria-labelledby="keep">
          <h2 id="keep">Choose what to keep in use</h2>
          <p>
            You have more than the {PLAN_NAME[plan].toLowerCase()} plan allows. Nothing has been
            deleted. What you do not choose stays safe and can be read, but not changed, until you
            take a paid plan again.
          </p>
          {overCharacters && (
            <fieldset className="choices">
              <legend>Character to keep in use</legend>
              {characters.map((c) => (
                <label key={c.id} className="choice">
                  <input
                    type="radio"
                    name="keep-character"
                    checked={(chosen.character ?? keptCharacter) === c.id}
                    onChange={() => {
                      setChosen({ ...chosen, character: c.id });
                      void attempt(() => saveKeep(uid, { keepCharacters: [c.id] }));
                    }}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </fieldset>
          )}
          {overCampaigns && (
            <fieldset className="choices">
              <legend>Campaign to keep running</legend>
              {run.map((m) => (
                <label key={m.campaignId} className="choice">
                  <input
                    type="radio"
                    name="keep-campaign"
                    checked={(chosen.campaign ?? keptCampaign) === m.campaignId}
                    onChange={() => {
                      setChosen({ ...chosen, campaign: m.campaignId });
                      void attempt(() => saveKeep(uid, { keepCampaigns: [m.campaignId] }));
                    }}
                  />
                  <span>{m.name}</span>
                </label>
              ))}
            </fieldset>
          )}
        </section>
      )}
      <section aria-labelledby="data">
        <h2 id="data">Your data</h2>
        <p>
          Download everything the app holds about you: your characters, the campaigns you run, and
          your worlds.
        </p>
        <button type="button" className="button" disabled={busy} onClick={download}>
          Export my data
        </button>
        <p className="hint">
          <a href={`${SITE}/privacy/`}>Privacy policy</a> ·{' '}
          <a href={`${SITE}/terms/`}>Terms of use</a>
        </p>
      </section>

      <section className="danger-zone" aria-labelledby="delete">
        <h2 id="delete">Delete your account</h2>
        {deleting ? (
          <>
            <p>
              This deletes your characters, your worlds, and every campaign you run, for everyone in
              them. Players in your campaigns keep their own characters. A paid plan is cancelled.
              This cannot be undone.
            </p>
            <label className="form-row">
              Type DELETE to confirm
              <input
                value={confirm}
                autoComplete="off"
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                className="button danger"
                disabled={busy || confirm.trim() !== 'DELETE'}
                onClick={remove}
              >
                Delete everything
              </button>
              <button type="button" className="button" onClick={() => setDeleting(false)}>
                Keep my account
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="link-button" onClick={() => setDeleting(true)}>
            Delete my account
          </button>
        )}
      </section>
    </main>
  );
}
