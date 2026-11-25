import { allAffinities, allOrigins, type AttributeKey, type ExtraContent } from '@waymark/rules';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useAccount } from '../data/account';
import { WARDEN_CHARACTER_IDS, saveWardenCharacter } from '../data/campaigns';
import { characterId } from '../data/characters';
import { useContent, useWorlds } from '../data/record';
import { useCampaign, useMemberships } from '../data/useCampaign';
import { useCharacterStore } from '../data/useCharacters';
import { RollInput } from '../ui/RollInput';
import { IDEAS, ideasFor } from './ideas';
import {
  STEPS,
  buildCharacter,
  emptyDraft,
  finalAttributes,
  kitRows,
  rolledAttributes,
  stepComplete,
  type Draft,
} from './draft';

const ATTRIBUTES: { key: AttributeKey; name: string; about: string }[] = [
  { key: 'str', name: 'Strength', about: 'Muscle, toughness, and stamina' },
  { key: 'dex', name: 'Dexterity', about: 'Speed, balance, and reflexes' },
  { key: 'wil', name: 'Willpower', about: 'Nerve, focus, and force of personality' },
];
const SWAPS: { label: string; pair: [AttributeKey, AttributeKey] }[] = [
  { label: 'Strength and Dexterity', pair: ['str', 'dex'] },
  { label: 'Strength and Willpower', pair: ['str', 'wil'] },
  { label: 'Dexterity and Willpower', pair: ['dex', 'wil'] },
];

interface ViewProps {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onFinish: () => void;
  onCancel: () => void;
  /** A world's own Origins, Affinities and Abilities, offered beside the rulebook's. */
  extra?: ExtraContent;
  /** Shown under the heading on the first step. */
  header?: ReactNode;
}

/** The six steps of making a character. Holds no data of its own, so it can be tested alone. */
export function BuilderView({
  draft,
  onChange,
  onFinish,
  onCancel,
  extra = {},
  header,
}: ViewProps) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const step = draft.step;
  const last = step === STEPS.length - 1;
  const ready = stepComplete(draft, step);

  return (
    <main className="screen">
      <p className="eyebrow">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1>{STEPS[step]}</h1>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={step + 1}
        aria-label="Progress"
      >
        <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>

      {step === 0 && header}
      {step === 0 && <AttributesStep draft={draft} set={set} />}
      {step === 1 && (
        <section>
          <p>
            Hit Protection, or <strong>HP</strong>, is how good your character is at{' '}
            <em>not getting hurt</em>: ducking, blocking, getting lucky. When it runs out, real
            injuries begin. It comes back after a short rest.
          </p>
          <RollInput
            label="Hit Protection"
            spec={{ count: 1, sides: 6 }}
            value={draft.hp}
            onChange={(hp) => set({ hp })}
          />
        </section>
      )}
      {step === 2 && <IdentityStep draft={draft} set={set} />}
      {step === 3 && <OriginStep draft={draft} set={set} extra={extra} />}
      {step === 4 && <AffinityStep draft={draft} set={set} extra={extra} />}
      {step === 5 && <GearStep draft={draft} set={set} extra={extra} />}

      <div className="step-nav">
        {step === 0 ? (
          <button type="button" className="button" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="button" onClick={() => set({ step: step - 1 })}>
            Back
          </button>
        )}
        <button
          type="button"
          className="button primary"
          disabled={!ready}
          onClick={() => (last ? onFinish() : set({ step: step + 1 }))}
        >
          {last ? 'Finish character' : 'Next'}
        </button>
      </div>
      {!ready && <p className="hint center">Fill in this step to continue.</p>}
    </main>
  );
}

type StepProps = { draft: Draft; set: (patch: Partial<Draft>) => void; extra?: ExtraContent };

function AttributesStep({ draft, set }: StepProps) {
  const rolled = rolledAttributes(draft);
  return (
    <section>
      <p>
        Roll three six-sided dice and add them up, once for each attribute, in this order. Higher is
        better. Most people score between 9 and 12.
      </p>
      {ATTRIBUTES.map((a) => (
        <RollInput
          key={a.key}
          label={a.name}
          hint={a.about}
          spec={{ count: 3, sides: 6 }}
          value={draft[a.key]}
          onChange={(value) => set({ [a.key]: value })}
        />
      ))}
      {rolled && (
        <fieldset className="choices">
          <legend>You may swap any two. Do you want to?</legend>
          <label className="choice">
            <input
              type="radio"
              name="swap"
              checked={draft.swap === null}
              onChange={() => set({ swap: null })}
            />
            <span>Keep them as rolled</span>
          </label>
          {SWAPS.map((s) => (
            <label key={s.label} className="choice">
              <input
                type="radio"
                name="swap"
                checked={draft.swap?.join() === s.pair.join()}
                onChange={() => set({ swap: s.pair })}
              />
              <span>Swap {s.label}</span>
            </label>
          ))}
          <p className="summary" aria-live="polite">
            Strength {rolled.str} · Dexterity {rolled.dex} · Willpower {rolled.wil}
          </p>
        </fieldset>
      )}
    </section>
  );
}

function IdentityStep({ draft, set }: StepProps) {
  const ideas = ideasFor(draft.genre);
  const backgrounds = ideas.backgrounds;
  return (
    <section className="form">
      <label>
        Name
        <input
          type="text"
          value={draft.name}
          maxLength={80}
          onChange={(e) => set({ name: e.target.value })}
          autoComplete="off"
        />
      </label>
      <p className="hint">Stuck? Try one of these: {ideas.names.join(', ')}.</p>
      <label>
        Kind of world, for ideas
        <select value={draft.genre} onChange={(e) => set({ genre: e.target.value })}>
          {Object.entries(IDEAS).map(([key, g]) => (
            <option key={key} value={key}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        This only changes the name and background ideas offered here. It decides nothing else, and
        you can always type your own.
      </p>
      <label>
        Background: what your character did before
        <input
          type="text"
          list="backgrounds"
          value={draft.background}
          maxLength={60}
          onChange={(e) => set({ background: e.target.value })}
          autoComplete="off"
        />
      </label>
      <datalist id="backgrounds">
        {backgrounds.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      <button
        type="button"
        className="button small"
        onClick={() =>
          set({ background: backgrounds[Math.floor(Math.random() * backgrounds.length)]! })
        }
      >
        Pick one for me
      </button>
      <p className="hint">
        Your background is what your character knows without rolling. A former thief knows how a
        lock works.
      </p>
      <label>
        Description (optional)
        <textarea
          value={draft.description}
          rows={2}
          maxLength={300}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>
      <RollInput
        label="Age (optional)"
        spec={{ count: 2, sides: 20, plus: 10 }}
        value={draft.age}
        onChange={(age) => set({ age })}
      />
    </section>
  );
}

function OriginStep({ draft, set, extra }: StepProps) {
  return (
    <section>
      <p>
        An Origin is what your character <em>is</em>: their people, species, or make. It gives +1 to
        one attribute, a trait, and a starting kit. If everyone in your world is an ordinary human,
        choose no Origin.
      </p>
      <div className="cards" role="radiogroup" aria-label="Origin">
        <label className="card-choice">
          <input
            type="radio"
            name="origin"
            checked={draft.originId === null}
            onChange={() => set({ originId: null })}
          />
          <span className="card-body">
            <strong>No Origin</strong>
            <span>Roll for your starting gear in the last step.</span>
          </span>
        </label>
        {allOrigins(extra).map((o) => (
          <label key={o.id} className="card-choice">
            <input
              type="radio"
              name="origin"
              checked={draft.originId === o.id}
              onChange={() => set({ originId: o.id })}
            />
            <span className="card-body">
              <strong>
                {o.name} <span className="tag">+1 {o.bonus.attribute.toUpperCase()}</span>
              </strong>
              <span className="muted">{o.examples}</span>
              <span>{o.trait}</span>
              {o.drawback && (
                <span>
                  <em>Drawback:</em> {o.drawback}
                </span>
              )}
              <span className="muted">Kit: {o.kitText}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function AffinityStep({ draft, set, extra }: StepProps) {
  const affinities = allAffinities(extra);
  const affinity = affinities.find((a) => a.id === draft.affinity);
  const toggle = (id: string) => {
    const chosen = draft.abilities.includes(id)
      ? draft.abilities.filter((a) => a !== id)
      : [...draft.abilities, id];
    if (chosen.length <= 2) set({ abilities: chosen });
  };
  return (
    <section>
      <p>
        Abilities are special things only some characters can do: a spell, a mutation, a trained
        technique. They are grouped into families called Affinities.
      </p>
      <fieldset className="choices">
        <legend>Does your character have Abilities?</legend>
        <label className="choice">
          <input
            type="radio"
            name="gift"
            checked={draft.gift === 'awake'}
            onChange={() => set({ gift: 'awake' })}
          />
          <span>Yes. Choose an Affinity and two Abilities.</span>
        </label>
        <label className="choice">
          <input
            type="radio"
            name="gift"
            checked={draft.gift === 'latent'}
            onChange={() => set({ gift: 'latent', abilities: [] })}
          />
          <span>Not yet. Their gift is asleep and will wake during the story.</span>
        </label>
        <label className="choice">
          <input
            type="radio"
            name="gift"
            checked={draft.gift === 'none'}
            onChange={() => set({ gift: 'none', affinity: null, abilities: [] })}
          />
          <span>No. They can carry more and keep going longer.</span>
        </label>
      </fieldset>

      {(draft.gift === 'awake' || draft.gift === 'latent') && (
        <label className="form-row">
          Affinity
          <select
            value={draft.affinity ?? ''}
            onChange={(e) => set({ affinity: e.target.value || null, abilities: [] })}
          >
            <option value="">Choose one…</option>
            {affinities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.about ? `: ${a.about.toLowerCase()}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {affinity?.suits && (
        <p className="hint">A character with it might be: {affinity.suits.toLowerCase()}.</p>
      )}

      {draft.gift === 'awake' && affinity && (
        <fieldset className="choices">
          <legend>Choose two Abilities ({draft.abilities.length} of 2 chosen)</legend>
          {affinity.abilities.map((b) => (
            <label key={b.id} className="choice">
              <input
                type="checkbox"
                checked={draft.abilities.includes(b.id)}
                disabled={!draft.abilities.includes(b.id) && draft.abilities.length >= 2}
                onChange={() => toggle(b.id)}
              />
              <span>
                <strong>{b.name}.</strong> {b.text}
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </section>
  );
}

function GearStep({ draft, set, extra }: StepProps) {
  const origin = allOrigins(extra).find((o) => o.id === draft.originId);
  const rows = kitRows(draft);
  const final = finalAttributes(draft, extra);
  return (
    <section>
      <p>Every character starts with three days of rations, a light source, and some coins.</p>
      <RollInput
        label="Coins"
        spec={{ count: 3, sides: 6 }}
        value={draft.coins}
        onChange={(coins) => set({ coins })}
      />
      {origin ? (
        <p className="note">
          <strong>{origin.name} kit:</strong> {origin.kitText}
        </p>
      ) : (
        <>
          <p>With no Origin, roll a six-sided die three times for your kit.</p>
          <RollInput
            label="Weapon"
            spec={{ count: 1, sides: 6 }}
            value={draft.kitWeapon}
            onChange={(kitWeapon) => set({ kitWeapon })}
          />
          <RollInput
            label="Armor"
            spec={{ count: 1, sides: 6 }}
            value={draft.kitArmor}
            onChange={(kitArmor) => set({ kitArmor })}
          />
          <RollInput
            label="Tools"
            spec={{ count: 1, sides: 6 }}
            value={draft.kitTools}
            onChange={(kitTools) => set({ kitTools })}
          />
          {rows && (
            <p className="note" aria-live="polite">
              <strong>Your kit:</strong> {rows.weapon};{' '}
              {rows.armor === 'None' ? 'no armor' : rows.armor}; {rows.tools}.
            </p>
          )}
        </>
      )}
      {final && (
        <p className="summary">
          {draft.name || 'Your character'}: Strength {final.str} · Dexterity {final.dex} · Willpower{' '}
          {final.wil} · {draft.hp} HP
        </p>
      )}
    </section>
  );
}

const draftKey = (uid: string) => `waymark.draft.${uid}`;

/** The builder, connected to the signed-in user's saved draft and characters. */
export function Builder() {
  const { user } = useAuth();
  const store = useCharacterStore();
  const navigate = useNavigate();
  const uid = user!.uid;
  // Made for a campaign: its world's Origins and Abilities are offered too,
  // and the finished character goes straight into it.
  const asked = useSearchParams()[0].get('campaign');
  const { limits } = useAccount(uid);
  const memberships = useMemberships(uid) ?? [];
  const worlds = useWorlds(uid, true);
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = localStorage.getItem(draftKey(uid));
    return saved ? { ...emptyDraft(), ...(JSON.parse(saved) as Draft) } : emptyDraft();
  });

  useEffect(() => {
    localStorage.setItem(draftKey(uid), JSON.stringify(draft));
  }, [draft, uid]);

  // Where the character is from decides which extra Origins and Abilities are offered.
  const source = asked ? `c:${asked}` : (draft.source ?? '');
  const campaignId = source.startsWith('c:') ? source.slice(2) : null;
  const fromCampaign = useContent(campaignId);
  const world = worlds.find((w) => `w:${w.id}` === source);
  const extra = world ? world.content : fromCampaign;
  const choose = (next: string) =>
    // Choices made from another world's lists may not exist in this one.
    setDraft({ ...draft, source: next, originId: undefined, affinity: null, abilities: [] });

  const finish = () => {
    const sheet = buildCharacter(draft, extra);
    const now = Date.now();
    // The lowest empty slot the plan allows. The security rules refuse any other.
    const taken = new Set((store.characters ?? []).map((c) => c.slot));
    let slot = 1;
    while (taken.has(slot) && slot < limits.characters) slot++;
    const id = characterId(uid, slot);
    store.save({
      id,
      ownerUid: uid,
      slot,
      name: sheet.name,
      description: draft.description,
      age: draft.age ?? null,
      notes: '',
      sheet,
      ...(campaignId ? { campaignId } : {}),
      createdAt: now,
      updatedAt: now,
    });
    localStorage.removeItem(draftKey(uid));
    navigate(`/c/${id}`);
  };

  return (
    <BuilderView
      draft={draft}
      onChange={setDraft}
      onFinish={finish}
      onCancel={() => navigate(asked ? `/k/${asked}` : '/')}
      extra={extra}
      header={
        !asked && memberships.length + worlds.length > 0 ? (
          <label className="form-row">
            Which world is this character for?
            <select value={source} onChange={(e) => choose(e.target.value)}>
              <option value="">Any world: the rulebook&rsquo;s own lists</option>
              {memberships.map((m) => (
                <option key={m.campaignId} value={`c:${m.campaignId}`}>
                  The campaign {m.name}
                </option>
              ))}
              {worlds.map((w) => (
                <option key={w.id} value={`w:${w.id}`}>
                  Your world {w.name}
                </option>
              ))}
            </select>
            <span className="hint">
              A campaign or world can add its own Origins and Abilities to choose from. A character
              made for a campaign joins it.
            </span>
          </label>
        ) : undefined
      }
    />
  );
}

/** The same six steps, for a character the Warden will run in a campaign. */
export function CampaignBuilder() {
  const { cid } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { wardenCharacters } = useCampaign(cid!, user!.uid);
  const extra = useContent(cid);
  const key = `waymark.draft.${user!.uid}.${cid}`;
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = localStorage.getItem(key);
    return saved ? { ...emptyDraft(), ...(JSON.parse(saved) as Draft) } : emptyDraft();
  });
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(draft));
  }, [draft, key]);

  const finish = () => {
    const id = WARDEN_CHARACTER_IDS.find(
      (candidate) => !wardenCharacters.some((c) => c.id === candidate),
    );
    if (!id) {
      setProblem('A Warden can run six characters in a campaign.');
      return;
    }
    const sheet = buildCharacter(draft, extra);
    const now = Date.now();
    saveWardenCharacter(cid!, {
      id,
      name: sheet.name,
      description: draft.description,
      notes: '',
      sheet,
      createdAt: now,
      updatedAt: now,
    }).catch(() => setProblem('That character could not be saved.'));
    localStorage.removeItem(key);
    navigate(`/k/${cid}`);
  };

  return (
    <>
      {problem && (
        <p className="error screen" role="alert">
          {problem}
        </p>
      )}
      <BuilderView
        draft={draft}
        onChange={setDraft}
        onFinish={finish}
        onCancel={() => navigate(`/k/${cid}`)}
        extra={extra}
      />
    </>
  );
}
