import { describe, expect, it } from 'vitest';
import {
  RulesError,
  abilityIndex,
  abilityLimit,
  awardTier,
  canLearnAbility,
  catchCorruption,
  chooseSecondaryAffinity,
  corruptionDailySave,
  learnAbility,
  status,
  useAbility,
} from '../src/index.ts';
import { exhausted, item, tobin } from './helpers.ts';

describe('Using an Ability', () => {
  it('when safe it simply works, costs 1 Fatigue, and can be stretched', () => {
    const result = useAbility(tobin(), { abilityId: 'mend', inDanger: false });
    expect(result).toMatchObject({
      worked: true,
      canStretch: true,
      misfire: null,
      fatigue: ['slot'],
    });
    expect(result.character.fatigue).toBe(1);
  });

  it('in danger it needs a Willpower save; success works as normal', () => {
    const result = useAbility(tobin(), { abilityId: 'mend', inDanger: true, saveRolls: [12] });
    expect(result).toMatchObject({ worked: true, canStretch: false, misfire: null });
    expect(result.character.fatigue).toBe(1);
  });

  it('the rulebook example: Tobin rolls 15 against Willpower 12, misfires, and gains 2 Fatigue', () => {
    const result = useAbility(tobin(), {
      abilityId: 'mend',
      inDanger: true,
      saveRolls: [15],
      misfireRoll: 2,
    });
    expect(result).toMatchObject({ worked: false, misfire: 'drained', fatigue: ['slot', 'slot'] });
    expect(result.character.fatigue).toBe(2);
  });

  it('being deprived counts as pressure even outside a fight', () => {
    const deprived = tobin({ deprived: true });
    expect(() => useAbility(deprived, { abilityId: 'mend', inDanger: false })).toThrow(/d20/);
    expect(
      useAbility(deprived, { abilityId: 'mend', inDanger: false, saveRolls: [3] }).canStretch,
    ).toBe(false);
  });

  it('the Fatigue is gained whether or not the Ability works', () => {
    const result = useAbility(tobin(), {
      abilityId: 'mend',
      inDanger: true,
      saveRolls: [20],
      misfireRoll: 1,
    });
    expect(result).toMatchObject({ worked: false, misfire: 'fizzle' });
    expect(result.character.fatigue).toBe(1);
  });

  it('refuses an Ability the character does not know', () => {
    expect(() => useAbility(tobin(), { abilityId: 'bolt', inDanger: false })).toThrow(RulesError);
  });

  it('asks for the rolls it needs', () => {
    expect(() => useAbility(tobin(), { abilityId: 'mend', inDanger: true })).toThrow(
      /1 d20 roll\./,
    );
    expect(() =>
      useAbility(tobin(), { abilityId: 'mend', inDanger: true, saveRolls: [19] }),
    ).toThrow(/misfire table/);
    expect(() =>
      useAbility(tobin(), { abilityId: 'mend', inDanger: true, saveRolls: [19], misfireRoll: 3 }),
    ).toThrow(/Backlash/);
  });
});

describe('Misfires', () => {
  const misfire = (roll: number, extra = {}) =>
    useAbility(tobin(), {
      abilityId: 'mend',
      inDanger: true,
      saveRolls: [19],
      misfireRoll: roll,
      ...extra,
    });

  it('1 Fizzle: nothing happens', () =>
    expect(misfire(1)).toMatchObject({ misfire: 'fizzle', worked: false }));
  it('2 Drained: 1 extra Fatigue', () => expect(misfire(2).character.fatigue).toBe(2));

  it('3 Backlash: d6 damage, and Armor does not help', () => {
    const armored = tobin();
    armored.items.push(item({ kind: 'armor', armor: 3, slots: 2, place: 'body' }));
    const result = useAbility(armored, {
      abilityId: 'mend',
      inDanger: true,
      saveRolls: [19],
      misfireRoll: 3,
      backlashDamage: 2,
    });
    expect(result.character.hp.current).toBe(1);
  });

  it('3 Backlash: damage beyond HP comes off Strength', () => {
    const result = misfire(3, { backlashDamage: 5 });
    expect(result.character.hp.current).toBe(0);
    expect(result.character.attributes.str.current).toBe(6);
  });

  it('4 Astray and 5 Reversed: the Ability does not do what was wanted', () => {
    expect(misfire(4)).toMatchObject({ misfire: 'astray', worked: false });
    expect(misfire(5)).toMatchObject({ misfire: 'reversed', worked: false });
  });

  it('6 Blackout: the Ability works, but the character passes out', () => {
    const result = misfire(6);
    expect(result).toMatchObject({ misfire: 'blackout', worked: true });
    expect(result.character.conditions).toContain('unconscious');
  });

  it('refuses a misfire roll that is not on a d6', () => {
    expect(() => misfire(7)).toThrow(RulesError);
  });
});

describe('Using an Ability when slots are full', () => {
  it('an item must be dropped to make room for the Fatigue', () => {
    const full = tobin();
    full.items = Array.from({ length: 10 }, (_, i) => item({ id: `i${i}` }));
    expect(() => useAbility(full, { abilityId: 'mend', inDanger: false })).toThrow(/drop/);
    const result = useAbility(full, { abilityId: 'mend', inDanger: false, dropItemIds: ['i0'] });
    expect(result.fatigue).toEqual(['dropped']);
    expect(result.character.items).toHaveLength(9);
  });

  it('when every slot is Fatigue, each use costs 1 Strength instead', () => {
    const spent = { ...exhausted(), abilities: ['mend'], primaryAffinity: 'mending' };
    const result = useAbility(spent, { abilityId: 'mend', inDanger: false });
    expect(result.fatigue).toEqual(['strength']);
    expect(result.character.attributes.str.current).toBe(8);
  });
});

describe('Corrupted places', () => {
  it('saves to use Abilities are made with disadvantage: two rolls, the higher counts', () => {
    const fails = useAbility(tobin(), {
      abilityId: 'mend',
      inDanger: true,
      inCorruptedPlace: true,
      saveRolls: [3, 17],
      misfireRoll: 1,
    });
    expect(fails.worked).toBe(false);
    const passes = useAbility(tobin(), {
      abilityId: 'mend',
      inDanger: true,
      inCorruptedPlace: true,
      saveRolls: [3, 9],
    });
    expect(passes.worked).toBe(true);
    expect(() =>
      useAbility(tobin(), {
        abilityId: 'mend',
        inDanger: true,
        inCorruptedPlace: true,
        saveRolls: [3],
      }),
    ).toThrow(/2 d20 rolls/);
  });

  it('Fatigue gained there is tainted', () => {
    const result = useAbility(tobin(), {
      abilityId: 'mend',
      inDanger: false,
      inCorruptedPlace: true,
    });
    expect(result.character).toMatchObject({ fatigue: 0, taintedFatigue: 1 });
  });
});

describe('Tiers', () => {
  it('allow 2, 4 and 6 Abilities, then no limit', () => {
    expect([1, 2, 3, 4, 5].map(abilityLimit)).toEqual([2, 4, 6, Infinity, Infinity]);
    expect(() => abilityLimit(6)).toThrow(RulesError);
    expect(() => abilityLimit(0)).toThrow(RulesError);
  });

  it('a Tier 1 character with two Abilities cannot learn a third', () => {
    expect(canLearnAbility(tobin(), 'repair', abilityIndex)).toEqual({
      ok: false,
      reason: 'Tier 1 allows 2 Abilities.',
    });
    expect(() => learnAbility(tobin(), 'repair', abilityIndex)).toThrow(/Tier 1/);
  });

  it('gaining a Tier raises the limit', () => {
    const tier2 = awardTier(tobin());
    expect(tier2.tier).toBe(2);
    expect(learnAbility(tier2, 'repair', abilityIndex).abilities).toEqual([
      'mend',
      'cleanse',
      'repair',
    ]);
  });

  it("Abilities must come from the character's Affinities, exist, and be new", () => {
    const tier2 = awardTier(tobin());
    expect(canLearnAbility(tier2, 'bolt', abilityIndex)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/outside/),
    });
    expect(canLearnAbility(tier2, 'juggle', abilityIndex)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/not exist/),
    });
    expect(canLearnAbility(tier2, 'mend', abilityIndex)).toMatchObject({
      ok: false,
      reason: 'Already known.',
    });
  });

  it('a second Affinity opens at Tier 3', () => {
    expect(() => chooseSecondaryAffinity(awardTier(tobin()), 'energy')).toThrow(/Tier 3/);
    const tier3 = chooseSecondaryAffinity(awardTier(awardTier(tobin())), 'energy');
    expect(tier3.secondaryAffinity).toBe('energy');
    expect(learnAbility(tier3, 'bolt', abilityIndex).abilities).toContain('bolt');
  });

  it('the second Affinity must differ from the first', () => {
    expect(() => chooseSecondaryAffinity(awardTier(awardTier(tobin())), 'mending')).toThrow(
      /already/,
    );
  });

  it('a second Affinity recorded below Tier 3 cannot be learned from', () => {
    const early = { ...awardTier(tobin()), secondaryAffinity: 'energy' };
    expect(canLearnAbility(early, 'bolt', abilityIndex).ok).toBe(false);
  });

  it('Tier 5 is the highest', () => {
    const top = { ...tobin(), tier: 5 };
    expect(() => awardTier(top)).toThrow(/highest/);
  });
});

describe('Lasting corruption', () => {
  const afflicted = (over = {}) => catchCorruption(tobin(over));

  it('is caught once; catching it again does not reset the count', () => {
    const c = afflicted();
    c.corruption.failedSaves = 2;
    expect(catchCorruption(c).corruption.failedSaves).toBe(2);
  });

  it('a passed daily save adds nothing', () => {
    const result = corruptionDailySave(afflicted(), { d20: 5 });
    expect(result).toMatchObject({ saved: true, burned: null });
    expect(result.character.corruption.failedSaves).toBe(0);
  });

  it('failures are counted', () => {
    const once = corruptionDailySave(afflicted(), { d20: 18 });
    expect(once).toMatchObject({ saved: false, burned: null });
    expect(once.character.corruption.failedSaves).toBe(1);
  });

  it('three failures cost a character with Abilities one Tier, and the count starts again', () => {
    let c = awardTier(afflicted());
    c = corruptionDailySave(c, { d20: 18 }).character;
    c = corruptionDailySave(c, { d20: 18 }).character;
    const third = corruptionDailySave(c, { d20: 18 });
    expect(third.burned).toBe('tier');
    expect(third.character.tier).toBe(1);
    expect(third.character.corruption).toEqual({ afflicted: true, failedSaves: 0 });
  });

  it('Abilities over the new limit are lost, and the player chooses which', () => {
    let c = learnAbility(awardTier(afflicted()), 'repair', abilityIndex);
    c.corruption.failedSaves = 2;
    expect(() => corruptionDailySave(c, { d20: 18 })).toThrow(/Choose 1 Ability/);
    expect(() => corruptionDailySave(c, { d20: 18, forget: ['bolt'] })).toThrow(/Choose 1 Ability/);
    c = corruptionDailySave(c, { d20: 18, forget: ['cleanse'] }).character;
    expect(c.abilities).toEqual(['mend', 'repair']);
  });

  it('several Abilities may have to go at once', () => {
    const c = {
      ...afflicted(),
      tier: 4,
      abilities: ['mend', 'cleanse', 'repair', 'deep-rest', 'bolt', 'sweep', 'beacon', 'lash'],
    };
    c.corruption.failedSaves = 2;
    expect(() => corruptionDailySave(c, { d20: 18 })).toThrow(/Choose 2 Abilities/);
  });

  it('a character who would fall below Tier 1 is lost', () => {
    const c = afflicted();
    c.corruption.failedSaves = 2;
    const result = corruptionDailySave(c, { d20: 18 });
    expect(result.character.lost).toBe(true);
    expect(status(result.character)).toBe('lost');
  });

  it('a character without Abilities loses 1d4 from their full Willpower instead', () => {
    const c = afflicted({ abilities: [], primaryAffinity: null });
    c.corruption.failedSaves = 2;
    expect(() => corruptionDailySave(c, { d20: 18 })).toThrow(/d4/);
    const result = corruptionDailySave(c, { d20: 18, willpowerLoss: 3 });
    expect(result.burned).toBe('willpower');
    expect(result.character.attributes.wil).toEqual({ current: 9, full: 9 });
    expect(result.character.lost).toBe(false);
  });

  it('and is lost if full Willpower reaches 0', () => {
    const c = afflicted({ abilities: [], primaryAffinity: null });
    c.attributes.wil = { current: 2, full: 2 };
    c.corruption.failedSaves = 2;
    const result = corruptionDailySave(c, { d20: 18, willpowerLoss: 4 });
    expect(result.character.attributes.wil.full).toBe(0);
    expect(result.character.lost).toBe(true);
  });

  it('only an afflicted character makes the save', () => {
    expect(() => corruptionDailySave(tobin(), { d20: 5 })).toThrow(/no lasting corruption/);
  });
});
