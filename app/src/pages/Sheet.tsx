import {
  RulesError,
  abilityLimit,
  applyWardenAction,
  checkSave,
  addFatigue,
  armorValue,
  catchCorruption,
  data,
  removeItem,
  setDeprived,
  slotsUsed,
  stabilize,
  status,
  type AttributeKey,
  type Character,
  type ItemPlace,
} from '@waymark/rules';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { deleteWardenCharacter, saveWardenCharacter } from '../data/campaigns';
import { addLog, answerRequest, type CampaignRequest } from '../data/campaigns';
import { changeSheetAt, undoSheetAt, type CharacterDoc } from '../data/characters';
import { useCampaign, usePresence, useRequests } from '../data/useCampaign';
import { useCharacterStore } from '../data/useCharacters';
import { Dialog } from '../ui/Dialog';
import { RollInput } from '../ui/RollInput';
import {
  ATTRIBUTE_NAMES,
  AbilityDialog,
  AddItemDialog,
  CorruptionDialog,
  DamageDialog,
  DiceDialog,
  FatigueDropDialog,
  RestDialog,
  SaveDialog,
  ScarDialog,
  ScarRecoveryDialog,
  StrengthSaveDialog,
  type DialogState,
  type Outcome,
} from './SheetDialogs';

const STATUS_TEXT: Record<string, string> = {
  critical: 'Critical damage: helpless, and dying within the hour without help.',
  dead: 'Strength is 0. This character has died.',
  paralyzed: 'Dexterity is 0. This character is paralyzed.',
  delirious: 'Willpower is 0. This character is delirious.',
  lost: 'Taken by corruption. This character is now the Warden’s.',
};
const PLACES: { value: ItemPlace; label: string }[] = [
  { value: 'hand', label: 'In hand' },
  { value: 'body', label: 'Worn' },
  { value: 'pack', label: 'In pack' },
];
const abilityById = Object.fromEntries(
  data.affinities.flatMap((a) => a.abilities.map((b) => [b.id, b])),
);

interface ViewProps {
  doc: CharacterDoc;
  /** Saves fields other than the sheet itself, such as notes. */
  onSave: (doc: CharacterDoc) => void;
  /**
   * Applies a change to the sheet. The function is run again on the latest
   * saved sheet, so a change made elsewhere at the same moment is kept.
   */
  onChange: (apply: (sheet: Character) => Character, text: string) => void;
  /** Puts back the sheet as it was before the most recent change. */
  onUndo?: () => void;
  /** In a campaign: what the Warden has asked of this character's player. */
  requests?: CampaignRequest[];
  onAnswer?: (requestId: string, status: 'accepted' | 'declined' | 'done', result: string) => void;
  onDelete: () => void;
  /** Where the back link goes. Defaults to the home screen. */
  back?: { to: string; label: string };
}

/** The character sheet in play. Every change to the numbers goes through the rules library. */
export function SheetView({
  doc,
  onSave,
  onChange,
  onUndo,
  requests = [],
  onAnswer,
  onDelete,
  back = { to: '/', label: 'All characters' },
}: ViewProps) {
  const sheet = doc.sheet;
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const change = (apply: (current: Character) => Character, said?: string) => {
    onChange(apply, said ?? '');
    if (said !== undefined) setMessage(said);
  };
  // The Warden's request that the open dialog is answering, if any.
  const [answering, setAnswering] = useState<string | null>(null);
  const [saveRequest, setSaveRequest] = useState<CampaignRequest | null>(null);
  const done = (outcome: Outcome) => {
    change(outcome.apply, outcome.message);
    if (answering) onAnswer?.(answering, 'done', outcome.message);
    setAnswering(null);
    setDialog(outcome.next ?? null);
  };
  const pending = requests.filter((r) => r.status === 'pending' && r.characterId === doc.id);
  const accept = (request: CampaignRequest) => {
    try {
      const action = request.action!;
      const preview = applyWardenAction(sheet, action);
      change((s) => applyWardenAction(s, action).character, preview.text);
      onAnswer?.(request.id, 'accepted', preview.text);
      const followUp = preview.followUps[0];
      if (followUp) setDialog({ kind: followUp });
    } catch (problem) {
      setMessage(
        problem instanceof RulesError && problem.code === 'must-drop'
          ? 'You have no free slot. Put something down, then accept.'
          : problem instanceof RulesError
            ? problem.message
            : 'That did not work.',
      );
    }
  };
  const close = () => setDialog(null);

  const origin = data.origins.find((o) => o.id === sheet.originId);
  const affinity = data.affinities.find((a) => a.id === sheet.primaryAffinity);
  const used = slotsUsed(sheet);
  const full = used >= sheet.slotCapacity;
  const state = status(sheet);
  const totalFatigue = sheet.fatigue + sheet.taintedFatigue;

  const gainFatigue = () => {
    try {
      const r = addFatigue(sheet);
      change(
        (s) => addFatigue(s).character,
        r.outcome === 'strength'
          ? 'Every slot is Fatigue: lost 1 Strength instead.'
          : 'Gained 1 Fatigue.',
      );
    } catch (problem) {
      if (problem instanceof RulesError && problem.code === 'must-drop')
        setDialog({ kind: 'fatigue-drop' });
      else throw problem;
    }
  };
  const loseFatigue = () => {
    change((s) => {
      const next = structuredClone(s);
      if (next.fatigue > 0) next.fatigue -= 1;
      else if (next.taintedFatigue > 0) next.taintedFatigue -= 1;
      return next;
    }, 'Removed 1 Fatigue.');
  };
  const move = (itemId: string, place: ItemPlace) => {
    change((s) => {
      const next = structuredClone(s);
      const item = next.items.find((i) => i.id === itemId);
      if (item) item.place = place;
      return next;
    });
  };
  const adjust = (key: AttributeKey | 'hp', by: number) => {
    change((s) => {
      const next = structuredClone(s);
      const score = key === 'hp' ? next.hp : next.attributes[key];
      score.current = Math.max(0, Math.min(score.full, score.current + by));
      return next;
    });
  };

  return (
    <main className="screen sheet-screen">
      <p className="back">
        <Link to={back.to}>← {back.label}</Link>
      </p>
      <header className="sheet-header">
        <h1>{sheet.name}</h1>
        <p className="muted">
          {[sheet.background, origin?.name, `Tier ${sheet.tier}`].filter(Boolean).join(' · ')}
        </p>
        {origin && (
          <p className="trait">
            <strong>{origin.name}:</strong> {origin.trait}
            {origin.drawback && (
              <>
                {' '}
                <em>Drawback:</em> {origin.drawback}
              </>
            )}
          </p>
        )}
      </header>

      {state !== 'ok' && (
        <p className="banner" role="alert">
          {STATUS_TEXT[state]}
          {state === 'critical' && (
            <button
              type="button"
              className="button small"
              onClick={() => change(stabilize, 'Stabilized. They need rest before acting again.')}
            >
              Someone tends them
            </button>
          )}
        </p>
      )}
      {full && state === 'ok' && (
        <p className="banner" role="alert">
          Every slot is full, so HP is 0. Put something down.
        </p>
      )}

      <section className="stats" aria-label="Attributes">
        {(Object.keys(ATTRIBUTE_NAMES) as AttributeKey[]).map((key) => (
          <Stat
            key={key}
            label={ATTRIBUTE_NAMES[key]}
            current={sheet.attributes[key].current}
            full={sheet.attributes[key].full}
            onAdjust={(by) => adjust(key, by)}
          />
        ))}
        <Stat
          label="Hit Protection"
          short="HP"
          current={sheet.hp.current}
          full={sheet.hp.full}
          onAdjust={(by) => adjust('hp', by)}
        />
        <div className="stat">
          <span className="stat-label">Armor</span>
          <span className="stat-value" data-testid="armor">
            {armorValue(sheet)}
          </span>
          <span className="stat-sub">3 at most</span>
        </div>
      </section>

      <p className="message" role="status" aria-live="polite">
        {message}
      </p>
      {doc.undo && onUndo && (
        <button type="button" className="button small undo" onClick={onUndo}>
          Undo: {doc.undo.text || 'the last change'}
        </button>
      )}

      {pending.map((request) => (
        <div key={request.id} className="request" role="group" aria-label="Request from the Warden">
          <p>
            <strong>The Warden asks:</strong> {request.text}
          </p>
          <div className="button-row">
            {request.kind === 'change' && (
              <>
                <button
                  type="button"
                  className="button small primary"
                  onClick={() => accept(request)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="button small"
                  onClick={() => onAnswer?.(request.id, 'declined', '')}
                >
                  Decline
                </button>
              </>
            )}
            {(request.kind === 'scar' || request.kind === 'strength-save') && (
              <button
                type="button"
                className="button small primary"
                onClick={() => {
                  setAnswering(request.id);
                  setDialog({ kind: request.kind as 'scar' | 'strength-save' });
                }}
              >
                Roll now
              </button>
            )}
            {request.kind === 'save' && (
              <button
                type="button"
                className="button small primary"
                onClick={() => setSaveRequest(request)}
              >
                Roll now
              </button>
            )}
          </div>
        </div>
      ))}

      <section className="actions" aria-label="Actions">
        <button
          type="button"
          className="button primary"
          onClick={() => setDialog({ kind: 'damage' })}
        >
          Take damage
        </button>
        <button type="button" className="button" onClick={() => setDialog({ kind: 'rest' })}>
          Rest
        </button>
        <button type="button" className="button" onClick={() => setDialog({ kind: 'save' })}>
          Make a save
        </button>
        <button type="button" className="button" onClick={() => setDialog({ kind: 'dice' })}>
          Roll dice
        </button>
      </section>

      <section>
        <h2>
          Inventory{' '}
          <span className="count" data-testid="slots">
            {used} of {sheet.slotCapacity} slots
          </span>
        </h2>
        <div className="fatigue-row">
          <span>
            Fatigue <strong data-testid="fatigue">{totalFatigue}</strong>
            {sheet.taintedFatigue > 0 && (
              <span className="muted"> ({sheet.taintedFatigue} tainted)</span>
            )}
          </span>
          <span className="stepper">
            <button
              type="button"
              className="icon-button"
              onClick={loseFatigue}
              disabled={totalFatigue === 0}
              aria-label="Remove 1 Fatigue"
            >
              −
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={gainFatigue}
              aria-label="Add 1 Fatigue"
            >
              +
            </button>
          </span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={sheet.deprived}
            onChange={(e) => {
              const deprived = e.target.checked;
              change(
                (s) => setDeprived(s, deprived),
                deprived
                  ? 'Deprived: no HP or attribute recovery until the need is met.'
                  : 'No longer deprived.',
              );
            }}
          />
          <span>Deprived (lacking food, water, sleep, or warmth)</span>
        </label>
        <ul className="items">
          {sheet.items.map((item) => (
            <li key={item.id}>
              <span className="item-name">
                {item.name}
                <span className="tags">
                  {item.damage && <span className="tag">d{item.damage}</span>}
                  {item.armor && (
                    <span className="tag">
                      {item.stacks ? '+' : ''}
                      {item.armor} Armor
                    </span>
                  )}
                  {item.slots === 2 && <span className="tag">bulky</span>}
                  {item.slots === 0 && <span className="tag">small</span>}
                </span>
              </span>
              <select
                value={item.place}
                onChange={(e) => move(item.id, e.target.value as ItemPlace)}
                aria-label={`Where ${item.name} is carried`}
              >
                {PLACES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="icon-button"
                onClick={() => change((s) => removeItem(s, item.id), `Dropped ${item.name}.`)}
                aria-label={`Drop ${item.name}`}
              >
                ×
              </button>
            </li>
          ))}
          {Array.from({ length: totalFatigue }, (_, i) => (
            <li key={`f${i}`} className="fatigue-slot">
              <span className="item-name">Fatigue</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="button small"
          onClick={() => setDialog({ kind: 'add-item' })}
        >
          Add an item
        </button>
        <label className="form-row inline">
          Coins
          <input
            className="number"
            type="number"
            inputMode="numeric"
            min={0}
            value={sheet.coins}
            onChange={(e) => {
              const coins = Math.max(0, Math.floor(Number(e.target.value) || 0));
              change((s) => ({ ...s, coins }));
            }}
          />
        </label>
      </section>

      <section>
        <h2>
          Abilities{' '}
          {affinity && (
            <span className="count">
              {affinity.name} · {sheet.abilities.length} of{' '}
              {abilityLimit(sheet.tier) === Infinity ? 'any' : abilityLimit(sheet.tier)}
            </span>
          )}
        </h2>
        {sheet.abilities.length === 0 && (
          <p className="muted">
            {affinity
              ? `A ${affinity.name} gift that has not yet woken.`
              : 'No Abilities. More room for gear.'}
          </p>
        )}
        <ul className="abilities">
          {sheet.abilities.map((id) => (
            <li key={id}>
              <div>
                <strong>{abilityById[id]?.name ?? id}</strong>
                <p>{abilityById[id]?.text}</p>
              </div>
              <button
                type="button"
                className="button small"
                onClick={() => setDialog({ kind: 'ability', abilityId: id })}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Scars</h2>
        {sheet.scars.length === 0 && <p className="muted">None yet.</p>}
        <ul className="scars">
          {sheet.scars.map((scar, index) => (
            <li key={index}>
              <span>
                <strong>{scar.name}</strong>
                {scar.detail && (
                  <span className="muted">
                    {' '}
                    ({ATTRIBUTE_NAMES[scar.detail as AttributeKey] ?? scar.detail})
                  </span>
                )}
              </span>
              {scar.pending && (
                <button
                  type="button"
                  className="button small"
                  onClick={() => setDialog({ kind: 'scar-recovery', index })}
                >
                  Recovered
                </button>
              )}
            </li>
          ))}
        </ul>
        {sheet.doomed && <p className="note">Doomed: the next failed Strength save is fatal.</p>}
      </section>

      <section>
        <h2>Corruption</h2>
        {sheet.corruption.afflicted ? (
          <>
            <p>
              Afflicted. Failed saves: <strong>{sheet.corruption.failedSaves} of 3</strong>
            </p>
            <button
              type="button"
              className="button small"
              onClick={() => setDialog({ kind: 'corruption' })}
            >
              Daily save
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button small"
            onClick={() =>
              change(catchCorruption, 'Caught lasting corruption. Save at the start of each day.')
            }
          >
            Mark as corrupted
          </button>
        )}
      </section>

      <section>
        <h2>Notes</h2>
        {doc.description && <p>{doc.description}</p>}
        <label className="sr-only" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          rows={4}
          value={doc.notes}
          maxLength={4000}
          onChange={(e) => onSave({ ...doc, notes: e.target.value })}
          placeholder="Promises, debts, clues, things to remember"
        />
      </section>

      <section className="danger-zone">
        {confirmDelete ? (
          <p>
            Delete {sheet.name} for good?{' '}
            <button type="button" className="button small danger" onClick={onDelete}>
              Yes, delete
            </button>{' '}
            <button type="button" className="button small" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </p>
        ) : (
          <button type="button" className="link-button" onClick={() => setConfirmDelete(true)}>
            Delete this character
          </button>
        )}
      </section>

      {saveRequest && (
        <SaveRequestDialog
          sheet={sheet}
          request={saveRequest}
          onClose={() => setSaveRequest(null)}
          onResult={(result) => {
            onAnswer?.(saveRequest.id, 'done', result);
            setMessage(result);
            setSaveRequest(null);
          }}
        />
      )}
      {dialog?.kind === 'damage' && <DamageDialog sheet={sheet} onDone={done} onClose={close} />}
      {dialog?.kind === 'strength-save' && (
        <StrengthSaveDialog sheet={sheet} onDone={done} onClose={close} />
      )}
      {dialog?.kind === 'scar' && <ScarDialog sheet={sheet} onDone={done} onClose={close} />}
      {dialog?.kind === 'scar-recovery' && (
        <ScarRecoveryDialog sheet={sheet} index={dialog.index} onDone={done} onClose={close} />
      )}
      {dialog?.kind === 'ability' && (
        <AbilityDialog sheet={sheet} abilityId={dialog.abilityId} onDone={done} onClose={close} />
      )}
      {dialog?.kind === 'rest' && <RestDialog sheet={sheet} onDone={done} onClose={close} />}
      {dialog?.kind === 'save' && <SaveDialog sheet={sheet} onClose={close} />}
      {dialog?.kind === 'dice' && <DiceDialog onClose={close} />}
      {dialog?.kind === 'add-item' && <AddItemDialog sheet={sheet} onDone={done} onClose={close} />}
      {dialog?.kind === 'fatigue-drop' && (
        <FatigueDropDialog sheet={sheet} onDone={done} onClose={close} />
      )}
      {dialog?.kind === 'corruption' && (
        <CorruptionDialog sheet={sheet} onDone={done} onClose={close} />
      )}
    </main>
  );
}

function Stat({
  label,
  short,
  current,
  full,
  onAdjust,
}: {
  label: string;
  short?: string;
  current: number;
  full: number;
  onAdjust: (by: number) => void;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{short ?? label}</span>
      <span className="stat-value" data-testid={`stat-${(short ?? label).toLowerCase()}`}>
        {current}
      </span>
      <span className="stat-sub">of {full}</span>
      <span className="stepper">
        <button
          type="button"
          className="icon-button"
          onClick={() => onAdjust(-1)}
          disabled={current <= 0}
          aria-label={`Lower ${label} by 1`}
        >
          −
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => onAdjust(1)}
          disabled={current >= full}
          aria-label={`Raise ${label} by 1`}
        >
          +
        </button>
      </span>
    </div>
  );
}

/** A save the Warden called for: one roll against the named attribute, sent back when made. */
function SaveRequestDialog({
  sheet,
  request,
  onResult,
  onClose,
}: {
  sheet: Character;
  request: CampaignRequest;
  onResult: (result: string) => void;
  onClose: () => void;
}) {
  const [d20, setD20] = useState<number>();
  const key = request.attribute ?? 'dex';
  const score = sheet.attributes[key].current;
  return (
    <Dialog title={request.text} onClose={onClose}>
      <RollInput
        label="Your roll"
        spec={{ count: 1, sides: 20 }}
        value={d20}
        onChange={setD20}
        hint={`Roll ${score} or less.`}
      />
      <button
        type="button"
        className="button primary wide"
        disabled={d20 === undefined}
        onClick={() =>
          onResult(
            `${sheet.name} rolled ${d20} against ${ATTRIBUTE_NAMES[key]} ${score}: ${checkSave(score, d20!) ? 'success' : 'failure'}.`,
          )
        }
      >
        Send result
      </button>
    </Dialog>
  );
}

/** The sheet, connected to the saved character named in the address. */
export function Sheet() {
  const { id } = useParams();
  const { user } = useAuth();
  const store = useCharacterStore();
  const navigate = useNavigate();
  const doc = store.characters?.find((c) => c.id === id);
  const campaignId = doc?.campaignId ?? null;
  const requests = useRequests(campaignId, campaignId ? user!.uid : null);
  const myName = user?.displayName ?? doc?.name ?? 'A player';
  usePresence(campaignId, user!.uid, myName);

  if (store.characters === undefined) {
    return (
      <main className="screen center" aria-busy="true">
        <p className="lede">Loading…</p>
      </main>
    );
  }
  if (!doc) {
    return (
      <main className="screen">
        <h1>No such character</h1>
        <p>
          <Link to="/">Back to your characters</Link>
        </p>
      </main>
    );
  }
  // In a campaign, what happens to the sheet is told to the table.
  const tell = (text: string) => {
    if (campaignId && text)
      void addLog(
        campaignId,
        user!.uid,
        myName,
        text.startsWith(doc.name) ? text : `${doc.name}: ${text}`,
      );
  };
  return (
    <SheetView
      doc={doc}
      onSave={store.save}
      onChange={(apply, text) => {
        store.change(doc.id, apply, text);
        tell(text);
      }}
      onUndo={() => {
        store.undo(doc.id);
        tell('undid the last change.');
      }}
      requests={requests}
      onAnswer={(requestId, status, result) => {
        if (!campaignId) return;
        void answerRequest(campaignId, requestId, status, result);
        if (status === 'done' && result) tell(result);
      }}
      onDelete={() => {
        store.remove(doc.id);
        navigate('/');
      }}
    />
  );
}

/** The sheet of a character the Warden runs, kept in the campaign. */
export function WardenSheet() {
  const { cid, wid } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { campaign, wardenCharacters, isWarden } = useCampaign(cid!, user!.uid);
  // Shown at once from here; the saved copy follows.
  const [local, setLocal] = useState<CharacterDoc>();
  const saved = wardenCharacters.find((c) => c.id === wid);

  if (campaign === undefined || (isWarden && !saved && !local)) {
    return (
      <main className="screen center" aria-busy="true">
        <p className="lede">Loading…</p>
      </main>
    );
  }
  if (!campaign || !isWarden || !saved) {
    return (
      <main className="screen">
        <h1>No such character</h1>
        <p>
          <Link to="/">Back to the start</Link>
        </p>
      </main>
    );
  }
  const asDoc: CharacterDoc = local ?? {
    id: saved.id,
    ownerUid: '',
    slot: 0,
    name: saved.name,
    description: saved.description,
    age: null,
    notes: saved.notes,
    sheet: saved.sheet,
    createdAt: saved.createdAt,
    updatedAt: saved.updatedAt,
  };
  return (
    <SheetView
      doc={asDoc}
      back={{ to: `/k/${cid}`, label: campaign.name }}
      onSave={(doc) => {
        setLocal(doc);
        void saveWardenCharacter(cid!, {
          id: saved.id,
          name: doc.sheet.name,
          description: doc.description,
          notes: doc.notes,
          sheet: doc.sheet,
          createdAt: saved.createdAt,
          updatedAt: Date.now(),
        });
      }}
      onChange={(apply, text) => {
        const at = Date.now();
        const sheet = apply(asDoc.sheet);
        const next = {
          ...asDoc,
          sheet,
          name: sheet.name,
          undo: { sheet: asDoc.sheet, text, at },
          updatedAt: at,
        };
        setLocal(next);
        void changeSheetAt(
          ['campaigns', cid!, 'characters', saved.id],
          apply,
          { text, at },
          {
            name: sheet.name,
            description: next.description,
            notes: next.notes,
            sheet,
            undo: next.undo,
            createdAt: saved.createdAt,
            updatedAt: at,
          },
        );
      }}
      onUndo={() => {
        if (!asDoc.undo) return;
        const at = Date.now();
        setLocal({ ...asDoc, sheet: asDoc.undo.sheet, undo: null, updatedAt: at });
        void undoSheetAt(['campaigns', cid!, 'characters', saved.id], at);
      }}
      onDelete={() => {
        void deleteWardenCharacter(cid!, saved.id);
        navigate(`/k/${cid}`);
      }}
    />
  );
}
