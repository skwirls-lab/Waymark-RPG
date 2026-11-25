import {
  allAffinities,
  checkAbility,
  checkCreature,
  checkGear,
  checkOrigin,
  data,
  type AttributeKey,
  type CustomAbility,
  type CustomCreature,
  type CustomGear,
  type CustomOrigin,
} from '@waymark/rules';
import { useState, type ReactNode } from 'react';
import {
  contentId,
  deleteWorld,
  saveContent,
  saveCreatures,
  saveWorld,
  useContent,
  useCreatures,
  useWorlds,
  type Content,
} from '../data/record';

type Die = 4 | 6 | 8 | 10 | 12;
const DICE: Die[] = [4, 6, 8, 10, 12];
const ATTRIBUTES: [AttributeKey, string][] = [
  ['str', 'Strength'],
  ['dex', 'Dexterity'],
  ['wil', 'Willpower'],
];

/** The rulebook's advice on what was just typed. It advises; the Warden decides. */
function Warnings({ list }: { list: string[] }) {
  if (list.length === 0) return null;
  return (
    <div className="note warn" role="status" aria-label="Advice from the rulebook">
      <strong>The rulebook suggests:</strong>
      <ul>
        {list.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p className="hint">This is advice. You can save it as it is.</p>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
    </label>
  );
}

function DiePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Die;
  onChange: (d: Die) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(Number(e.target.value) as Die)}>
        {DICE.map((d) => (
          <option key={d} value={d}>
            d{d}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A heading, the things already made, and a form that opens to make another. */
function Maker<T extends { id: string; name: string }>({
  title,
  addLabel,
  items,
  describe,
  onDelete,
  children,
}: {
  title: string;
  addLabel: string;
  items: T[];
  describe: (item: T) => ReactNode;
  onDelete: (item: T) => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = `made-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {items.length > 0 && (
        <ul className="record">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong>
              <div>{describe(item)}</div>
              <button
                type="button"
                className="link-button"
                aria-label={`Delete ${item.name}`}
                onClick={() => onDelete(item)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        children(() => setOpen(false))
      ) : (
        <button type="button" className="button small" onClick={() => setOpen(true)}>
          {addLabel}
        </button>
      )}
    </section>
  );
}

function FormButtons({ save, onCancel }: { save: string; onCancel: () => void }) {
  return (
    <div className="button-row">
      <button type="submit" className="button small primary">
        {save}
      </button>
      <button type="button" className="button small" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

type KitRow = {
  name: string;
  kind: 'weapon' | 'armor' | 'tool';
  damage: Die;
  armor: number;
  bulky: boolean;
};
const emptyKitRow = (): KitRow => ({ name: '', kind: 'tool', damage: 6, armor: 1, bulky: false });

function kitFrom(rows: KitRow[]): Pick<CustomOrigin, 'kit' | 'kitText'> {
  const kit = rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      kind: r.kind,
      slots: (r.bulky ? 2 : 1) as 1 | 2,
      ...(r.kind === 'weapon' ? { damage: r.damage } : {}),
      ...(r.kind === 'armor' ? { armor: r.armor } : {}),
    }));
  const describe = (item: (typeof kit)[number]) => {
    const parts = [
      'damage' in item ? `d${item.damage}` : '',
      'armor' in item ? `${item.armor} Armor` : '',
      item.slots === 2 ? 'bulky' : '',
    ].filter(Boolean);
    return parts.length ? `${item.name} (${parts.join(', ')})` : item.name;
  };
  return { kit, kitText: kit.map(describe).join(', ') || 'Nothing' };
}

function OriginForm({
  onSave,
  onCancel,
}: {
  onSave: (o: CustomOrigin) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [examples, setExamples] = useState('');
  const [attribute, setAttribute] = useState<AttributeKey>('str');
  const [trait, setTrait] = useState('');
  const [drawback, setDrawback] = useState('');
  const [slots, setSlots] = useState(10);
  const [rows, setRows] = useState<KitRow[]>([emptyKitRow(), emptyKitRow(), emptyKitRow()]);
  const setRow = (i: number, patch: Partial<KitRow>) =>
    setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const origin: CustomOrigin = {
    id: contentId(),
    name: name.trim(),
    examples: examples.trim() || name.trim(),
    bonus: { attribute, amount: 1 },
    trait: trait.trim(),
    drawback: drawback.trim() || null,
    slots: Number.isInteger(slots) && slots >= 10 ? slots : 10,
    ...kitFrom(rows),
  };
  const touched = name !== '' || trait !== '';
  return (
    <form
      className="form panel"
      aria-label="New Origin"
      onSubmit={(e) => {
        e.preventDefault();
        if (origin.name && origin.trait) onSave(origin);
      }}
    >
      <p className="hint">
        An Origin is a people, species or make. It gives +1 to one attribute, one trait, and a
        starting kit.
      </p>
      <label>
        Origin name
        <input value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Examples (optional)
        <input
          value={examples}
          maxLength={120}
          placeholder="Otter-folk, marsh dwellers"
          onChange={(e) => setExamples(e.target.value)}
        />
      </label>
      <label>
        +1 to
        <select value={attribute} onChange={(e) => setAttribute(e.target.value as AttributeKey)}>
          {ATTRIBUTES.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Trait
        <textarea
          rows={2}
          maxLength={300}
          required
          value={trait}
          placeholder="Something these people can naturally do."
          onChange={(e) => setTrait(e.target.value)}
        />
      </label>
      <label>
        Drawback (optional)
        <textarea
          rows={2}
          maxLength={300}
          value={drawback}
          onChange={(e) => setDrawback(e.target.value)}
        />
      </label>
      <Num label="Inventory slots" value={slots} min={10} max={14} onChange={setSlots} />
      <fieldset className="choices">
        <legend>Starting kit</legend>
        {rows.map((row, i) => (
          <div key={i} className="kit-row">
            <label>
              Item {i + 1}
              <input
                value={row.name}
                maxLength={40}
                onChange={(e) => setRow(i, { name: e.target.value })}
              />
            </label>
            <label>
              <span className="sr-only">Item {i + 1} </span>Kind
              <select
                value={row.kind}
                onChange={(e) => setRow(i, { kind: e.target.value as KitRow['kind'] })}
              >
                <option value="tool">Tool</option>
                <option value="weapon">Weapon</option>
                <option value="armor">Armor</option>
              </select>
            </label>
            {row.kind === 'weapon' && (
              <DiePicker
                label={`Item ${i + 1} damage`}
                value={row.damage}
                onChange={(damage) => setRow(i, { damage })}
              />
            )}
            {row.kind === 'armor' && (
              <Num
                label={`Item ${i + 1} Armor`}
                value={row.armor}
                min={1}
                max={3}
                onChange={(armor) => setRow(i, { armor })}
              />
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={row.bulky}
                onChange={(e) => setRow(i, { bulky: e.target.checked })}
              />
              Bulky<span className="sr-only"> (item {i + 1})</span>
            </label>
          </div>
        ))}
        {rows.length < 6 && (
          <button
            type="button"
            className="link-button"
            onClick={() => setRows([...rows, emptyKitRow()])}
          >
            Add another item
          </button>
        )}
      </fieldset>
      {touched && <Warnings list={checkOrigin(origin)} />}
      <FormButtons save="Save Origin" onCancel={onCancel} />
    </form>
  );
}

function AbilityForm({
  content,
  onSave,
  onCancel,
}: {
  content: Content;
  onSave: (ability: CustomAbility, newAffinity: { name: string; about: string } | null) => void;
  onCancel: () => void;
}) {
  const affinities = allAffinities(content);
  const [affinity, setAffinity] = useState(affinities[0]!.id);
  const [affinityName, setAffinityName] = useState('');
  const [about, setAbout] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const isNew = affinity === 'new';
  return (
    <form
      className="form panel"
      aria-label="New Ability"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim() || !text.trim() || (isNew && !affinityName.trim())) return;
        onSave(
          { id: contentId(), name: name.trim(), text: text.trim(), affinity },
          isNew ? { name: affinityName.trim(), about: about.trim() } : null,
        );
      }}
    >
      <p className="hint">
        Say what the Ability does, how far it reaches, and how long it lasts. Every Ability costs 1
        Fatigue, so keep them about equally useful.
      </p>
      <label>
        Affinity
        <select value={affinity} onChange={(e) => setAffinity(e.target.value)}>
          {affinities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value="new">A new Affinity…</option>
        </select>
      </label>
      {isNew && (
        <>
          <p className="hint">
            A new character starts with two Abilities, so give a new Affinity at least two.
          </p>
          <label>
            Affinity name
            <input
              value={affinityName}
              maxLength={40}
              required
              onChange={(e) => setAffinityName(e.target.value)}
            />
          </label>
          <label>
            What it is about
            <input
              value={about}
              maxLength={120}
              placeholder="Water, weather and tides"
              onChange={(e) => setAbout(e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        Ability name
        <input value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        What it does
        <textarea
          rows={3}
          maxLength={500}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {(name !== '' || text !== '') && <Warnings list={checkAbility({ name, text })} />}
      <FormButtons save="Save Ability" onCancel={onCancel} />
    </form>
  );
}

function GearForm({ onSave, onCancel }: { onSave: (g: CustomGear) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CustomGear['kind']>('weapon');
  const [bulky, setBulky] = useState(false);
  const [damage, setDamage] = useState<Die>(6);
  const [ranged, setRanged] = useState(false);
  const [armor, setArmor] = useState(1);
  const [charges, setCharges] = useState(1);
  const [text, setText] = useState('');
  const gear: CustomGear = {
    id: contentId(),
    name: name.trim(),
    kind,
    slots: bulky ? 2 : 1,
    ...(kind === 'weapon' ? { damage, ranged } : {}),
    ...(kind === 'armor' ? { armor } : {}),
    ...(kind === 'special' ? { charges } : {}),
    ...(text.trim() ? { text: text.trim() } : {}),
  };
  return (
    <form
      className="form panel"
      aria-label="New gear"
      onSubmit={(e) => {
        e.preventDefault();
        if (gear.name) onSave(gear);
      }}
    >
      <label>
        Item name
        <input value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as CustomGear['kind'])}>
          <option value="weapon">Weapon</option>
          <option value="armor">Armor</option>
          <option value="tool">Tool</option>
          <option value="special">Special item</option>
        </select>
      </label>
      {kind === 'weapon' && (
        <>
          <DiePicker label="Damage" value={damage} onChange={setDamage} />
          <label className="check">
            <input type="checkbox" checked={ranged} onChange={(e) => setRanged(e.target.checked)} />
            Ranged
          </label>
        </>
      )}
      {kind === 'armor' && <Num label="Armor" value={armor} min={1} max={5} onChange={setArmor} />}
      {kind === 'special' && (
        <Num label="Charges" value={charges} min={1} max={9} onChange={setCharges} />
      )}
      <label className="check">
        <input type="checkbox" checked={bulky} onChange={(e) => setBulky(e.target.checked)} />
        Bulky (takes two slots)
      </label>
      <label>
        What it does (optional)
        <textarea rows={2} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {name !== '' && <Warnings list={checkGear(gear)} />}
      <FormButtons save="Save item" onCancel={onCancel} />
    </form>
  );
}

function CreatureForm({
  onSave,
  onCancel,
}: {
  onSave: (c: CustomCreature) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [hp, setHp] = useState(4);
  const [armor, setArmor] = useState(0);
  const [str, setStr] = useState(10);
  const [dex, setDex] = useState(10);
  const [wil, setWil] = useState(10);
  const [attackName, setAttackName] = useState('');
  const [damage, setDamage] = useState<Die>(6);
  const [blast, setBlast] = useState(false);
  const [notes, setNotes] = useState('');
  const creature: CustomCreature = {
    id: contentId(),
    name: name.trim(),
    hp,
    armor,
    str,
    dex,
    wil,
    attack: `${attackName.trim() || 'attack'} (d${damage}${blast ? ', blast' : ''})`,
    damage: [damage],
    blast,
    notes: notes
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  };
  const whole = [hp, armor, str, dex, wil].every(Number.isInteger);
  return (
    <form
      className="form panel"
      aria-label="New creature"
      onSubmit={(e) => {
        e.preventDefault();
        if (creature.name && whole && hp >= 1) onSave(creature);
      }}
    >
      <label>
        Creature name
        <input value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="grid-3">
        <Num label="HP" value={hp} min={1} max={30} onChange={setHp} />
        <Num label="Armor" value={armor} min={0} max={3} onChange={setArmor} />
        <Num label="Strength" value={str} min={1} max={18} onChange={setStr} />
        <Num label="Dexterity" value={dex} min={1} max={18} onChange={setDex} />
        <Num label="Willpower" value={wil} min={1} max={18} onChange={setWil} />
      </div>
      <p className="hint">
        3 HP is fragile, 6 is tough, 10 or more is a serious threat. 10 is an average attribute.
      </p>
      <label>
        Attack
        <input
          value={attackName}
          maxLength={40}
          placeholder="Claws, shock baton, rusty cleaver"
          onChange={(e) => setAttackName(e.target.value)}
        />
      </label>
      <DiePicker label="Attack damage" value={damage} onChange={setDamage} />
      <label className="check">
        <input type="checkbox" checked={blast} onChange={(e) => setBlast(e.target.checked)} />
        Its attack is a Blast (hits everyone in an area)
      </label>
      <label>
        What makes it memorable, and how players see it coming
        <textarea
          rows={3}
          maxLength={600}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {name !== '' && whole && <Warnings list={checkCreature(creature)} />}
      <FormButtons save="Save creature" onCancel={onCancel} />
    </form>
  );
}

/** Where the Warden makes their world's own creatures, Origins, Abilities and gear. */
export function Workshop({ campaignId, uid }: { campaignId: string; uid: string }) {
  const content = useContent(campaignId);
  const creatures = useCreatures(campaignId, true);
  const worlds = useWorlds(uid, true);
  const [worldName, setWorldName] = useState('');
  const [message, setMessage] = useState<string>();
  const run = (action: Promise<unknown>, done = '') => {
    setMessage(undefined);
    action.then(
      () => setMessage(done),
      () => setMessage('That could not be saved. Check your connection and try again.'),
    );
  };
  const put = (next: Content, done: string) => run(saveContent(campaignId, next), done);
  const affinityName = (id: string) => allAffinities(content).find((a) => a.id === id)?.name ?? id;
  const nothingMade =
    creatures.length + content.origins.length + content.abilities.length + content.gear.length ===
    0;

  return (
    <>
      <p className="hint">
        Everything here is made from the rulebook&rsquo;s own forms. Origins and Abilities you make
        appear when anyone builds a character for this campaign.
      </p>
      <p className="note" role="status" hidden={!message}>
        {message}
      </p>

      <Maker
        title="Creatures"
        addLabel="New creature"
        items={creatures}
        describe={(c) =>
          `HP ${c.hp} · Armor ${c.armor} · STR ${c.str} · DEX ${c.dex} · WIL ${c.wil} · ${c.attack}`
        }
        onDelete={(c) =>
          run(
            saveCreatures(
              campaignId,
              creatures.filter((x) => x.id !== c.id),
            ),
            `${c.name} deleted.`,
          )
        }
      >
        {(close) => (
          <CreatureForm
            onCancel={close}
            onSave={(c) => {
              run(
                saveCreatures(campaignId, [...creatures, c]),
                `${c.name} saved. Find it in the fight tracker.`,
              );
              close();
            }}
          />
        )}
      </Maker>
      <details>
        <summary>The rulebook&rsquo;s {data.creatures.length} creatures</summary>
        <ul className="record">
          {data.creatures.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong>
              <div>
                HP {c.hp} · Armor {c.armor} · STR {c.str} · DEX {c.dex} · WIL {c.wil}
                {c.attack ? ` · ${c.attack}` : ''}
              </div>
              {c.notes.map((n) => (
                <div key={n} className="muted">
                  {n}
                </div>
              ))}
            </li>
          ))}
        </ul>
      </details>

      <Maker
        title="Origins"
        addLabel="New Origin"
        items={content.origins}
        describe={(o) => `+1 ${o.bonus.attribute.toUpperCase()} · ${o.trait} Kit: ${o.kitText}`}
        onDelete={(o) =>
          put(
            { ...content, origins: content.origins.filter((x) => x.id !== o.id) },
            `${o.name} deleted.`,
          )
        }
      >
        {(close) => (
          <OriginForm
            onCancel={close}
            onSave={(o) => {
              put({ ...content, origins: [...content.origins, o] }, `${o.name} saved.`);
              close();
            }}
          />
        )}
      </Maker>

      <Maker
        title="Abilities and Affinities"
        addLabel="New Ability"
        items={content.abilities}
        describe={(a) => `${affinityName(a.affinity)} · ${a.text}`}
        onDelete={(a) => {
          const abilities = content.abilities.filter((x) => x.id !== a.id);
          // An Affinity made here goes when its last Ability does.
          const affinities = content.affinities.filter((f) =>
            abilities.some((x) => x.affinity === f.id),
          );
          put({ ...content, abilities, affinities }, `${a.name} deleted.`);
        }}
      >
        {(close) => (
          <AbilityForm
            content={content}
            onCancel={close}
            onSave={(ability, newAffinity) => {
              const affinity = newAffinity ? { id: contentId(), ...newAffinity } : null;
              put(
                {
                  ...content,
                  affinities: affinity ? [...content.affinities, affinity] : content.affinities,
                  abilities: [
                    ...content.abilities,
                    { ...ability, affinity: affinity?.id ?? ability.affinity },
                  ],
                },
                `${ability.name} saved.`,
              );
              close();
            }}
          />
        )}
      </Maker>

      <Maker
        title="Gear"
        addLabel="New item"
        items={content.gear}
        describe={(g) =>
          [
            g.kind === 'special' ? 'special item' : g.kind,
            g.damage ? `d${g.damage}` : '',
            g.armor ? `${g.armor} Armor` : '',
            g.charges ? `${g.charges} charges` : '',
            g.slots === 2 ? 'bulky' : '',
            g.text ?? '',
          ]
            .filter(Boolean)
            .join(' · ')
        }
        onDelete={(g) =>
          put({ ...content, gear: content.gear.filter((x) => x.id !== g.id) }, `${g.name} deleted.`)
        }
      >
        {(close) => (
          <GearForm
            onCancel={close}
            onSave={(g) => {
              put(
                { ...content, gear: [...content.gear, g] },
                `${g.name} saved. Give it to a character from the party list.`,
              );
              close();
            }}
          />
        )}
      </Maker>

      <section aria-labelledby="worlds">
        <h2 id="worlds">Worlds</h2>
        <p className="hint">
          A world is everything you have made here, saved as a pack. Bring it into any campaign you
          run.
        </p>
        <form
          className="form"
          aria-label="Save as a world"
          onSubmit={(e) => {
            e.preventDefault();
            if (!worldName.trim()) return;
            run(
              saveWorld(uid, { name: worldName.trim(), content, creatures }),
              `${worldName.trim()} saved as a world.`,
            );
            setWorldName('');
          }}
        >
          <label>
            World name
            <input
              value={worldName}
              maxLength={80}
              onChange={(e) => setWorldName(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="button small"
            disabled={!worldName.trim() || nothingMade}
          >
            Save this campaign&rsquo;s content as a world
          </button>
        </form>
        <ul className="record">
          {worlds.map((w) => {
            const size =
              w.content.origins.length +
              w.content.abilities.length +
              w.content.gear.length +
              w.creatures.length;
            const merge = <T extends { id: string }>(mine: T[], theirs: T[]) => [
              ...mine,
              ...theirs.filter((t) => !mine.some((m) => m.id === t.id)),
            ];
            return (
              <li key={w.id}>
                <strong>{w.name}</strong> <span className="muted">{size} things</span>
                <div className="button-row">
                  <button
                    type="button"
                    className="button small"
                    onClick={() => {
                      run(
                        Promise.all([
                          saveContent(campaignId, {
                            origins: merge(content.origins, w.content.origins),
                            affinities: merge(content.affinities, w.content.affinities),
                            abilities: merge(content.abilities, w.content.abilities),
                            gear: merge(content.gear, w.content.gear),
                          }),
                          saveCreatures(campaignId, merge(creatures, w.creatures)),
                        ]),
                        `${w.name} is now part of this campaign.`,
                      );
                    }}
                  >
                    Bring <span className="sr-only">{w.name} </span>into this campaign
                  </button>
                  <button
                    type="button"
                    className="button small"
                    aria-label={`Delete the world ${w.name}`}
                    onClick={() => run(deleteWorld(uid, w.id), `${w.name} deleted.`)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
