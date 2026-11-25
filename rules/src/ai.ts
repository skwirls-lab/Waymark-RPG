import { z } from 'zod';
import { data } from './data.ts';
import {
  checkAbility,
  type CustomCreature,
  type CustomGear,
  type CustomOrigin,
} from './workshop.ts';

/**
 * What the AI helpers may return. Every result is checked against one of
 * these shapes before anyone sees it. A result that does not fit is thrown
 * away, never repaired by guesswork and never saved.
 *
 * The shapes are strict: a result carrying anything extra is refused.
 */

export const AI_ACTIONS = [
  'creature',
  'person',
  'place',
  'item',
  'origin',
  'ability',
  'recap',
  'filing',
  'rules',
] as const;
export type AiAction = (typeof AI_ACTIONS)[number];

/** Actions that need a campaign, and only its Warden may ask for. */
export const CAMPAIGN_ACTIONS: readonly AiAction[] = AI_ACTIONS.filter((a) => a !== 'rules');

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // One line: no line breaks, and nothing that could be read as markup.
    .regex(/^[^\n\r<>]*$/, 'must be one line of plain text');
const prose = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^<>]*$/, 'must be plain text');
const weaponDie = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10)]);
const attribute = z.number().int().min(1).max(18);

export const aiSchemas = {
  creature: z
    .object({
      name: line(40),
      hp: z.number().int().min(1).max(20),
      armor: z.number().int().min(0).max(3),
      str: attribute,
      dex: attribute,
      wil: attribute,
      attack: line(40),
      damage: z.union([weaponDie, z.literal(12)]),
      blast: z.boolean(),
      notes: z.array(line(200)).min(1).max(4),
    })
    .strict(),
  person: z.object({ name: line(60), text: prose(600), secret: prose(600) }).strict(),
  place: z.object({ name: line(60), text: prose(600), secret: prose(600) }).strict(),
  item: z
    .object({
      name: line(40),
      kind: z.enum(['weapon', 'armor', 'tool', 'special']),
      bulky: z.boolean(),
      damage: weaponDie.nullable(),
      ranged: z.boolean(),
      armor: z.number().int().min(1).max(3).nullable(),
      charges: z.number().int().min(1).max(3).nullable(),
      text: prose(300),
    })
    .strict(),
  origin: z
    .object({
      name: line(40),
      examples: line(120),
      attribute: z.enum(['str', 'dex', 'wil']),
      trait: prose(300),
      drawback: prose(300).nullable(),
      kit: z
        .array(
          z
            .object({
              name: line(40),
              kind: z.enum(['weapon', 'armor', 'tool']),
              damage: weaponDie.nullable(),
              bulky: z.boolean(),
            })
            .strict(),
        )
        .min(2)
        .max(4),
    })
    .strict(),
  ability: z
    .object({ name: line(40), text: prose(400), affinity: z.string().min(1).max(60) })
    .strict(),
  recap: z
    .object({ title: line(80), summary: prose(1500), openThreads: z.array(line(200)).max(6) })
    .strict(),
  filing: z
    .object({
      newCards: z
        .array(
          z
            .object({
              kind: z.enum(['person', 'place', 'creature', 'faction', 'item', 'thread']),
              name: line(60),
              text: prose(400),
            })
            .strict(),
        )
        .max(8),
      changedCards: z
        .array(
          z
            .object({
              id: z.string().min(1).max(40),
              status: z.enum(['met', 'changed', 'gone']),
              why: line(200),
            })
            .strict(),
        )
        .max(8),
    })
    .strict(),
  rules: z.object({ answer: prose(900), sectionId: z.string().max(120).nullable() }).strict(),
} as const;

export type AiResult<A extends AiAction = AiAction> = z.infer<(typeof aiSchemas)[A]>;

export type Checked<A extends AiAction> =
  { ok: true; value: AiResult<A> } | { ok: false; problems: string[] };

/** What a result may refer to: it can name only things that exist. */
export interface AiContext {
  /** Ids of the Affinities an Ability may belong to. */
  affinities?: readonly string[];
  /** Ids of the cards that filing may change. */
  cardIds?: readonly string[];
  /** Ids of the rulebook sections an answer may cite. */
  sectionIds?: readonly string[];
}

/**
 * Checks a result against its shape and the rulebook's ranges. `raw` is
 * whatever came back from the model, already parsed from JSON.
 */
export function checkAiResult<A extends AiAction>(
  action: A,
  raw: unknown,
  context: AiContext = {},
): Checked<A> {
  const parsed = aiSchemas[action].safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || 'result'}: ${issue.message}`,
      ),
    };
  }
  const problems: string[] = [];
  const value = parsed.data as AiResult;
  if (action === 'creature') {
    const c = value as AiResult<'creature'>;
    if (c.blast && c.damage > 6)
      problems.push('damage: an attack that hits everyone in an area does d6 at most');
  }
  if (action === 'item') {
    const g = value as AiResult<'item'>;
    if (g.kind === 'weapon' && g.damage === null)
      problems.push('damage: a weapon needs a damage die');
    if (g.kind === 'weapon' && g.damage !== null) {
      const most = (g.bulky ? 10 : 8) - (g.ranged ? 2 : 0);
      if (g.damage > most) problems.push(`damage: this weapon should do d${most} at most`);
    }
    if (g.kind === 'armor' && g.armor === null) problems.push('armor: armor needs an Armor value');
    if (g.kind === 'armor' && (g.armor ?? 0) >= 2 && !g.bulky)
      problems.push('bulky: Armor of 2 or 3 is bulky');
    if (g.kind === 'special' && g.charges === null)
      problems.push('charges: a special item has 1 to 3 charges');
  }
  if (action === 'origin') {
    const o = value as AiResult<'origin'>;
    if (o.kit.filter((k) => k.kind === 'weapon').length > 1)
      problems.push('kit: one weapon at most');
    if (o.kit.some((k) => k.kind === 'weapon' && k.damage === null))
      problems.push('kit: a weapon needs a damage die');
    if (/\b(hp|hit protection|armor|damage|extra turn)\b/i.test(o.trait)) {
      problems.push('trait: must not make the character better at fighting or give HP or Armor');
    }
  }
  if (action === 'ability') {
    const a = value as AiResult<'ability'>;
    problems.push(...checkAbility(a).map((warning) => `text: ${warning}`));
    if (context.affinities && !context.affinities.includes(a.affinity)) {
      problems.push('affinity: must be one of the ids listed');
    }
  }
  if (action === 'filing') {
    const f = value as AiResult<'filing'>;
    const known = context.cardIds ?? [];
    if (f.changedCards.some((c) => !known.includes(c.id)))
      problems.push('changedCards: may only use ids from the cards given');
  }
  if (action === 'rules') {
    const r = value as AiResult<'rules'>;
    if (r.sectionId !== null && context.sectionIds && !context.sectionIds.includes(r.sectionId)) {
      problems.push('sectionId: must be one of the ids listed, or null');
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: value as AiResult<A> };
}

/** A creature proposal as the workshop's creature. */
export function creatureFromAi(c: AiResult<'creature'>, id: string): CustomCreature {
  return {
    id,
    name: c.name,
    hp: c.hp,
    armor: c.armor,
    str: c.str,
    dex: c.dex,
    wil: c.wil,
    attack: `${c.attack} (d${c.damage}${c.blast ? ', blast' : ''})`,
    damage: [c.damage],
    blast: c.blast,
    notes: c.notes,
  };
}

/** A gear proposal as the workshop's gear. */
export function gearFromAi(g: AiResult<'item'>, id: string): CustomGear {
  return {
    id,
    name: g.name,
    kind: g.kind,
    slots: g.bulky ? 2 : 1,
    ...(g.kind === 'weapon' && g.damage ? { damage: g.damage, ranged: g.ranged } : {}),
    ...(g.kind === 'armor' && g.armor ? { armor: g.armor } : {}),
    ...(g.kind === 'special' && g.charges ? { charges: g.charges } : {}),
    text: g.text,
  };
}

/** An Origin proposal as the workshop's Origin. */
export function originFromAi(o: AiResult<'origin'>, id: string): CustomOrigin {
  const kit = o.kit.map((k) => ({
    name: k.name,
    kind: k.kind,
    slots: (k.bulky ? 2 : 1) as 1 | 2,
    ...(k.kind === 'weapon' && k.damage ? { damage: k.damage as 4 | 6 | 8 | 10 } : {}),
    ...(k.kind === 'armor' ? { armor: 1 } : {}),
  }));
  const describe = (k: (typeof kit)[number]) => {
    const parts = [
      'damage' in k ? `d${k.damage}` : '',
      'armor' in k ? '1 Armor' : '',
      k.slots === 2 ? 'bulky' : '',
    ].filter(Boolean);
    return parts.length ? `${k.name} (${parts.join(', ')})` : k.name;
  };
  return {
    id,
    name: o.name,
    examples: o.examples,
    bonus: { attribute: o.attribute, amount: 1 },
    trait: o.trait,
    drawback: o.drawback,
    slots: 10,
    kitText: kit.map(describe).join(', '),
    kit,
  };
}

/** The rulebook's Affinity ids, which an Ability proposal may use. */
export const RULEBOOK_AFFINITIES: readonly string[] = data.affinities.map((a) => a.id);
