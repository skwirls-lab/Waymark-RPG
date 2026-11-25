import { data, reactionFor, type Band, type CustomCreature } from '@waymark/rules';
import { useState } from 'react';
import type { Summary } from '../data/campaigns';
import {
  addBeat,
  saveFight,
  useCreatures,
  useFight,
  type Fight as FightState,
} from '../data/record';
import { RollInput } from '../ui/RollInput';
import {
  BANDS,
  TURN_LABEL,
  addEnemies,
  damageEnemy,
  enemyStrengthSave,
  moraleWillpower,
  nextTurn,
  removeCombatant,
  resolveMorale,
  setBand,
  setEarly,
  startFight,
  syncParty,
} from './fight';

interface Props {
  campaignId: string;
  uid: string;
  summaries: Summary[];
}

const REACTIONS = Object.fromEntries(data.reactions.map((r) => [r.id, r]));

/** The 2d6 roll for how strangers take to the party, when the Warden has not decided. */
function ReactionRoll() {
  const [roll, setRoll] = useState<number>();
  const reaction = roll !== undefined && roll >= 2 && roll <= 12 ? reactionFor(roll) : null;
  return (
    <section aria-labelledby="reaction">
      <h2 id="reaction">How do they react?</h2>
      <p className="hint">
        When the party meets someone and you have not decided how they feel, roll for it.
      </p>
      <RollInput label="Reaction" spec={{ count: 2, sides: 6 }} value={roll} onChange={setRoll} />
      {reaction && (
        <p className="note" role="status">
          <strong>{REACTIONS[reaction]?.name}.</strong> {REACTIONS[reaction]?.text}
        </p>
      )}
    </section>
  );
}

/** The Warden's fight tracker: sides, turn order, enemy HP, distance and morale. */
export function Fight({ campaignId, uid, summaries }: Props) {
  const saved = useFight(campaignId, true);
  const custom = useCreatures(campaignId, true);
  const creatures: (CustomCreature | (typeof data.creatures)[number])[] = [
    ...data.creatures,
    ...custom,
  ];
  const party = summaries.map((s) => ({ id: s.id, name: s.name }));
  const [creatureId, setCreatureId] = useState(creatures[0]!.id);
  const [count, setCount] = useState(1);
  const [amounts, setAmounts] = useState<Record<string, number | undefined>>({});
  const [saves, setSaves] = useState<Record<string, number | undefined>>({});
  const [moraleRoll, setMoraleRoll] = useState<number>();
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState<string>();

  /**
   * Saves the fight. `tell` also writes a line on the campaign's timeline, so
   * the story shows where the fight sat in it without the Warden noting each
   * step. Lines that give away the enemies' numbers are for the Warden alone.
   */
  const store = (
    fight: FightState | null,
    text = '',
    tell?: { line: string; onlyWarden: boolean },
  ) => {
    setSaid(text);
    setProblem(undefined);
    const failed = () =>
      setProblem('That could not be saved. Check your connection and try again.');
    saveFight(campaignId, fight).catch(failed);
    if (tell) {
      addBeat(campaignId, uid, {
        text: tell.line.slice(0, 500),
        milestone: false,
        private: tell.onlyWarden,
        cardId: null,
        kind: 'fight',
      }).catch(failed);
    }
  };

  if (!saved) {
    return (
      <>
        <ReactionRoll />
        <section aria-labelledby="fight">
          <h2 id="fight">Fight</h2>
          <p>
            When a fight begins, describe what the enemies are about to do. Then every player makes
            a Dexterity save: those who succeed act before the enemies.
          </p>
          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
          <button
            type="button"
            className="button primary"
            onClick={() =>
              store(startFight(party), '', { line: 'A fight began.', onlyWarden: false })
            }
          >
            Start a fight
          </button>
        </section>
      </>
    );
  }

  const fight = syncParty(saved, party);
  const enemies = fight.combatants.filter((c) => c.side === 'enemy');
  const heroes = fight.combatants.filter((c) => c.side === 'party');
  const summaryOf = (id: string) => summaries.find((s) => s.id === id);
  const bandPicker = (id: string, name: string, band: Band) => (
    <label className="inline-field">
      <span className="sr-only">Distance of {name}</span>
      <select value={band} onChange={(e) => store(setBand(fight, id, e.target.value as Band))}>
        {BANDS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <section aria-labelledby="fight">
        <h2 id="fight">Fight</h2>
        <p className="turn" data-testid="turn">
          <span className="eyebrow">Round {fight.round}</span>
          <strong>{TURN_LABEL[fight.turn]}</strong>
          {fight.turn === 'early' && heroes.every((h) => !h.early) && (
            <span className="hint">
              Tick each character who made their Dexterity save. If nobody did, go on to the
              enemies.
            </span>
          )}
        </p>
        <div className="button-row">
          <button
            type="button"
            className="button primary"
            onClick={() => {
              const next = nextTurn(fight);
              store(next, '', {
                line: `Round ${next.round}: ${TURN_LABEL[next.turn].toLowerCase()}.`,
                onlyWarden: true,
              });
            }}
          >
            Next turn
          </button>
          <button
            type="button"
            className="button"
            onClick={() => store(null, '', { line: 'The fight ended.', onlyWarden: false })}
          >
            End the fight
          </button>
        </div>
        {problem && (
          <p className="error" role="alert">
            {problem}
          </p>
        )}
        <p className="note" role="status" hidden={!said}>
          {said}
        </p>

        {fight.morale && (
          <div className="panel alert" role="group" aria-label="Morale check">
            <h3>Will they keep fighting?</h3>
            <p>
              {fight.morale} Make a Willpower save for the enemies: roll{' '}
              <strong>{moraleWillpower(fight)}</strong> or less.
            </p>
            <RollInput
              label="Willpower save"
              spec={{ count: 1, sides: 20 }}
              value={moraleRoll}
              onChange={setMoraleRoll}
            />
            <button
              type="button"
              className="button small primary"
              disabled={moraleRoll === undefined || moraleRoll < 1 || moraleRoll > 20}
              onClick={() => {
                const result = resolveMorale(fight, moraleRoll!);
                setMoraleRoll(undefined);
                store(result.fight, result.text, {
                  line: `Morale: ${result.text}`,
                  onlyWarden: false,
                });
              }}
            >
              Check morale
            </button>
          </div>
        )}

        <h3>The party</h3>
        {heroes.length === 0 && <p className="muted">No characters in the campaign yet.</p>}
        <ul className="record">
          {heroes.map((h) => (
            <li key={h.id}>
              <strong>{h.name}</strong>{' '}
              <span className="muted">
                HP {summaryOf(h.id)?.hp.current ?? '?'} of {summaryOf(h.id)?.hp.full ?? '?'}
              </span>
              <div className="fight-row">
                {bandPicker(h.id, h.name, h.band)}
                {fight.round === 1 && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={h.early}
                      onChange={(e) => store(setEarly(fight, h.id, e.target.checked))}
                    />
                    Made the Dexterity save
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="hint">Change a character&rsquo;s HP from the party list, as usual.</p>

        <h3>The enemies</h3>
        {enemies.length === 0 && <p className="muted">No enemies yet. Add some below.</p>}
        <ul className="record">
          {enemies.map((e) => (
            <li key={e.id} data-testid={`enemy-${e.name}`} className={e.down ? 'down' : undefined}>
              <strong>{e.name}</strong>
              {e.down && <span className="tag warn">Down</span>}
              <div>
                HP {e.hp} of {e.hpFull} · Armor {e.armor} · Strength {e.str}
                {e.str !== e.strFull && ` of ${e.strFull}`} · Willpower {e.wil}
              </div>
              <div className="muted">{e.attack}</div>
              {!e.down && (
                <div className="fight-row">
                  {bandPicker(e.id, e.name, e.band)}
                  <label className="inline-field">
                    Damage to {e.name}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={amounts[e.id] ?? ''}
                      onChange={(event) =>
                        setAmounts({
                          ...amounts,
                          [e.id]:
                            event.target.value === '' ? undefined : Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button small"
                    aria-label={`Apply damage to ${e.name}`}
                    disabled={!Number.isInteger(amounts[e.id]) || amounts[e.id]! < 0}
                    onClick={() => {
                      const result = damageEnemy(fight, e.id, amounts[e.id]!);
                      setAmounts({ ...amounts, [e.id]: undefined });
                      store(result.fight, result.text, { line: result.text, onlyWarden: true });
                    }}
                  >
                    Apply
                  </button>
                </div>
              )}
              {e.saveDue && !e.down && (
                <div className="panel">
                  <RollInput
                    label={`Strength save for ${e.name}`}
                    spec={{ count: 1, sides: 20 }}
                    value={saves[e.id]}
                    onChange={(value) => setSaves({ ...saves, [e.id]: value })}
                    hint={`Roll ${e.str} or less to stay up.`}
                  />
                  <button
                    type="button"
                    className="button small primary"
                    disabled={saves[e.id] === undefined || saves[e.id]! < 1 || saves[e.id]! > 20}
                    onClick={() => {
                      const result = enemyStrengthSave(fight, e.id, saves[e.id]!);
                      setSaves({ ...saves, [e.id]: undefined });
                      store(result.fight, result.text, { line: result.text, onlyWarden: true });
                    }}
                  >
                    Make the save
                  </button>
                </div>
              )}
              <button
                type="button"
                className="link-button"
                aria-label={`Remove ${e.name} from the fight`}
                onClick={() => store(removeCombatant(fight, e.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <form
          className="form panel"
          aria-label="Add enemies"
          onSubmit={(event) => {
            event.preventDefault();
            const creature = creatures.find((c) => c.id === creatureId);
            if (creature) {
              store(
                addEnemies(fight, { ...creature, attack: creature.attack ?? '' }, count, () =>
                  crypto.randomUUID(),
                ),
                '',
                { line: `Joined the fight: ${count} × ${creature.name}.`, onlyWarden: false },
              );
            }
          }}
        >
          <label>
            Creature
            <select value={creatureId} onChange={(e) => setCreatureId(e.target.value)}>
              {creatures.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (HP {c.hp}
                  {c.attack ? `, ${c.attack}` : ''})
                </option>
              ))}
            </select>
          </label>
          <label>
            How many?
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
            />
          </label>
          <button type="submit" className="button small">
            Add to the fight
          </button>
        </form>
      </section>
      <ReactionRoll />
    </>
  );
}
