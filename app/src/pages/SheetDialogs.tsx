import {
  abilityIndex,
  abilityLimit,
  abilityOf,
  addFatigue,
  addItem,
  applyDamage,
  applyDoomedReward,
  applyScar,
  armorValue,
  canLearnAbility,
  checkSave,
  chooseSecondaryAffinity,
  corruptionDailySave,
  data,
  freeSlots,
  learnAbility,
  nightRest,
  recoverFromScar,
  resolveStrengthSave,
  restAtHaven,
  RulesError,
  scarNeeds,
  scarRecoveryNeeds,
  SECOND_AFFINITY_TIER,
  shortRest,
  useAbility as applyAbility,
  weekRest,
  type AttributeKey,
  type Character,
  type Die,
  type Item,
} from '@waymark/rules';
import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { RollInput } from '../ui/RollInput';

export const ATTRIBUTE_NAMES: Record<AttributeKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  wil: 'Willpower',
};

/** What a dialog hands back: the changed sheet, a line saying what happened, and any follow-up. */
export interface Outcome {
  /**
   * The change, as a function of the sheet. It is run on the sheet shown
   * here and again on the latest saved sheet, so a change someone else made
   * at the same moment is kept. Any dice were rolled before it was built.
   */
  apply: (sheet: Character) => Character;
  message: string;
  next?: DialogState;
}

export type DialogState =
  | { kind: 'damage' }
  | { kind: 'strength-save' }
  | { kind: 'scar' }
  | { kind: 'scar-recovery'; index: number }
  | { kind: 'ability'; abilityId: string }
  | { kind: 'rest' }
  | { kind: 'save' }
  | { kind: 'dice' }
  | { kind: 'add-item' }
  | { kind: 'fatigue-drop' }
  | { kind: 'corruption' }
  | { kind: 'learn' }
  | { kind: 'second-affinity' };

interface Props {
  sheet: Character;
  onDone: (outcome: Outcome) => void;
  onClose: () => void;
}

const explain = (problem: unknown) =>
  problem instanceof RulesError ? problem.message : 'Something went wrong.';

export function DamageDialog({ sheet, onDone, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const value = Number(amount);
  const valid = amount !== '' && Number.isInteger(value) && value >= 0;
  const armor = armorValue(sheet);
  const apply = () => {
    const r = applyDamage(sheet, value);
    let message =
      r.taken === 0
        ? 'Armor stopped it all.'
        : `Took ${r.taken} after Armor. HP ${r.character.hp.current}.`;
    let next: DialogState | undefined;
    if (r.strengthLost > 0)
      message += ` Strength down ${r.strengthLost} to ${r.character.attributes.str.current}.`;
    if (r.dead) message += ' Strength is 0. This character has died.';
    else if (r.strengthSaveRequired) next = { kind: 'strength-save' };
    else if (r.scarRequired) next = { kind: 'scar' };
    onDone({ apply: (s) => applyDamage(s, value).character, message, next });
  };
  return (
    <Dialog title="Take damage" onClose={onClose}>
      <label className="form-row">
        Damage rolled against you
        <input
          className="number"
          type="number"
          inputMode="numeric"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
      </label>
      <p className="hint">Your Armor ({armor}) is subtracted for you.</p>
      <button type="button" className="button primary wide" disabled={!valid} onClick={apply}>
        Apply damage
      </button>
    </Dialog>
  );
}

export function StrengthSaveDialog({ sheet, onDone, onClose }: Props) {
  const [d20, setD20] = useState<number>();
  const [reward, setReward] = useState<number>();
  const target = sheet.attributes.str.current;
  const valid = d20 !== undefined && d20 >= 1 && d20 <= 20;
  // A Doomed character who passes rolls 3d6, and takes it as their HP if it is higher.
  const rewardDue = valid && resolveStrengthSave(sheet, d20).doomedRewardDue;
  const apply = () => {
    const roll = d20!;
    const r = resolveStrengthSave(sheet, roll);
    const message = r.dead
      ? 'The save failed, and they were Doomed. This character has died.'
      : r.success
        ? `Rolled ${d20} against Strength ${target}: wounded, but still up.${r.doomedRewardDue ? ` No longer Doomed. Rolled ${reward} for HP: the higher of that and their full HP is kept.` : ''}`
        : `Rolled ${d20} against Strength ${target}: critical damage. They collapse, and need help within the hour.`;
    onDone({
      apply: (s) => {
        const saved = resolveStrengthSave(s, roll);
        return saved.doomedRewardDue && reward !== undefined
          ? applyDoomedReward(saved.character, reward)
          : saved.character;
      },
      message,
    });
  };
  return (
    <Dialog title="Strength save" onClose={onClose}>
      <p>
        You lost Strength. Roll {target} or less to stay on your feet. Fail, and you have{' '}
        <strong>critical damage</strong>.
      </p>
      <RollInput label="Your roll" spec={{ count: 1, sides: 20 }} value={d20} onChange={setD20} />
      {rewardDue && (
        <RollInput
          label="You passed, and are no longer Doomed. Roll for HP"
          spec={{ count: 3, sides: 6 }}
          value={reward}
          onChange={setReward}
          hint="If this beats your full HP, it becomes your full HP."
        />
      )}
      <button
        type="button"
        className="button primary wide"
        disabled={!valid || (rewardDue && (reward === undefined || reward < 3 || reward > 18))}
        onClick={apply}
      >
        Resolve
      </button>
    </Dialog>
  );
}

export function ScarDialog({ sheet, onDone, onClose }: Props) {
  const [scar, setScar] = useState<number>();
  const [d6, setD6] = useState<number>();
  const [total, setTotal] = useState<number>();
  const [d20, setD20] = useState<number>();
  const entry = scar ? data.scars[scar - 1]! : null;
  const needs = scar ? scarNeeds(scar) : {};
  const ready =
    scar !== undefined &&
    (!needs.d6 || d6 !== undefined) &&
    (!needs.total || total !== undefined) &&
    (!needs.d20 || d20 !== undefined);
  const apply = () =>
    onDone({
      apply: (s) => applyScar(s, scar!, { d6, total, d20 }),
      message: `Scar: ${entry!.name}.`,
    });
  return (
    <Dialog title="Roll a Scar" onClose={onClose}>
      <p>Your HP reached exactly 0. Roll on the Scars table.</p>
      <RollInput
        label="Scar"
        spec={{ count: 1, sides: 12 }}
        value={scar}
        onChange={(v) => {
          setScar(v);
          setD6(undefined);
          setTotal(undefined);
          setD20(undefined);
        }}
      />
      {entry && (
        <p className="note">
          <strong>{entry.name}.</strong> {entry.text}
        </p>
      )}
      {needs.d6 && (
        <RollInput label={needs.d6} spec={{ count: 1, sides: 6 }} value={d6} onChange={setD6} />
      )}
      {needs.d20 && (
        <RollInput
          label="Willpower save"
          spec={{ count: 1, sides: 20 }}
          value={d20}
          onChange={setD20}
          hint={`Roll ${sheet.attributes.wil.current} or less to pass.`}
        />
      )}
      {needs.total && (
        <RollInput
          label="Roll for the scar"
          spec={{ count: needs.total.count, sides: needs.total.sides as Die }}
          value={total}
          onChange={setTotal}
        />
      )}
      <button type="button" className="button primary wide" disabled={!ready} onClick={apply}>
        Record scar
      </button>
    </Dialog>
  );
}

export function ScarRecoveryDialog({ sheet, index, onDone, onClose }: Props & { index: number }) {
  const [total, setTotal] = useState<number>();
  const scar = sheet.scars[index]!;
  const spec = scarRecoveryNeeds(scar.roll);
  return (
    <Dialog title={`Recovered: ${scar.name}`} onClose={onClose}>
      <p className="note">{data.scars[scar.roll - 1]!.text}</p>
      <RollInput
        label="Recovery roll"
        spec={{ count: spec.count, sides: spec.sides as Die }}
        value={total}
        onChange={setTotal}
      />
      <button
        type="button"
        className="button primary wide"
        disabled={total === undefined}
        onClick={() =>
          onDone({
            apply: (s) => recoverFromScar(s, index, total!),
            message: `Recovered from ${scar.name}.`,
          })
        }
      >
        Apply
      </button>
    </Dialog>
  );
}

/** Lets the player pick what to put down when Fatigue has nowhere to go. */
function DropPicker({
  items,
  count,
  value,
  onChange,
}: {
  items: Item[];
  count: number;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="choices">
      <legend>No free slot. Choose {count === 1 ? 'an item' : `${count} items`} to drop.</legend>
      {items
        .filter((i) => i.slots > 0)
        .map((i) => (
          <label key={i.id} className="choice">
            <input
              type="checkbox"
              checked={value.includes(i.id)}
              disabled={!value.includes(i.id) && value.length >= count}
              onChange={() =>
                onChange(value.includes(i.id) ? value.filter((v) => v !== i.id) : [...value, i.id])
              }
            />
            <span>{i.name}</span>
          </label>
        ))}
    </fieldset>
  );
}

export function AbilityDialog({
  sheet,
  abilityId,
  onDone,
  onClose,
}: Props & { abilityId: string }) {
  const ability = abilityOf(sheet, abilityId) ?? { name: abilityId, text: '' };
  const [danger, setDanger] = useState<boolean | undefined>(sheet.deprived ? true : undefined);
  const [d20, setD20] = useState<number>();
  const [misfire, setMisfire] = useState<number>();
  const [backlash, setBacklash] = useState<number>();
  const [drops, setDrops] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  const failed = danger && d20 !== undefined && !checkSave(sheet.attributes.wil.current, d20);
  const fatigueGained = failed && misfire === 2 ? 2 : 1;
  const droppable = sheet.items.some((i) => i.slots > 0);
  const dropsNeeded = droppable ? Math.max(0, fatigueGained - Math.max(0, freeSlots(sheet))) : 0;
  const ready =
    danger !== undefined &&
    (!danger || d20 !== undefined) &&
    (!failed || misfire !== undefined) &&
    (!(failed && misfire === 3) || backlash !== undefined) &&
    drops.length >= Math.min(dropsNeeded, sheet.items.filter((i) => i.slots > 0).length);

  const apply = () => {
    try {
      const input = {
        abilityId,
        inDanger: danger!,
        saveRolls: danger ? [d20!] : undefined,
        misfireRoll: misfire,
        backlashDamage: backlash,
        dropItemIds: drops,
      };
      const r = applyAbility(sheet, input);
      const entry = r.misfire ? data.misfires.find((m) => m.id === r.misfire)! : null;
      const message = entry
        ? `${ability.name} misfired: ${entry.name}. ${entry.text}`
        : `${ability.name} works.${r.canStretch ? ' With time and safety, you may stretch it further.' : ''}`;
      const cost = r.fatigue.includes('strength')
        ? ' Every slot is Fatigue, so it cost 1 Strength.'
        : ` Fatigue ${r.character.fatigue + r.character.taintedFatigue}.`;
      onDone({ apply: (s) => applyAbility(s, input).character, message: message + cost });
    } catch (problem) {
      setError(explain(problem));
    }
  };

  return (
    <Dialog title={`Use ${ability.name}`} onClose={onClose}>
      <p className="note">{ability.text}</p>
      <p>Using an Ability takes your turn and costs 1 Fatigue, whether or not it works.</p>
      <fieldset className="choices">
        <legend>Are you in danger right now?</legend>
        <label className="choice">
          <input
            type="radio"
            name="danger"
            checked={danger === false}
            disabled={sheet.deprived}
            onChange={() => setDanger(false)}
          />
          <span>No. I am safe and unhurried.</span>
        </label>
        <label className="choice">
          <input
            type="radio"
            name="danger"
            checked={danger === true}
            onChange={() => setDanger(true)}
          />
          <span>Yes. In a fight, being chased, falling, or deprived.</span>
        </label>
      </fieldset>
      {danger && (
        <RollInput
          label="Willpower save"
          spec={{ count: 1, sides: 20 }}
          value={d20}
          onChange={setD20}
          hint={`Roll ${sheet.attributes.wil.current} or less to keep control.`}
        />
      )}
      {failed && (
        <>
          <p className="error" role="status">
            The save failed. The Ability misfires.
          </p>
          <RollInput
            label="Misfire"
            spec={{ count: 1, sides: 6 }}
            value={misfire}
            onChange={setMisfire}
          />
        </>
      )}
      {failed && misfire === 3 && (
        <RollInput
          label="Backlash damage"
          spec={{ count: 1, sides: 6 }}
          value={backlash}
          onChange={setBacklash}
        />
      )}
      {dropsNeeded > 0 && (
        <DropPicker items={sheet.items} count={dropsNeeded} value={drops} onChange={setDrops} />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button primary wide" disabled={!ready} onClick={apply}>
        Use Ability
      </button>
    </Dialog>
  );
}

export function FatigueDropDialog({ sheet, onDone, onClose }: Props) {
  const [drops, setDrops] = useState<string[]>([]);
  return (
    <Dialog title="Gain Fatigue" onClose={onClose}>
      <DropPicker items={sheet.items} count={1} value={drops} onChange={setDrops} />
      <button
        type="button"
        className="button primary wide"
        disabled={drops.length !== 1}
        onClick={() =>
          onDone({
            apply: (s) => addFatigue(s, { dropItemId: drops[0] }).character,
            message: 'Gained 1 Fatigue and dropped an item to make room.',
          })
        }
      >
        Drop it and gain Fatigue
      </button>
    </Dialog>
  );
}

export function RestDialog({ sheet, onDone, onClose }: Props) {
  const rest = (how: (sheet: Character) => Character, what: string) => {
    const after = how(sheet);
    const hp = after.hp.current > sheet.hp.current ? ` HP back to ${after.hp.current}.` : '';
    const why =
      after.hp.current < after.hp.full
        ? ' HP did not fully return: check for deprivation, a full pack, or critical damage.'
        : '';
    onDone({ apply: how, message: `${what}.${hp}${why}` });
  };
  return (
    <Dialog title="Rest" onClose={onClose}>
      <div className="stack-full">
        <button type="button" className="button wide" onClick={() => rest(shortRest, 'Short rest')}>
          Short rest
          <small>A few minutes and a drink. All HP returns.</small>
        </button>
        <button
          type="button"
          className="button wide"
          onClick={() => rest((s) => nightRest(s, { safe: true }), "Night's rest")}
        >
          Night's rest, somewhere safe
          <small>Removes all Fatigue.</small>
        </button>
        <button type="button" className="button wide" onClick={() => rest(weekRest, "Week's rest")}>
          Week's rest, with care
          <small>Restores lost attribute points.</small>
        </button>
        <button
          type="button"
          className="button wide"
          onClick={() =>
            rest((s) => restAtHaven(nightRest(s, { safe: true })), 'A night at a haven')
          }
        >
          A night at a haven
          <small>Also clears tainted Fatigue and cures lasting corruption.</small>
        </button>
      </div>
    </Dialog>
  );
}

export function SaveDialog({ sheet, onClose }: Omit<Props, 'onDone'>) {
  const [key, setKey] = useState<AttributeKey>('dex');
  const [d20, setD20] = useState<number>();
  const score = sheet.attributes[key].current;
  return (
    <Dialog title="Make a save" onClose={onClose}>
      <label className="form-row">
        Attribute
        <select
          value={key}
          onChange={(e) => {
            setKey(e.target.value as AttributeKey);
            setD20(undefined);
          }}
        >
          {(Object.keys(ATTRIBUTE_NAMES) as AttributeKey[]).map((k) => (
            <option key={k} value={k}>
              {ATTRIBUTE_NAMES[k]} ({sheet.attributes[k].current})
            </option>
          ))}
        </select>
      </label>
      <RollInput
        label={`${ATTRIBUTE_NAMES[key]} save`}
        spec={{ count: 1, sides: 20 }}
        value={d20}
        onChange={setD20}
        hint={`Roll ${score} or less.`}
      />
      {d20 !== undefined && (
        <p className={checkSave(score, d20) ? 'result good' : 'result bad'} role="status">
          {d20} against {score}: {checkSave(score, d20) ? 'success' : 'failure'}
          {d20 === 1 ? ' (a 1 always succeeds)' : d20 === 20 ? ' (a 20 always fails)' : ''}.
        </p>
      )}
    </Dialog>
  );
}

const DICE: Die[] = [4, 6, 8, 10, 12, 20];

export function DiceDialog({ onClose }: { onClose: () => void }) {
  const [rolls, setRolls] = useState<{ die: Die; value: number }[]>([]);
  return (
    <Dialog title="Roll dice" onClose={onClose}>
      <div className="dice-buttons">
        {DICE.map((die) => (
          <button
            key={die}
            type="button"
            className="button"
            onClick={() =>
              setRolls([{ die, value: Math.floor(Math.random() * die) + 1 }, ...rolls].slice(0, 8))
            }
          >
            d{die}
          </button>
        ))}
      </div>
      <ol className="rolls" aria-live="polite" aria-label="Recent rolls">
        {rolls.map((r, i) => (
          <li key={rolls.length - i} className={i === 0 ? 'latest' : ''}>
            <span>d{r.die}</span>
            <strong>{r.value}</strong>
          </li>
        ))}
      </ol>
      {rolls.length === 0 && <p className="hint">Tap a die to roll it.</p>}
    </Dialog>
  );
}

export function AddItemDialog({ sheet, onDone, onClose }: Props) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Item['kind']>('tool');
  const [slots, setSlots] = useState<0 | 1 | 2>(1);
  const [damage, setDamage] = useState<Die>(6);
  const [armor, setArmor] = useState(1);
  const [stacks, setStacks] = useState(false);
  const fits = slots <= freeSlots(sheet);
  const add = () => {
    const item: Item = {
      id: `item-${crypto.randomUUID()}`,
      name: name.trim(),
      kind,
      slots,
      place: 'pack',
      ...(kind === 'weapon' ? { damage } : {}),
      ...(kind === 'armor' ? { armor, ...(stacks ? { stacks: true } : {}) } : {}),
    };
    const after = structuredClone(sheet);
    after.items.push(item);
    const full = freeSlots(after) <= 0;
    if (full) after.hp.current = 0;
    onDone({
      apply: (s) => addItem(s, item),
      message: `Added ${item.name}.${full ? ' Every slot is now full, so HP drops to 0.' : ''}`,
    });
  };
  return (
    <Dialog title="Add an item" onClose={onClose}>
      <div className="form">
        <label>
          Name
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          What it is
          <select value={kind} onChange={(e) => setKind(e.target.value as Item['kind'])}>
            <option value="tool">A tool or supply</option>
            <option value="weapon">A weapon</option>
            <option value="armor">Armor</option>
            <option value="special">A special item</option>
          </select>
        </label>
        <label>
          Size
          <select value={slots} onChange={(e) => setSlots(Number(e.target.value) as 0 | 1 | 2)}>
            <option value={1}>Ordinary: 1 slot</option>
            <option value={2}>Bulky: 2 slots</option>
            <option value={0}>Small: no slot</option>
          </select>
        </label>
        {kind === 'weapon' && (
          <label>
            Damage die
            <select value={damage} onChange={(e) => setDamage(Number(e.target.value) as Die)}>
              {[4, 6, 8, 10].map((d) => (
                <option key={d} value={d}>
                  d{d}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'armor' && (
          <label>
            Armor
            <select value={armor} onChange={(e) => setArmor(Number(e.target.value))}>
              {[1, 2, 3].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'armor' && (
          <label className="check">
            <input type="checkbox" checked={stacks} onChange={(e) => setStacks(e.target.checked)} />
            A shield or helmet (adds to other armor)
          </label>
        )}
      </div>
      {!fits && (
        <p className="error" role="alert">
          There is no room to carry that. Drop something first.
        </p>
      )}
      <button
        type="button"
        className="button primary wide"
        disabled={name.trim() === '' || !fits}
        onClick={add}
      >
        Add item
      </button>
    </Dialog>
  );
}

export function CorruptionDialog({ sheet, onDone, onClose }: Props) {
  const [d20, setD20] = useState<number>();
  const [loss, setLoss] = useState<number>();
  const [error, setError] = useState<string>();
  const failing = d20 !== undefined && !checkSave(sheet.attributes.wil.current, d20);
  const third = failing && sheet.corruption.failedSaves === 2;
  const needsLoss = third && sheet.abilities.length === 0;
  // Losing a Tier may leave more Abilities than the lower Tier allows.
  const [forget, setForget] = useState<string[]>([]);
  const excess =
    third && sheet.abilities.length > 0 && sheet.tier > 1
      ? Math.max(0, sheet.abilities.length - abilityLimit(sheet.tier - 1))
      : 0;
  const apply = () => {
    try {
      const input = { d20: d20!, willpowerLoss: loss, forget: excess > 0 ? forget : undefined };
      const r = corruptionDailySave(sheet, input);
      const message = r.saved
        ? 'The corruption is held back today.'
        : r.character.lost
          ? 'The corruption has taken this character.'
          : r.burned === 'tier'
            ? `Three failures. A Tier is burned away: now Tier ${r.character.tier}.`
            : r.burned === 'willpower'
              ? `Three failures. Willpower is burned away: now ${r.character.attributes.wil.full}.`
              : `The corruption spreads: ${r.character.corruption.failedSaves} of 3 failed saves.`;
      onDone({ apply: (s) => corruptionDailySave(s, input).character, message });
    } catch (problem) {
      setError(explain(problem));
    }
  };
  return (
    <Dialog title="Daily corruption save" onClose={onClose}>
      <p>
        At the start of each day, make a Willpower save. Three failures burn something away for
        good.
      </p>
      <RollInput
        label="Willpower save"
        spec={{ count: 1, sides: 20 }}
        value={d20}
        onChange={setD20}
        hint={`Roll ${sheet.attributes.wil.current} or less.`}
      />
      {needsLoss && (
        <RollInput
          label="Willpower lost"
          spec={{ count: 1, sides: 4 }}
          value={loss}
          onChange={setLoss}
        />
      )}
      {excess > 0 && (
        <fieldset className="choices">
          <legend>
            A Tier will be lost. Choose {excess === 1 ? 'an Ability' : `${excess} Abilities`} to
            lose with it.
          </legend>
          {sheet.abilities.map((id) => (
            <label key={id} className="choice">
              <input
                type="checkbox"
                checked={forget.includes(id)}
                disabled={!forget.includes(id) && forget.length >= excess}
                onChange={() =>
                  setForget(forget.includes(id) ? forget.filter((f) => f !== id) : [...forget, id])
                }
              />
              <span>{abilityOf(sheet, id)?.name ?? id}</span>
            </label>
          ))}
        </fieldset>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button primary wide"
        disabled={
          d20 === undefined || (needsLoss && loss === undefined) || forget.length !== excess
        }
        onClick={apply}
      >
        Resolve
      </button>
    </Dialog>
  );
}

/** Learning a new Ability: from the character's own Affinities, up to what their Tier allows. */
export function LearnDialog({ sheet, onDone, onClose }: Props) {
  const [chosen, setChosen] = useState('');
  const open = data.affinities
    .filter(
      (a) =>
        a.id === sheet.primaryAffinity ||
        (a.id === sheet.secondaryAffinity && sheet.tier >= SECOND_AFFINITY_TIER),
    )
    .flatMap((a) => a.abilities.map((b) => ({ ...b, affinity: a.name })))
    .filter((b) => canLearnAbility(sheet, b.id, abilityIndex).ok);
  const pick = open.find((b) => b.id === chosen);
  return (
    <Dialog title="Learn an Ability" onClose={onClose}>
      <p>
        A character learns a new Ability when the story gives them one: a teacher, a discovery, a
        moment of need. The Warden decides when.
      </p>
      {open.length === 0 ? (
        <p className="muted">
          There is nothing more to learn from the rulebook&rsquo;s lists for this character&rsquo;s
          Affinities.
        </p>
      ) : (
        <fieldset className="choices">
          <legend>Choose one</legend>
          {open.map((b) => (
            <label key={b.id} className="choice">
              <input
                type="radio"
                name="learn"
                checked={chosen === b.id}
                onChange={() => setChosen(b.id)}
              />
              <span>
                <strong>{b.name}.</strong> {b.text} <span className="muted">({b.affinity})</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        className="button primary wide"
        disabled={!pick}
        onClick={() =>
          onDone({
            apply: (s) => learnAbility(s, pick!.id, abilityIndex),
            message: `Learned ${pick!.name}.`,
          })
        }
      >
        Learn it
      </button>
    </Dialog>
  );
}

/** At Tier 3 a second Affinity opens. */
export function SecondAffinityDialog({ sheet, onDone, onClose }: Props) {
  const [chosen, setChosen] = useState('');
  const others = data.affinities.filter((a) => a.id !== sheet.primaryAffinity);
  const pick = others.find((a) => a.id === chosen);
  return (
    <Dialog title="Choose a second Affinity" onClose={onClose}>
      <p>
        From Tier 3, a character can learn Abilities from one more Affinity. Choose with care: it
        cannot be changed.
      </p>
      <label className="form-row">
        Second Affinity
        <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="">Choose one…</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}: {a.about.toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="button primary wide"
        disabled={!pick}
        onClick={() =>
          onDone({
            apply: (s) => chooseSecondaryAffinity(s, pick!.id),
            message: `${pick!.name} is now their second Affinity.`,
          })
        }
      >
        Choose {pick?.name ?? 'it'}
      </button>
    </Dialog>
  );
}
