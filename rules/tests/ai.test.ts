import { describe, expect, it } from 'vitest';
import {
  AI_ACTIONS,
  CAMPAIGN_ACTIONS,
  RULEBOOK_AFFINITIES,
  checkAiResult,
  checkCreature,
  checkGear,
  checkOrigin,
  creatureFromAi,
  gearFromAi,
  originFromAi,
  type AiResult,
} from '../src/index.ts';

const creature: AiResult<'creature'> = {
  name: 'Mud Lurker',
  hp: 6,
  armor: 1,
  str: 12,
  dex: 8,
  wil: 9,
  attack: 'bite',
  damage: 8,
  blast: false,
  notes: ['The water goes still before it strikes.'],
};
const item: AiResult<'item'> = {
  name: 'Tide hook',
  kind: 'weapon',
  bulky: false,
  damage: 8,
  ranged: false,
  armor: null,
  charges: null,
  text: 'A barbed hook on a chain.',
};
const origin: AiResult<'origin'> = {
  name: 'Riverfolk',
  examples: 'Otter-people',
  attribute: 'dex',
  trait: 'You swim as fast as you walk.',
  drawback: null,
  kit: [
    { name: 'Fishing spear', kind: 'weapon', damage: 8, bulky: false },
    { name: 'Net', kind: 'tool', damage: null, bulky: false },
  ],
};
const problems = (action: Parameters<typeof checkAiResult>[0], raw: unknown, context = {}) => {
  const checked = checkAiResult(action, raw, context);
  return checked.ok ? [] : checked.problems;
};

describe('what the AI helpers may return', () => {
  it('there are nine actions; all but rules questions belong to a campaign', () => {
    expect(AI_ACTIONS).toHaveLength(9);
    expect(CAMPAIGN_ACTIONS).not.toContain('rules');
    expect(CAMPAIGN_ACTIONS).toHaveLength(8);
  });

  it('accepts a well-formed result of every kind', () => {
    expect(problems('creature', creature)).toEqual([]);
    expect(problems('item', item)).toEqual([]);
    expect(problems('origin', origin)).toEqual([]);
    expect(
      problems('person', {
        name: 'Old Marrow',
        text: 'Keeps the ferry.',
        secret: 'He cut the ropes.',
      }),
    ).toEqual([]);
    expect(
      problems('place', {
        name: 'The Gorge',
        text: 'A hundred feet down.',
        secret: 'A cave below.',
      }),
    ).toEqual([]);
    expect(
      problems(
        'ability',
        { name: 'Stitch', text: 'Close a wound you can touch.', affinity: 'mending' },
        { affinities: RULEBOOK_AFFINITIES },
      ),
    ).toEqual([]);
    expect(
      problems('recap', {
        title: 'The Rope Bridge',
        summary: 'They crossed.',
        openThreads: ['Who cut the ropes?'],
      }),
    ).toEqual([]);
    expect(
      problems(
        'filing',
        {
          newCards: [{ kind: 'person', name: 'Tam', text: 'A guide.' }],
          changedCards: [{ id: 'c1', status: 'gone', why: 'Fell.' }],
        },
        { cardIds: ['c1'] },
      ),
    ).toEqual([]);
    expect(
      problems(
        'rules',
        {
          answer: 'Players who make a Dexterity save.',
          sectionId: 'adventure-and-danger/fighting',
        },
        { sectionIds: ['adventure-and-danger/fighting'] },
      ),
    ).toEqual([]);
    expect(
      problems(
        'rules',
        { answer: 'The rulebook does not say.', sectionId: null },
        { sectionIds: [] },
      ),
    ).toEqual([]);
  });

  it('refuses anything that is not the right shape', () => {
    expect(problems('creature', null)[0]).toMatch(/result/);
    expect(problems('creature', 'a wolf')).not.toEqual([]);
    expect(problems('creature', { ...creature, hp: '6' })[0]).toMatch(/^hp/);
    expect(problems('creature', { ...creature, notes: [] })[0]).toMatch(/^notes/);
    expect(problems('person', { name: 'Tam' })).toHaveLength(2);
  });

  it('refuses a result that carries anything extra', () => {
    expect(
      problems('creature', { ...creature, writeTo: 'entitlements/dana', plan: 'paid' }),
    ).not.toEqual([]);
    expect(
      problems('rules', { answer: 'Yes.', sectionId: null, link: 'https://evil.example' }),
    ).not.toEqual([]);
  });

  it('refuses markup, and line breaks where one line is wanted', () => {
    expect(problems('creature', { ...creature, name: '<script>alert(1)</script>' })[0]).toMatch(
      /plain text/,
    );
    expect(problems('creature', { ...creature, name: 'Mud\nLurker' })[0]).toMatch(/one line/);
    expect(
      problems('person', { name: 'Tam', text: '<img src=x onerror=alert(1)>', secret: 'x' })[0],
    ).toMatch(/plain text/);
  });

  it("holds creatures to the rulebook's ranges", () => {
    expect(problems('creature', { ...creature, hp: 0 })).not.toEqual([]);
    expect(problems('creature', { ...creature, hp: 21 })).not.toEqual([]);
    expect(problems('creature', { ...creature, armor: 4 })).not.toEqual([]);
    expect(problems('creature', { ...creature, str: 19 })).not.toEqual([]);
    expect(problems('creature', { ...creature, damage: 20 })).not.toEqual([]);
    expect(problems('creature', { ...creature, blast: true, damage: 8 })).toEqual([
      'damage: an attack that hits everyone in an area does d6 at most',
    ]);
    expect(problems('creature', { ...creature, blast: true, damage: 6 })).toEqual([]);
  });

  it("holds gear to the rulebook's ranges", () => {
    expect(problems('item', { ...item, damage: null })).toEqual([
      'damage: a weapon needs a damage die',
    ]);
    expect(problems('item', { ...item, damage: 10 })).toEqual([
      'damage: this weapon should do d8 at most',
    ]);
    expect(problems('item', { ...item, damage: 10, bulky: true })).toEqual([]);
    expect(problems('item', { ...item, ranged: true, damage: 8 })).toEqual([
      'damage: this weapon should do d6 at most',
    ]);
    expect(problems('item', { ...item, kind: 'armor', damage: null, armor: null })).toEqual([
      'armor: armor needs an Armor value',
    ]);
    expect(problems('item', { ...item, kind: 'armor', damage: null, armor: 2 })).toEqual([
      'bulky: Armor of 2 or 3 is bulky',
    ]);
    expect(problems('item', { ...item, kind: 'armor', damage: null, armor: 4 })).not.toEqual([]);
    expect(problems('item', { ...item, kind: 'special', damage: null })).toEqual([
      'charges: a special item has 1 to 3 charges',
    ]);
    expect(problems('item', { ...item, kind: 'special', damage: null, charges: 2 })).toEqual([]);
    expect(problems('item', { ...item, kind: 'tool', damage: null })).toEqual([]);
  });

  it("holds Origins to the rulebook's guidance", () => {
    expect(problems('origin', { ...origin, trait: 'You have 2 extra HP.' })[0]).toMatch(
      /better at fighting/,
    );
    expect(problems('origin', { ...origin, kit: [origin.kit[0], origin.kit[0]] })).toEqual([
      'kit: one weapon at most',
    ]);
    expect(
      problems('origin', { ...origin, kit: [{ ...origin.kit[0]!, damage: null }, origin.kit[1]] }),
    ).toEqual(['kit: a weapon needs a damage die']);
    expect(problems('origin', { ...origin, kit: [origin.kit[0]] })).not.toEqual([]);
  });

  it('holds Abilities to d6 or d8 and to an Affinity that exists', () => {
    const ability = {
      name: 'Smite',
      text: 'Strike one target that is Near for d12 damage.',
      affinity: 'energy',
    };
    expect(problems('ability', ability, { affinities: RULEBOOK_AFFINITIES })[0]).toMatch(
      /d6 or d8/,
    );
    expect(
      problems(
        'ability',
        { ...ability, text: 'A bolt for d6 damage.', affinity: 'necromancy' },
        { affinities: RULEBOOK_AFFINITIES },
      ),
    ).toEqual(['affinity: must be one of the ids listed']);
    expect(
      problems('ability', { ...ability, text: 'A bolt for d6 damage.', affinity: 'anything' }),
    ).toEqual([]);
  });

  it('filing may change only cards that exist, and answers may cite only sections given', () => {
    const filing = { newCards: [], changedCards: [{ id: 'made-up', status: 'gone', why: 'x' }] };
    expect(problems('filing', filing, { cardIds: ['c1'] })).toEqual([
      'changedCards: may only use ids from the cards given',
    ]);
    expect(problems('filing', filing)).toEqual([
      'changedCards: may only use ids from the cards given',
    ]);
    expect(
      problems('rules', { answer: 'Yes.', sectionId: 'made/up' }, { sectionIds: ['a/b'] }),
    ).toEqual(['sectionId: must be one of the ids listed, or null']);
    expect(problems('rules', { answer: 'Yes.', sectionId: 'made/up' })).toEqual([]);
  });
});

describe("turning a proposal into the workshop's own content", () => {
  it('a creature', () => {
    const made = creatureFromAi({ ...creature, blast: true, damage: 6 }, 'x-1');
    expect(made).toMatchObject({ id: 'x-1', attack: 'bite (d6, blast)', damage: [6], blast: true });
    expect(creatureFromAi(creature, 'x-1').attack).toBe('bite (d8)');
    expect(checkCreature(creatureFromAi(creature, 'x-1'))).toEqual([]);
  });

  it('gear of each kind', () => {
    expect(gearFromAi(item, 'x-2')).toEqual({
      id: 'x-2',
      name: 'Tide hook',
      kind: 'weapon',
      slots: 1,
      damage: 8,
      ranged: false,
      text: 'A barbed hook on a chain.',
    });
    expect(
      gearFromAi({ ...item, kind: 'armor', armor: 2, bulky: true, damage: null }, 'x'),
    ).toMatchObject({ slots: 2, armor: 2 });
    expect(gearFromAi({ ...item, kind: 'special', charges: 3, damage: null }, 'x')).toMatchObject({
      charges: 3,
    });
    expect(gearFromAi({ ...item, kind: 'tool', damage: null }, 'x')).not.toHaveProperty('damage');
    expect(checkGear(gearFromAi(item, 'x'))).toEqual([]);
  });

  it('an Origin, with its kit written out', () => {
    const made = originFromAi(
      {
        ...origin,
        kit: [...origin.kit, { name: 'Hide coat', kind: 'armor', damage: null, bulky: true }],
      },
      'x-3',
    );
    expect(made).toMatchObject({ id: 'x-3', bonus: { attribute: 'dex', amount: 1 }, slots: 10 });
    expect(made.kitText).toBe('Fishing spear (d8), Net, Hide coat (1 Armor, bulky)');
    expect(made.kit[2]).toEqual({ name: 'Hide coat', kind: 'armor', slots: 2, armor: 1 });
    expect(checkOrigin(made)).toEqual([]);
  });
});
