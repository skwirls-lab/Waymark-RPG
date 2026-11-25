import { checkSave, hitCreature, moraleCheckDue, type Band } from '@waymark/rules';
import type { Combatant, Fight } from '../data/record';

/** What the fight tracker needs to know of a creature. */
export interface CreatureStats {
  name: string;
  hp: number;
  armor: number;
  str: number;
  wil: number;
  attack: string;
}

export const TURN_LABEL: Record<Fight['turn'], string> = {
  early: 'Players who made their Dexterity save',
  enemies: 'The enemies',
  late: 'Players who failed their Dexterity save',
  players: 'The players',
};

export const BANDS: { value: Band; label: string }[] = [
  { value: 'close', label: 'Close' },
  { value: 'near', label: 'Near' },
  { value: 'far', label: 'Far' },
  { value: 'distant', label: 'Distant' },
];

const blank = {
  hp: 0,
  hpFull: 0,
  armor: 0,
  str: 0,
  strFull: 0,
  wil: 0,
  attack: '',
  saveDue: false,
  down: false,
};

/** A fight begins with the party. Each player then makes a Dexterity save to act before the enemies. */
export function startFight(party: { id: string; name: string }[]): Fight {
  return {
    round: 1,
    turn: 'early',
    morale: null,
    combatants: party.map((p) => ({ ...blank, ...p, side: 'party', band: 'near', early: false })),
  };
}

/** Keeps the party in step with who is in the campaign now. */
export function syncParty(fight: Fight, party: { id: string; name: string }[]): Fight {
  const known = new Map(fight.combatants.filter((c) => c.side === 'party').map((c) => [c.id, c]));
  return {
    ...fight,
    combatants: [
      ...party.map((p): Combatant => ({
        ...blank,
        side: 'party',
        band: 'near',
        early: false,
        ...known.get(p.id),
        ...p,
      })),
      ...fight.combatants.filter((c) => c.side === 'enemy'),
    ],
  };
}

/** Adds one or more of a creature, numbered if there are several. */
export function addEnemies(
  fight: Fight,
  creature: CreatureStats,
  count: number,
  newId: () => string,
): Fight {
  const already = fight.combatants.filter(
    (c) => c.side === 'enemy' && c.name.startsWith(creature.name),
  ).length;
  const numbered = count > 1 || already > 0;
  const added = Array.from({ length: count }, (_, i): Combatant => ({
    id: newId(),
    name: numbered ? `${creature.name} ${already + i + 1}` : creature.name,
    side: 'enemy',
    band: 'near',
    early: false,
    hp: creature.hp,
    hpFull: creature.hp,
    armor: creature.armor,
    str: creature.str,
    strFull: creature.str,
    wil: creature.wil,
    attack: creature.attack,
    saveDue: false,
    down: false,
  }));
  return { ...fight, combatants: [...fight.combatants, ...added] };
}

const patch = (fight: Fight, id: string, change: Partial<Combatant>): Fight => ({
  ...fight,
  combatants: fight.combatants.map((c) => (c.id === id ? { ...c, ...change } : c)),
});

export const setBand = (fight: Fight, id: string, band: Band) => patch(fight, id, { band });
export const setEarly = (fight: Fight, id: string, early: boolean) => patch(fight, id, { early });
export const removeCombatant = (fight: Fight, id: string): Fight => ({
  ...fight,
  combatants: fight.combatants.filter((c) => c.id !== id),
});

/** Round 1: early players, enemies, late players. After that: all the players, then the enemies. */
export function nextTurn(fight: Fight): Fight {
  if (fight.round === 1) {
    if (fight.turn === 'early') return { ...fight, turn: 'enemies' };
    if (fight.turn === 'enemies') return { ...fight, turn: 'late' };
    return { ...fight, round: 2, turn: 'players' };
  }
  if (fight.turn === 'players') return { ...fight, turn: 'enemies' };
  return { ...fight, round: fight.round + 1, turn: 'players' };
}

function withMorale(fight: Fight, loneAtZeroHp: boolean, fell: boolean): Fight {
  const enemies = fight.combatants.filter((c) => c.side === 'enemy');
  const down = enemies.filter((c) => c.down).length;
  if (enemies.length <= 1) {
    return loneAtZeroHp && moraleCheckDue({ total: 1, down, loneAtZeroHp })
      ? { ...fight, morale: 'It fights alone and its HP has reached 0.' }
      : fight;
  }
  if (!fell || down === enemies.length || !moraleCheckDue({ total: enemies.length, down }))
    return fight;
  return {
    ...fight,
    morale: down === 1 ? 'The first of them has fallen.' : 'Half of them are down.',
  };
}

export interface DamageResult {
  fight: Fight;
  text: string;
}

/** Damage to an enemy: Armor, then HP, then Strength. Says what the Warden must do next. */
export function damageEnemy(fight: Fight, id: string, amount: number): DamageResult {
  const target = fight.combatants.find((c) => c.id === id && c.side === 'enemy');
  if (!target) return { fight, text: '' };
  const hit = hitCreature(target, amount);
  const next = patch(fight, id, {
    hp: hit.state.hp,
    str: hit.state.str,
    down: target.down || hit.dead,
    saveDue: hit.strengthSaveRequired,
  });
  const text = hit.dead
    ? `${target.name} takes ${hit.taken} and is dead.`
    : hit.strengthSaveRequired
      ? `${target.name} takes ${hit.taken}. Strength is now ${hit.state.str}: it makes a Strength save.`
      : hit.taken === 0
        ? `${target.name}'s armor stops it all.`
        : `${target.name} takes ${hit.taken}. HP ${hit.state.hp} of ${target.hpFull}.`;
  return { fight: withMorale(next, hit.reachedZeroHp, hit.dead && !target.down), text };
}

/** The Strength save after losing Strength: fail and the enemy is out of the fight. */
export function enemyStrengthSave(fight: Fight, id: string, d20: number): DamageResult {
  const target = fight.combatants.find((c) => c.id === id);
  if (!target) return { fight, text: '' };
  const holds = checkSave(target.str, d20);
  const next = patch(fight, id, { saveDue: false, down: !holds });
  return {
    fight: holds ? next : withMorale(next, false, true),
    text: holds
      ? `${target.name} stays on its feet.`
      : `${target.name} takes critical damage and is out of the fight.`,
  };
}

/** The enemies' Willpower save. The steadiest of those still standing rolls for them all. */
export function moraleWillpower(fight: Fight): number {
  const standing = fight.combatants.filter((c) => c.side === 'enemy' && !c.down);
  return Math.max(0, ...standing.map((c) => c.wil));
}

export function resolveMorale(fight: Fight, d20: number): DamageResult {
  const holds = checkSave(moraleWillpower(fight), d20);
  return {
    fight: { ...fight, morale: null },
    text: holds
      ? 'They hold their nerve and fight on.'
      : 'They lose their nerve. They run, surrender, or try to make a deal.',
  };
}
