import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  WARDEN_CHARACTER_IDS,
  addLog,
  deleteCampaign,
  leaveCampaign,
  removeMember,
  setMyControl,
  type Member,
  type Summary,
} from '../data/campaigns';
import {
  useCampaign,
  useCampaignCharacters,
  useLog,
  usePresence,
  useRequests,
} from '../data/useCampaign';
import { useCharacterStore } from '../data/useCharacters';
import { ActivityFeed, WardenParty } from './Party';

const STATUS_LABEL: Record<string, string> = {
  critical: 'critical damage',
  dead: 'dead',
  paralyzed: 'paralyzed',
  delirious: 'delirious',
  lost: 'lost to corruption',
};

function conditions(summary: Summary): string {
  const parts = [STATUS_LABEL[summary.status], summary.deprived ? 'deprived' : ''].filter(Boolean);
  return parts.length ? ` · ${parts.join(', ')}` : '';
}

export function Campaign() {
  const { cid } = useParams();
  const { user } = useAuth();
  const uid = user!.uid;
  const navigate = useNavigate();
  const store = useCharacterStore();
  const {
    campaign,
    members: memberList,
    summaries,
    wardenCharacters,
    isWarden,
  } = useCampaign(cid!, uid);
  const members = memberList ?? [];
  const playerCharacters = useCampaignCharacters(cid!, isWarden);
  const requests = useRequests(isWarden ? cid! : null, null);
  const log = useLog(cid!);
  const myName = members.find((m) => m.uid === uid)?.displayName ?? user?.displayName ?? 'Someone';
  const present = usePresence(memberList ? cid! : null, uid, myName);
  const [problem, setProblem] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [qr, setQr] = useState<string>();
  // The choice shows at once; the saved value follows.
  const [chosenControl, setChosenControl] = useState<Member['control']>();

  const joinLink = campaign ? `${window.location.origin}/join/${campaign.joinCode}` : '';
  useEffect(() => {
    if (!isWarden || !joinLink) return;
    let cancelled = false;
    void import('qrcode')
      .then((QR) => QR.toDataURL(joinLink, { margin: 1, width: 220 }))
      .then((url) => !cancelled && setQr(url));
    return () => {
      cancelled = true;
    };
  }, [isWarden, joinLink]);

  if (campaign === undefined) {
    return (
      <main className="screen center" aria-busy="true">
        <p className="lede">Loading…</p>
      </main>
    );
  }
  // A removed player's open screen is not told the campaign is closed to them,
  // but they do see themselves leave the member list.
  const removed = memberList !== undefined && !memberList.some((m) => m.uid === uid);
  if (campaign === null || removed) {
    return (
      <main className="screen">
        <h1>No such campaign</h1>
        <p>It may have been deleted, or you may no longer be in it.</p>
        <p>
          <Link to="/">Back to the start</Link>
        </p>
      </main>
    );
  }

  const run = async (action: () => Promise<unknown>) => {
    setProblem(undefined);
    try {
      await action();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  const me = members.find((m) => m.uid === uid);
  const nameOf = (ownerUid: string | null) =>
    members.find((m) => m.uid === ownerUid)?.displayName ?? 'someone';
  const mine = store.characters ?? [];
  const here = mine.filter((c) => c.campaignId === campaign.id);
  const elsewhere = mine.filter((c) => c.campaignId !== campaign.id);
  const freeWardenSlot = WARDEN_CHARACTER_IDS.find(
    (id) => !wardenCharacters.some((c) => c.id === id),
  );

  return (
    <main className="screen">
      <p className="back">
        <Link to="/">← Home</Link>
      </p>
      <p className="eyebrow">{isWarden ? 'You are the Warden' : 'Campaign'}</p>
      <h1>{campaign.name}</h1>
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}

      {isWarden && (
        <section aria-labelledby="invite">
          <h2 id="invite">Invite players</h2>
          <p>
            Players join with this code, the link, or the picture below. They do not need an
            account.
          </p>
          <p className="join-code" data-testid="join-code">
            {campaign.joinCode}
          </p>
          <p className="hint join-link">{joinLink}</p>
          {qr && (
            <img
              className="qr"
              src={qr}
              width={220}
              height={220}
              alt={`QR code that opens ${joinLink}`}
            />
          )}
        </section>
      )}

      {isWarden ? (
        <WardenParty
          campaign={campaign}
          uid={uid}
          wardenName={myName}
          members={members}
          summaries={summaries}
          wardenCharacters={wardenCharacters}
          playerCharacters={playerCharacters}
          requests={requests}
          canAddCharacter={!!freeWardenSlot}
        />
      ) : (
        <section aria-labelledby="party">
          <h2 id="party">The party</h2>
          {summaries.length === 0 && <p className="muted">No characters yet.</p>}
          <ul className="party">
            {summaries.map((s) => (
              <li key={s.id} data-testid={`summary-${s.name}`}>
                <div>
                  <strong>{s.name}</strong>
                  <span className="muted">
                    {' '}
                    {s.kind === 'warden' ? 'run by the Warden' : `played by ${nameOf(s.ownerUid)}`}
                  </span>
                  <div>
                    HP {s.hp.current} of {s.hp.full}
                    {conditions(s)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="yours">
        <h2 id="yours">Your character here</h2>
        {here.map((c) => (
          <p key={c.id} className="row">
            <Link to={`/c/${c.id}`}>{c.name}</Link>
            <button
              type="button"
              className="button small"
              onClick={() => store.save({ ...c, campaignId: null })}
            >
              Take out of this campaign
            </button>
          </p>
        ))}
        {here.length === 0 &&
          elsewhere.map((c) => (
            <p key={c.id} className="row">
              <span>{c.name}</span>
              <button
                type="button"
                className="button small"
                onClick={() => store.save({ ...c, campaignId: campaign.id })}
              >
                Bring {c.name} in
              </button>
            </p>
          ))}
        {mine.length === 0 && (
          <p>
            You have no character yet. <Link to="/new">Make one</Link>, then come back to bring them
            in.
          </p>
        )}
      </section>

      {me && !isWarden && (
        <section>
          <fieldset className="choices">
            <legend>How may the Warden change your sheet?</legend>
            {(
              [
                ['ask', 'Ask me first. Each change waits for me to accept it.'],
                ['direct', 'Directly. Changes apply at once.'],
              ] as [Member['control'], string][]
            ).map(([value, label]) => (
              <label key={value} className="choice">
                <input
                  type="radio"
                  name="control"
                  checked={(chosenControl ?? me.control) === value}
                  onChange={() => {
                    setChosenControl(value);
                    void run(() => setMyControl(campaign.id, uid, value));
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <p className="hint">You can change this at any time.</p>
        </section>
      )}

      <section aria-labelledby="players">
        <h2 id="players">Who is here</h2>
        <ul className="party">
          {members.map((m) => (
            <li key={m.uid}>
              <span>
                <strong>{m.displayName}</strong>
                {present.has(m.uid) && <span className="tag here">here now</span>}
                <span className="muted">
                  {' '}
                  {m.role === 'warden'
                    ? 'Warden'
                    : m.control === 'direct'
                      ? 'player · Warden may change their sheet'
                      : 'player · asks first'}
                </span>
              </span>
              {isWarden && m.role !== 'warden' && (
                <button
                  type="button"
                  className="button small"
                  onClick={() => run(() => removeMember(campaign.id, m.uid))}
                  aria-label={`Remove ${m.displayName}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <ActivityFeed
        log={log}
        onRoll={(text) => void addLog(campaign.id, uid, myName, `${myName} ${text}`)}
      />

      <section className="danger-zone">
        {confirming ? (
          <p>
            {isWarden ? `Delete ${campaign.name} for everyone?` : `Leave ${campaign.name}?`}{' '}
            <button
              type="button"
              className="button small danger"
              onClick={() =>
                run(async () => {
                  await (isWarden ? deleteCampaign(campaign.id) : leaveCampaign(campaign.id));
                  navigate('/');
                })
              }
            >
              {isWarden ? 'Yes, delete' : 'Yes, leave'}
            </button>{' '}
            <button type="button" className="button small" onClick={() => setConfirming(false)}>
              Stay
            </button>
          </p>
        ) : (
          <button type="button" className="link-button" onClick={() => setConfirming(true)}>
            {isWarden ? 'Delete this campaign' : 'Leave this campaign'}
          </button>
        )}
      </section>
    </main>
  );
}
