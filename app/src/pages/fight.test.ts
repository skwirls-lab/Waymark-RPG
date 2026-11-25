import { describe, expect, it } from 'vitest';
import {
  addEnemies,
  damageEnemy,
  enemyStrengthSave,
  moraleWillpower,
  nextTurn,
  resolveMorale,
  setBand,
  setEarly,
  startFight,
  syncParty,
} from './fight';

const bandit = { name: 'Bandit', hp: 4, armor: 1, str: 10, wil: 8, attack: 'sword (d8)' };
let n = 0;
const id = () => `e${++n}`;
const fightWith = (count: number) => {
  n = 0;
  return addEnemies(startFight([{ id: 'wren', name: 'Wren' }]), bandit, count, id);
};

describe('the fight tracker', () => {
  it('starts with the party, each Near, and waits for Dexterity saves', () => {
    const fight = startFight([{ id: 'wren', name: 'Wren' }]);
    expect(fight).toMatchObject({ round: 1, turn: 'early', morale: null });
    expect(fight.combatants[0]).toMatchObject({
      name: 'Wren',
      side: 'party',
      band: 'near',
      early: false,
    });
  });

  it('numbers several of the same creature', () => {
    const fight = addEnemies(fightWith(2), bandit, 1, id);
    expect(fight.combatants.filter((c) => c.side === 'enemy').map((c) => c.name)).toEqual([
      'Bandit 1',
      'Bandit 2',
      'Bandit 3',
    ]);
    expect(fightWith(1).combatants[1]!.name).toBe('Bandit');
  });

  it('round one runs early players, enemies, late players; then players and enemies take turns', () => {
    let fight = fightWith(1);
    const seen = [];
    for (let i = 0; i < 7; i++) {
      seen.push(`${fight.round} ${fight.turn}`);
      fight = nextTurn(fight);
    }
    expect(seen).toEqual([
      '1 early',
      '1 enemies',
      '1 late',
      '2 players',
      '2 enemies',
      '3 players',
      '3 enemies',
    ]);
  });

  it('records distance and who acts first', () => {
    const fight = setEarly(setBand(fightWith(1), 'e1', 'far'), 'wren', true);
    expect(fight.combatants.find((c) => c.id === 'e1')!.band).toBe('far');
    expect(fight.combatants.find((c) => c.id === 'wren')!.early).toBe(true);
  });

  it('keeps the party in step with the campaign without losing what was set', () => {
    const fight = syncParty(setEarly(fightWith(1), 'wren', true), [
      { id: 'wren', name: 'Wren the Bold' },
      { id: 'ash', name: 'Ash' },
    ]);
    expect(fight.combatants.map((c) => [c.name, c.early])).toEqual([
      ['Wren the Bold', true],
      ['Ash', false],
      ['Bandit', false],
    ]);
  });

  it('damage goes through Armor to HP', () => {
    const { fight, text } = damageEnemy(fightWith(2), 'e1', 3);
    expect(fight.combatants.find((c) => c.id === 'e1')).toMatchObject({
      hp: 2,
      str: 10,
      down: false,
    });
    expect(text).toBe('Bandit 1 takes 2. HP 2 of 4.');
    expect(damageEnemy(fightWith(2), 'e1', 1).text).toBe("Bandit 1's armor stops it all.");
    expect(damageEnemy(fightWith(2), 'nobody', 3).text).toBe('');
  });

  it('damage past HP comes off Strength and calls for a Strength save', () => {
    const { fight, text } = damageEnemy(fightWith(2), 'e1', 7);
    expect(fight.combatants.find((c) => c.id === 'e1')).toMatchObject({
      hp: 0,
      str: 8,
      saveDue: true,
      down: false,
    });
    expect(text).toMatch(/makes a Strength save/);
    expect(fight.morale).toBeNull();

    const held = enemyStrengthSave(fight, 'e1', 8);
    expect(held.fight.combatants.find((c) => c.id === 'e1')).toMatchObject({
      saveDue: false,
      down: false,
    });
    const fell = enemyStrengthSave(fight, 'e1', 9);
    expect(fell.fight.combatants.find((c) => c.id === 'e1')!.down).toBe(true);
    expect(fell.fight.morale).toBe('The first of them has fallen.');
    expect(enemyStrengthSave(fight, 'nobody', 9).text).toBe('');
  });

  it('calls for morale when the first falls and when half are down, but not when all are', () => {
    let fight = fightWith(4);
    fight = damageEnemy(fight, 'e1', 40).fight;
    expect(fight.morale).toBe('The first of them has fallen.');
    fight = resolveMorale(fight, 1).fight;
    expect(fight.morale).toBeNull();
    fight = damageEnemy(fight, 'e2', 40).fight;
    expect(fight.morale).toBe('Half of them are down.');
    fight = { ...fight, morale: null };
    fight = damageEnemy(fight, 'e3', 40).fight;
    expect(fight.morale).toBeNull();
    fight = damageEnemy(fight, 'e4', 40).fight;
    expect(fight.morale).toBeNull();
  });

  it('a lone enemy checks morale when its HP reaches 0', () => {
    const first = damageEnemy(fightWith(1), 'e1', 5);
    expect(first.fight.morale).toBe('It fights alone and its HP has reached 0.');
    expect(damageEnemy(fightWith(1), 'e1', 2).fight.morale).toBeNull();
  });

  it('the steadiest enemy still standing rolls for them all', () => {
    let fight = addEnemies(fightWith(2), { ...bandit, name: 'Captain', wil: 13 }, 1, id);
    expect(moraleWillpower(fight)).toBe(13);
    expect(resolveMorale(fight, 13).text).toMatch(/hold their nerve/);
    expect(resolveMorale(fight, 14).text).toMatch(/lose their nerve/);
    fight = damageEnemy(fight, 'e3', 40).fight;
    expect(moraleWillpower(fight)).toBe(8);
  });
});
