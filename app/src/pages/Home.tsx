import { armorValue, status } from '@waymark/rules';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useAccount, useTidyKeep } from '../data/account';
import { useMemberships } from '../data/useCampaign';
import { useCharacterStore } from '../data/useCharacters';
import { Logo } from '../Logo';
import { AskRules } from './AskRules';
import { JoinCampaignForm, RedeemHandoverForm, StartCampaignForm } from './CampaignForms';

export function Home() {
  const { user, signOut, upgradeWithGoogle, error } = useAuth();
  const memberships = useMemberships(user!.uid);
  const [form, setForm] = useState<'start' | 'join' | 'redeem' | null>(null);
  const { characters, problem } = useCharacterStore();
  const name = user?.isAnonymous ? 'guest' : (user?.displayName ?? 'traveler');
  const account = useAccount(user!.uid);
  const limit = account.limits.characters;
  useTidyKeep(user!.uid, account, characters?.length);
  return (
    <>
      <header className="app-header">
        <span className="brand">
          <Logo size={32} />
          Waymark
        </span>
        <span className="button-row">
          <Link to="/account" className="button small as-link">
            Account
          </Link>
          <button className="button small" onClick={signOut}>
            Sign out
          </button>
        </span>
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
                <strong>
                  {c.name}
                  {!account.characterInUse(c.id, c.slot) && (
                    <span className="tag warn">Read-only</span>
                  )}
                </strong>
                <span className="muted">{c.sheet.background}</span>
                <span>
                  HP {c.sheet.hp.current} of {c.sheet.hp.full} · Armor {armorValue(c.sheet)}
                  {status(c.sheet) !== 'ok' && ` · ${status(c.sheet)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {characters !== undefined && characters.length < limit && (
          <Link to="/new" className="button primary as-link">
            Make a character
          </Link>
        )}
        {characters !== undefined && characters.length >= limit && account.plan === 'free' && (
          <p className="fineprint">
            A free account holds one character. Delete this one to make another, or{' '}
            <Link to="/account">see the paid plan</Link>.
          </p>
        )}
        <h2>Your campaigns</h2>
        {memberships === undefined && <p className="muted">Loading…</p>}
        {memberships?.length === 0 && <p className="muted">You are not in a campaign yet.</p>}
        <ul className="character-list">
          {memberships?.map((m) => (
            <li key={m.campaignId}>
              <Link to={`/k/${m.campaignId}`} className="character-card">
                <strong>{m.name}</strong>
                <span className="muted">
                  {m.role === 'warden' ? 'You are the Warden' : 'You are a player'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="button-row">
          <button
            type="button"
            className="button small"
            aria-expanded={form === 'join'}
            onClick={() => setForm(form === 'join' ? null : 'join')}
          >
            Join with a code
          </button>
          <button
            type="button"
            className="button small"
            aria-expanded={form === 'start'}
            onClick={() => setForm(form === 'start' ? null : 'start')}
          >
            Start a campaign
          </button>
          <button
            type="button"
            className="button small"
            aria-expanded={form === 'redeem'}
            onClick={() => setForm(form === 'redeem' ? null : 'redeem')}
          >
            I have a hand-over code
          </button>
        </div>
        {form === 'join' && <JoinCampaignForm />}
        {form === 'start' && <StartCampaignForm />}
        {form === 'redeem' && <RedeemHandoverForm />}

        <AskRules />

        {user?.isAnonymous && (
          <div className="note">
            <p>You are playing as a guest. Nothing personal is stored about you.</p>
            <p>Create an account to keep your character and campaigns on any device.</p>
            <button type="button" className="button small" onClick={upgradeWithGoogle}>
              Create an account with Google
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}
