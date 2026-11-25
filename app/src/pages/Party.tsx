import {
  RulesError,
  applyWardenAction,
  describeAction,
  type AttributeKey,
  type Character,
  type CustomGear,
  type Die,
  type Item,
  type WardenAction,
} from '@waymark/rules';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addLog,
  clearRequest,
  createHandover,
  createRequest,
  type Campaign,
  type CampaignRequest,
  type LogEntry,
  type Member,
  type Summary,
  type WardenCharacter,
} from '../data/campaigns';
import { changeSheetAt, undoSheetAt, type CharacterDoc } from '../data/characters';
import { Dialog } from '../ui/Dialog';
import { ATTRIBUTE_NAMES } from './SheetDialogs';

/** One character as the Warden's controls see it: where it is stored, and how it may be changed. */
interface Target {
  id: string;
  name: string;
  kind: 'owned' | 'warden';
  ownerUid: string | null;
  ownerName: string;
  /** "ask" means changes go to the player as a request. Warden-run characters are always direct. */
  control: 'direct' | 'ask';
  sheet: Character | undefined;
  undo: CharacterDoc['undo'];
  path: string[];
  /** The stored document, used if a change has to be queued offline. */
  stored: Record<string, unknown> | undefined;
}

const STATUS_LABEL: Record<string, string> = {
  critical: 'critical damage',
  dead: 'dead',
  paralyzed: 'paralyzed',
  delirious: 'delirious',
  lost: 'lost to corruption',
};
const FOLLOW_UP_TEXT = {
  scar: 'Roll a Scar',
  'strength-save': 'Make a Strength save to stay on your feet',
} as const;

interface Props {
  campaign: Campaign;
  uid: string;
  wardenName: string;
  members: Member[];
  summaries: Summary[];
  wardenCharacters: WardenCharacter[];
  playerCharacters: CharacterDoc[];
  requests: CampaignRequest[];
  canAddCharacter: boolean;
  /** Gear made for this world, offered when giving an item. */
  gear?: CustomGear[];
  /** Loot from a card, waiting to be handed to someone. */
  offer?: Pick<Item, 'name' | 'kind' | 'slots' | 'damage' | 'armor'> | null;
  onOfferDone?: () => void;
}

type ActionKind =
  | 'damage'
  | 'heal'
  | 'restore'
  | 'fatigue'
  | 'deprived'
  | 'give'
  | 'take'
  | 'tier'
  | 'save'
  | 'undo';

/** The Warden's view of the party: every character at a glance, and the means to act on them. */
export function WardenParty({
  campaign,
  uid,
  wardenName,
  members,
  summaries,
  wardenCharacters,
  playerCharacters,
  requests,
  canAddCharacter,
  gear = [],
  offer = null,
  onOfferDone,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [acting, setActing] = useState<Target | null>(null);
  const [blasting, setBlasting] = useState(false);
  const [note, setNote] = useState('');
  const [handover, setHandover] = useState<{ name: string; code: string }>();

  const nameOf = (ownerUid: string | null) =>
    members.find((m) => m.uid === ownerUid)?.displayName ?? 'someone';
  const targets: Target[] = summaries.map((s) => {
    if (s.kind === 'warden') {
      const stored = wardenCharacters.find((c) => c.id === s.id);
      const { id: _i, ...rest } = stored ?? ({} as WardenCharacter);
      void _i;
      return {
        id: s.id,
        name: s.name,
        kind: 'warden',
        ownerUid: null,
        ownerName: 'the Warden',
        control: 'direct',
        sheet: stored?.sheet,
        undo: stored?.undo,
        path: ['campaigns', campaign.id, 'characters', s.id],
        stored: stored ? rest : undefined,
      };
    }
    const stored = playerCharacters.find((c) => c.id === s.id);
    const { id: _i, ...rest } = stored ?? ({} as CharacterDoc);
    void _i;
    return {
      id: s.id,
      name: s.name,
      kind: 'owned',
      ownerUid: s.ownerUid,
      ownerName: nameOf(s.ownerUid),
      control: members.find((m) => m.uid === s.ownerUid)?.control ?? 'ask',
      sheet: stored?.sheet,
      undo: stored?.undo,
      path: ['characters', s.id],
      stored: stored ? rest : undefined,
    };
  });

  /** Applies an action to one character, or asks its player to accept it. Returns what to tell the Warden. */
  const act = async (target: Target, action: WardenAction): Promise<string> => {
    if (!target.sheet || !target.stored) return `${target.name}'s sheet has not loaded yet.`;
    if (target.control === 'ask') {
      await createRequest(campaign.id, {
        fromUid: uid,
        toUid: target.ownerUid!,
        characterId: target.id,
        kind: 'change',
        text: describeAction(action),
        action,
      });
      return `Asked ${target.ownerName} to accept: ${describeAction(action)}.`;
    }
    const preview = applyWardenAction(target.sheet, action);
    const at = Date.now();
    await changeSheetAt(
      target.path,
      (s) => applyWardenAction(s, action).character,
      { text: preview.text, at },
      {
        ...target.stored,
        sheet: preview.character,
        undo: { sheet: target.sheet, text: preview.text, at },
        updatedAt: at,
      },
    );
    void addLog(campaign.id, uid, wardenName, preview.text);
    let said = preview.text;
    for (const followUp of preview.followUps) {
      if (target.kind === 'owned') {
        await createRequest(campaign.id, {
          fromUid: uid,
          toUid: target.ownerUid!,
          characterId: target.id,
          kind: followUp,
          text: FOLLOW_UP_TEXT[followUp],
        });
        said += ` ${target.ownerName} has been asked to: ${FOLLOW_UP_TEXT[followUp].toLowerCase()}.`;
      } else {
        said += ` Open ${target.name}'s sheet to ${FOLLOW_UP_TEXT[followUp].toLowerCase()}.`;
      }
    }
    return said;
  };

  const callForSave = async (target: Target, attribute: AttributeKey, reason: string) => {
    const text = `Make a ${ATTRIBUTE_NAMES[attribute]} save${reason ? `: ${reason}` : ''}`;
    await createRequest(campaign.id, {
      fromUid: uid,
      toUid: target.ownerUid!,
      characterId: target.id,
      kind: 'save',
      text,
      attribute,
    });
    return `Asked ${target.ownerName}: ${text}.`;
  };

  const undo = async (target: Target) => {
    await undoSheetAt(target.path, Date.now());
    void addLog(campaign.id, uid, wardenName, `The Warden undid a change to ${target.name}.`);
    return `Undid: ${target.undo?.text ?? 'the last change'}`;
  };

  const run = async (work: () => Promise<string>) => {
    try {
      setNote(await work());
    } catch (problem) {
      setNote(
        problem instanceof RulesError
          ? problem.code === 'must-drop'
            ? 'They have no free slot. Take an item from them first, or ask them to put something down.'
            : problem.message
          : 'That did not work. Check your connection and try again.',
      );
    }
  };

  const toggle = (id: string) =>
    setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  const chosen = targets.filter((t) => selected.includes(t.id));
  const pending = requests.filter((r) => r.status === 'pending');
  const answered = requests.filter((r) => r.status !== 'pending');

  return (
    <section aria-labelledby="party">
      <h2 id="party">The party</h2>
      {offer && (
        <div className="panel alert" role="group" aria-label="Give an item">
          <p>
            <strong>Who gets {offer.name}?</strong>
          </p>
          <div className="button-row">
            {targets.map((t) => (
              <button
                key={t.id}
                type="button"
                className="button small primary"
                onClick={() => {
                  const item = {
                    ...offer,
                    id: `item-${crypto.randomUUID()}`,
                    place: 'pack' as const,
                  };
                  void run(() => act(t, { type: 'give-item', item }));
                  onOfferDone?.();
                }}
              >
                Give to {t.name}
              </button>
            ))}
            <button type="button" className="button small" onClick={onOfferDone}>
              Nobody yet
            </button>
          </div>
        </div>
      )}
      {targets.length === 0 && <p className="muted">No characters yet.</p>}
      <ul className="party">
        {targets.map((t) => {
          const s = summaries.find((x) => x.id === t.id)!;
          const conditions = [STATUS_LABEL[s.status], s.deprived ? 'deprived' : '']
            .filter(Boolean)
            .join(', ');
          return (
            <li key={t.id} data-testid={`summary-${t.name}`}>
              <label className="select-row">
                <input
                  type="checkbox"
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  aria-label={`Select ${t.name}`}
                />
                <span>
                  <strong>{t.name}</strong>
                  <span className="muted">
                    {' '}
                    {t.kind === 'warden' ? 'run by the Warden' : `played by ${t.ownerName}`}
                  </span>
                  <span className="summary-line">
                    HP {s.hp.current} of {s.hp.full}
                    {t.sheet && ` · Strength ${t.sheet.attributes.str.current}`}
                    {t.sheet && ` · Fatigue ${t.sheet.fatigue + t.sheet.taintedFatigue}`}
                    {conditions && ` · ${conditions}`}
                    {t.control === 'ask' && ' · asks first'}
                  </span>
                </span>
              </label>
              <span className="row-actions">
                {t.kind === 'warden' && (
                  <Link className="button small as-link" to={`/k/${campaign.id}/w/${t.id}`}>
                    Open
                  </Link>
                )}
                <button
                  type="button"
                  className="button small"
                  onClick={() => setActing(t)}
                  aria-label={`Act on ${t.name}`}
                >
                  Act
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="message" role="status" aria-live="polite">
        {note}
      </p>
      <div className="button-row">
        {chosen.length >= 2 && (
          <button type="button" className="button small" onClick={() => setBlasting(true)}>
            Damage the {chosen.length} selected
          </button>
        )}
        {canAddCharacter ? (
          <Link className="button small as-link" to={`/k/${campaign.id}/new`}>
            Add a character you run
          </Link>
        ) : (
          <span className="fineprint">A Warden can run six characters in a campaign.</span>
        )}
      </div>
      {handover && (
        <p className="note" role="status">
          To hand {handover.name} to a player, give them this one-time code:{' '}
          <strong data-testid="handover-code">{handover.code}</strong>. They enter it on their home
          screen.
        </p>
      )}

      {requests.length > 0 && (
        <>
          <h3>Asked of players</h3>
          <ul className="party requests">
            {[...pending, ...answered].map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{nameOf(r.toUid)}:</strong> {r.text}
                  <span className="summary-line">
                    {r.status === 'pending'
                      ? 'Waiting…'
                      : r.status === 'declined'
                        ? 'Declined'
                        : (r.result ?? 'Done')}
                  </span>
                </span>
                <button
                  type="button"
                  className="button small"
                  onClick={() => void clearRequest(campaign.id, r.id)}
                  aria-label={`Clear request to ${nameOf(r.toUid)}`}
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {acting && (
        <ActDialog
          target={acting}
          gear={gear}
          onClose={() => setActing(null)}
          onAct={(action) => {
            const target = acting;
            setActing(null);
            void run(() => act(target, action));
          }}
          onSave={(attribute, reason) => {
            const target = acting;
            setActing(null);
            void run(() => callForSave(target, attribute, reason));
          }}
          onUndo={() => {
            const target = acting;
            setActing(null);
            void run(() => undo(target));
          }}
          onHandOver={() => {
            const target = acting;
            setActing(null);
            void run(async () => {
              setHandover({
                name: target.name,
                code: (await createHandover(campaign.id, target.id)).code,
              });
              return `Hand-over code made for ${target.name}.`;
            });
          }}
        />
      )}
      {blasting && (
        <BlastDialog
          targets={chosen}
          onClose={() => setBlasting(false)}
          onApply={(amounts) => {
            setBlasting(false);
            void run(async () => {
              const said: string[] = [];
              for (const target of chosen)
                said.push(await act(target, { type: 'damage', amount: amounts[target.id]! }));
              setSelected([]);
              return said.join(' ');
            });
          }}
        />
      )}
    </section>
  );
}

function ActDialog({
  target,
  gear,
  onAct,
  onSave,
  onUndo,
  onHandOver,
  onClose,
}: {
  target: Target;
  /** Gear the Warden has made for this world. */
  gear: CustomGear[];
  onAct: (action: WardenAction) => void;
  onSave: (attribute: AttributeKey, reason: string) => void;
  onUndo: () => void;
  onHandOver: () => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ActionKind>('damage');
  const [amount, setAmount] = useState('');
  const [attribute, setAttribute] = useState<AttributeKey>('str');
  const [reason, setReason] = useState('');
  const [itemId, setItemId] = useState(target.sheet?.items[0]?.id ?? '');
  const [itemName, setItemName] = useState('');
  const [itemKind, setItemKind] = useState<Item['kind']>('tool');
  const [itemSlots, setItemSlots] = useState<0 | 1 | 2>(1);
  const [itemDamage, setItemDamage] = useState<Die>(6);
  const [itemArmor, setItemArmor] = useState(1);
  const [itemStacks, setItemStacks] = useState(false);
  const [deprived, setDeprived] = useState(!target.sheet?.deprived);

  const n = Number(amount);
  const whole = amount !== '' && Number.isInteger(n);
  const ready =
    kind === 'damage'
      ? whole && n >= 0
      : kind === 'restore'
        ? whole && n >= 1
        : kind === 'fatigue'
          ? whole && n >= 1 && n <= 10
          : kind === 'give'
            ? itemName.trim() !== ''
            : kind === 'take'
              ? itemId !== ''
              : true;

  const submit = () => {
    switch (kind) {
      case 'damage':
        return onAct({ type: 'damage', amount: n });
      case 'heal':
        return onAct({ type: 'heal', hp: true });
      case 'restore':
        return onAct({ type: 'heal', attribute, amount: n });
      case 'fatigue':
        return onAct({ type: 'fatigue', count: n });
      case 'deprived':
        return onAct({ type: 'deprived', value: deprived });
      case 'give':
        return onAct({
          type: 'give-item',
          item: {
            id: `item-${crypto.randomUUID()}`,
            name: itemName.trim(),
            kind: itemKind,
            slots: itemSlots,
            place: 'pack',
            ...(itemKind === 'weapon' ? { damage: itemDamage } : {}),
            ...(itemKind === 'armor'
              ? { armor: itemArmor, ...(itemStacks ? { stacks: true } : {}) }
              : {}),
          },
        });
      case 'take':
        return onAct({ type: 'take-item', itemId });
      case 'tier':
        return onAct({ type: 'tier' });
      case 'save':
        return onSave(attribute, reason.trim());
      default:
        return onUndo();
    }
  };

  const attributePicker = (
    <label>
      Attribute
      <select value={attribute} onChange={(e) => setAttribute(e.target.value as AttributeKey)}>
        {(Object.keys(ATTRIBUTE_NAMES) as AttributeKey[]).map((key) => (
          <option key={key} value={key}>
            {ATTRIBUTE_NAMES[key]}
            {target.sheet
              ? ` (${target.sheet.attributes[key].current} of ${target.sheet.attributes[key].full})`
              : ''}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Dialog title={`Act on ${target.name}`} onClose={onClose}>
      {target.control === 'ask' && (
        <p className="note">
          {target.ownerName} chose “ask me first”. Changes are sent to them to accept.
        </p>
      )}
      <div className="form">
        <label>
          What happens?
          <select value={kind} onChange={(e) => setKind(e.target.value as ActionKind)}>
            <option value="damage">Deal damage</option>
            <option value="heal">Restore HP to full</option>
            <option value="restore">Restore attribute points</option>
            <option value="fatigue">Add Fatigue</option>
            <option value="deprived">Mark deprived, or clear it</option>
            <option value="give">Give an item</option>
            <option value="take">Take an item</option>
            <option value="tier">Award a Tier</option>
            {target.kind === 'owned' && <option value="save">Call for a save</option>}
            {target.undo && <option value="undo">Undo the last change</option>}
          </select>
        </label>

        {(kind === 'damage' || kind === 'restore' || kind === 'fatigue') && (
          <label>
            {kind === 'damage'
              ? 'Damage rolled'
              : kind === 'restore'
                ? 'Points restored'
                : 'How much Fatigue'}
            <input
              className="number"
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        )}
        {kind === 'damage' && <p className="hint">Their Armor is subtracted for you.</p>}
        {(kind === 'restore' || kind === 'save') && attributePicker}
        {kind === 'save' && (
          <label>
            Why (optional)
            <input
              type="text"
              value={reason}
              maxLength={80}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        {kind === 'deprived' && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={deprived}
              onChange={(e) => setDeprived(e.target.checked)}
            />
            <span>Deprived</span>
          </label>
        )}
        {kind === 'take' && (
          <label>
            Item
            <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {target.sheet?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'give' && (
          <>
            {gear.length > 0 && (
              <label>
                From your world
                <select
                  value=""
                  onChange={(e) => {
                    const made = gear.find((g) => g.id === e.target.value);
                    if (!made) return;
                    setItemName(made.name);
                    setItemKind(made.kind === 'special' ? 'tool' : made.kind);
                    setItemSlots(made.slots);
                    if (made.damage) setItemDamage(made.damage);
                    if (made.armor) setItemArmor(made.armor);
                  }}
                >
                  <option value="">Choose, or describe an item below…</option>
                  {gear.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Item name
              <input
                type="text"
                value={itemName}
                maxLength={60}
                onChange={(e) => setItemName(e.target.value)}
              />
            </label>
            <label>
              What it is
              <select
                value={itemKind}
                onChange={(e) => setItemKind(e.target.value as Item['kind'])}
              >
                <option value="tool">A tool or supply</option>
                <option value="weapon">A weapon</option>
                <option value="armor">Armor</option>
                <option value="special">A special item</option>
              </select>
            </label>
            <label>
              Size
              <select
                value={itemSlots}
                onChange={(e) => setItemSlots(Number(e.target.value) as 0 | 1 | 2)}
              >
                <option value={1}>Ordinary: 1 slot</option>
                <option value={2}>Bulky: 2 slots</option>
                <option value={0}>Tiny: needs no slot</option>
              </select>
            </label>
            {itemKind === 'weapon' && (
              <label>
                Damage die
                <select
                  value={itemDamage}
                  onChange={(e) => setItemDamage(Number(e.target.value) as Die)}
                >
                  {[4, 6, 8, 10].map((d) => (
                    <option key={d} value={d}>
                      d{d}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {itemKind === 'armor' && (
              <label>
                Armor
                <select value={itemArmor} onChange={(e) => setItemArmor(Number(e.target.value))}>
                  {[1, 2, 3].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {itemKind === 'armor' && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={itemStacks}
                  onChange={(e) => setItemStacks(e.target.checked)}
                />
                A shield or helmet (adds to other armor)
              </label>
            )}
          </>
        )}
        {kind === 'undo' && (
          <p className="note">This puts back: {target.undo?.text || 'the last change'}</p>
        )}
      </div>
      <button type="button" className="button primary wide" disabled={!ready} onClick={submit}>
        {target.control === 'ask' && kind !== 'save' && kind !== 'undo'
          ? 'Send to the player'
          : 'Apply'}
      </button>
      {target.kind === 'warden' && (
        <button type="button" className="button wide" onClick={onHandOver}>
          Hand this character to a player
        </button>
      )}
    </Dialog>
  );
}

function BlastDialog({
  targets,
  onApply,
  onClose,
}: {
  targets: Target[];
  onApply: (amounts: Record<string, number>) => void;
  onClose: () => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const parsed = Object.fromEntries(targets.map((t) => [t.id, Number(amounts[t.id])]));
  const ready = targets.every(
    (t) =>
      amounts[t.id] !== undefined &&
      amounts[t.id] !== '' &&
      Number.isInteger(parsed[t.id]) &&
      parsed[t.id]! >= 0,
  );
  return (
    <Dialog title="Damage several at once" onClose={onClose}>
      <p>
        A Blast rolls damage separately for each target. Enter each roll; Armor is subtracted for
        you.
      </p>
      <div className="form">
        {targets.map((t) => (
          <label key={t.id}>
            Damage to {t.name}
            <input
              className="number"
              type="number"
              inputMode="numeric"
              min={0}
              value={amounts[t.id] ?? ''}
              onChange={(e) => setAmounts({ ...amounts, [t.id]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="button primary wide"
        disabled={!ready}
        onClick={() => onApply(parsed)}
      >
        Apply to all
      </button>
    </Dialog>
  );
}

const DICE: Die[] = [4, 6, 8, 10, 12, 20];
const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** What was rolled and what changed, for everyone at the table, with dice anyone can roll in the open. */
export function ActivityFeed({ log, onRoll }: { log: LogEntry[]; onRoll: (text: string) => void }) {
  return (
    <section aria-labelledby="feed">
      <h2 id="feed">At the table</h2>
      <div className="dice-buttons" role="group" aria-label="Roll in the open">
        {DICE.map((die) => (
          <button
            key={die}
            type="button"
            className="button small"
            onClick={() => onRoll(`rolled a d${die}: ${Math.floor(Math.random() * die) + 1}`)}
          >
            d{die}
          </button>
        ))}
      </div>
      {log.length === 0 && (
        <p className="muted">Nothing yet. Rolls and changes will appear here for everyone.</p>
      )}
      <ol className="feed" aria-label="Activity">
        {log.map((entry) => (
          <li key={entry.id}>
            <time dateTime={new Date(entry.at).toISOString()}>{clock(entry.at)}</time>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
