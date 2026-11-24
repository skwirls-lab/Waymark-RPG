import { describe, expect, it } from 'vitest';
import {
  CROWD_ATTACK,
  RulesError,
  applyDamage,
  attackDie,
  loseAttribute,
  modifierAgainstCrowd,
  resolveStrengthSave,
  restoreAttribute,
  rollBlast,
  rollDamage,
  sequenceRng,
  stabilize,
  status,
} from '../src/index.ts';
import { wren } from './helpers.ts';

describe('Fighting: attacking', () => {
  it('the rulebook example: a 6 against 1 Armor takes 5 HP', () => {
    const bandit = { ...wren(), hp: { current: 8, full: 8 } };
    const result = applyDamage(bandit, 6);
    expect(result.taken).toBe(5);
    expect(result.character.hp.current).toBe(3);
  });

  it('Armor can absorb a whole attack', () => {
    const result = applyDamage(wren(), 1);
    expect(result).toMatchObject({
      taken: 0,
      hpLost: 0,
      scarRequired: false,
      strengthSaveRequired: false,
    });
  });

  it('refuses damage that is not a whole number of zero or more', () => {
    expect(() => applyDamage(wren(), -1)).toThrow(RulesError);
    expect(() => applyDamage(wren(), 2.5)).toThrow(RulesError);
  });
});

describe('Fighting: when an attack is weaker or stronger', () => {
  it('an impaired attack rolls a d4 whatever the weapon', () =>
    expect(attackDie(10, 'impaired')).toBe(4));
  it('an enhanced attack rolls a d12 whatever the weapon', () =>
    expect(attackDie(6, 'enhanced')).toBe(12));
  it("otherwise the weapon's own die is rolled", () => {
    expect(attackDie(8)).toBe(8);
    expect(attackDie(8, 'normal')).toBe(8);
  });
});

describe('Fighting: other attack rules', () => {
  it('two weapons: roll both and use the higher', () => {
    expect(rollDamage([6, 6], sequenceRng([2, 5]))).toEqual({ rolls: [2, 5], damage: 5 });
  });

  it("ganging up: roll every attacker's die and use the single highest", () => {
    expect(rollDamage([6, 8, 10], sequenceRng([4, 7, 3])).damage).toBe(7);
  });

  it('a Blast rolls separately for each target', () => {
    expect(rollBlast(6, 3, sequenceRng([1, 6, 4]))).toEqual([1, 6, 4]);
  });

  it('an attack needs at least one die', () => {
    expect(() => rollDamage([], sequenceRng([]))).toThrow(RulesError);
  });
});

describe('Getting hurt', () => {
  it('reaching exactly 0 HP calls for a Scar', () => {
    const result = applyDamage(wren(), 5); // 4 after Armor, and 4 HP
    expect(result.character.hp.current).toBe(0);
    expect(result).toMatchObject({
      scarRequired: true,
      strengthLost: 0,
      strengthSaveRequired: false,
    });
  });

  it('the rulebook example: 7 damage takes Wren to 0 HP and Strength 9 to 7', () => {
    const result = applyDamage(wren(), 7);
    expect(result).toMatchObject({
      taken: 6,
      hpLost: 4,
      strengthLost: 2,
      scarRequired: false,
      strengthSaveRequired: true,
    });
    expect(result.character.attributes.str.current).toBe(7);
    // "Sam must now roll 7 or less. Sam rolls a 5."
    const save = resolveStrengthSave(result.character, 5);
    expect(save.success).toBe(true);
    expect(status(save.character)).toBe('ok');
  });

  it('a failed Strength save means critical damage', () => {
    const hurt = applyDamage(wren(), 7).character;
    const save = resolveStrengthSave(hurt, 8);
    expect(save.success).toBe(false);
    expect(status(save.character)).toBe('critical');
  });

  it('another character can stabilize someone with critical damage', () => {
    const critical = resolveStrengthSave(applyDamage(wren(), 7).character, 20).character;
    expect(status(stabilize(critical))).toBe('ok');
  });

  it('with no HP left, all damage goes to Strength and no Scar is rolled', () => {
    const atZero = { ...wren(), hp: { current: 0, full: 4 } };
    const result = applyDamage(atZero, 4);
    expect(result).toMatchObject({
      hpLost: 0,
      strengthLost: 3,
      scarRequired: false,
      strengthSaveRequired: true,
    });
  });

  it('an overloaded character is treated as being at 0 HP', () => {
    const overloaded = { ...wren(), fatigue: 4, hp: { current: 4, full: 4 } };
    expect(applyDamage(overloaded, 3).strengthLost).toBe(2);
  });

  it('Strength at 0 is death, and no save is made', () => {
    const result = applyDamage(wren(), 30);
    expect(result).toMatchObject({ dead: true, strengthSaveRequired: false });
    expect(result.character.attributes.str.current).toBe(0);
    expect(status(result.character)).toBe('dead');
  });

  it('damage can ignore Armor when a rule says so', () => {
    expect(applyDamage(wren(), 3, { ignoreArmor: true }).taken).toBe(3);
  });
});

describe('Getting hurt: losing attribute points', () => {
  it('Dexterity at 0 is paralysis', () => {
    expect(status(loseAttribute(wren(), 'dex', 13))).toBe('paralyzed');
  });

  it('Willpower at 0 is delirium', () => {
    expect(status(loseAttribute(wren(), 'wil', 99))).toBe('delirious');
  });

  it('an attribute cannot fall below 0', () => {
    expect(loseAttribute(wren(), 'wil', 99).attributes.wil.current).toBe(0);
  });

  it('restored points cannot exceed the full score', () => {
    const hurt = loseAttribute(wren(), 'str', 4);
    expect(restoreAttribute(hurt, 'str', 2).attributes.str.current).toBe(7);
    expect(restoreAttribute(hurt, 'str', 6).attributes.str.current).toBe(9);
  });
});

describe('Scars: Doomed', () => {
  it('a Doomed character who fails their next Strength save dies', () => {
    const doomed = { ...applyDamage(wren(), 7).character, doomed: true };
    const save = resolveStrengthSave(doomed, 19);
    expect(save.dead).toBe(true);
    expect(status(save.character)).toBe('dead');
  });

  it('one who passes is no longer Doomed and is owed a 3d6 roll for HP', () => {
    const doomed = { ...applyDamage(wren(), 7).character, doomed: true };
    const save = resolveStrengthSave(doomed, 2);
    expect(save).toMatchObject({ success: true, doomedRewardDue: true, dead: false });
    expect(save.character.doomed).toBe(false);
  });
});

describe('Fighting a crowd', () => {
  it('one person attacking a crowd is impaired, unless the attack is a Blast', () => {
    expect(modifierAgainstCrowd(false)).toBe('impaired');
    expect(modifierAgainstCrowd(true)).toBe('normal');
  });

  it("a crowd's attacks are enhanced and count as Blast", () => {
    expect(CROWD_ATTACK).toEqual({ modifier: 'enhanced', blast: true });
  });
});
