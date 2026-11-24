import { z } from 'zod';
import affinitiesJson from '../data/affinities.json' with { type: 'json' };
import armorJson from '../data/armor.json' with { type: 'json' };
import backgroundsJson from '../data/backgrounds.json' with { type: 'json' };
import creaturesJson from '../data/creatures.json' with { type: 'json' };
import metaJson from '../data/meta.json' with { type: 'json' };
import misfiresJson from '../data/misfires.json' with { type: 'json' };
import namesJson from '../data/names.json' with { type: 'json' };
import originsJson from '../data/origins.json' with { type: 'json' };
import reactionsJson from '../data/reactions.json' with { type: 'json' };
import scarsJson from '../data/scars.json' with { type: 'json' };
import startingKitJson from '../data/starting-kit.json' with { type: 'json' };
import tiersJson from '../data/tiers.json' with { type: 'json' };
import toolsJson from '../data/tools.json' with { type: 'json' };
import weaponsJson from '../data/weapons.json' with { type: 'json' };

const die = z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]);
const text = z.string().min(1);
const byGenre = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ fantasy: item, modern: item, scifi: item });

export const schemas = {
  meta: z.object({ version: text, rulebookDraft: text }),
  backgrounds: byGenre(z.array(text).length(20)),
  names: byGenre(z.array(text).min(1)),
  origins: z.array(
    z.object({
      id: text,
      name: text,
      examples: text,
      bonus: z.object({ attribute: z.enum(['str', 'dex', 'wil']), amount: z.literal(1) }),
      trait: text,
      drawback: text.nullable(),
      slots: z.number().int().min(10),
      kitText: text,
      kit: z.array(
        z.object({
          name: text,
          slots: z.union([z.literal(1), z.literal(2)]),
          kind: z.enum(['weapon', 'armor', 'tool']),
          damage: die.optional(),
          armor: z.number().int().min(1).max(3).optional(),
          quantity: z.number().int().min(2).optional(),
        }),
      ),
    }),
  ),
  startingKit: z
    .array(z.object({ roll: z.number().int(), weapon: text, armor: text, tools: text }))
    .length(6),
  weapons: z.array(
    z.object({
      id: text,
      name: text,
      description: z.string(),
      damage: die,
      slots: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      cost: z.number().int().nullable(),
      examples: byGenre(text).optional(),
    }),
  ),
  armor: z.array(
    z.object({
      id: text,
      name: text,
      armor: z.number().int().min(1).max(3),
      stacks: z.boolean(),
      slots: z.union([z.literal(1), z.literal(2)]),
      place: z.enum(['hand', 'body']),
      slotsText: text,
      cost: z.number().int(),
      examples: text,
    }),
  ),
  tools: z.array(z.object({ name: text, cost: z.number().int() })),
  affinities: z
    .array(
      z.object({
        id: text,
        name: text,
        heading: text,
        about: text,
        suits: text,
        abilities: z.array(z.object({ id: text, name: text, text })).length(4),
      }),
    )
    .length(10),
  scars: z.array(z.object({ roll: z.number().int(), name: text, text })).length(12),
  misfires: z.array(z.object({ roll: z.number().int(), id: text, name: text, text })).length(6),
  reactions: z.array(
    z.object({
      min: z.number().int(),
      max: z.number().int(),
      rollText: text,
      id: text,
      name: text,
      text,
    }),
  ),
  tiers: z
    .array(
      z.object({
        tier: z.number().int(),
        abilitiesText: text,
        maxAbilities: z.number().int().nullable(),
        opens: z.string(),
      }),
    )
    .length(5),
  creatures: z.array(
    z.object({
      id: text,
      name: text,
      alsoKnownAs: text.nullable(),
      hp: z.number().int().min(1),
      armor: z.number().int().min(0).max(3),
      str: z.number().int(),
      dex: z.number().int(),
      wil: z.number().int(),
      attack: text.nullable(),
      damage: z.array(die),
      notes: z.array(text).min(1),
    }),
  ),
};

/** The default pool of content, checked against its schema when loaded. */
export const data = {
  meta: schemas.meta.parse(metaJson),
  backgrounds: schemas.backgrounds.parse(backgroundsJson),
  names: schemas.names.parse(namesJson),
  origins: schemas.origins.parse(originsJson),
  startingKit: schemas.startingKit.parse(startingKitJson),
  weapons: schemas.weapons.parse(weaponsJson),
  armor: schemas.armor.parse(armorJson),
  tools: schemas.tools.parse(toolsJson),
  affinities: schemas.affinities.parse(affinitiesJson),
  scars: schemas.scars.parse(scarsJson),
  misfires: schemas.misfires.parse(misfiresJson),
  reactions: schemas.reactions.parse(reactionsJson),
  tiers: schemas.tiers.parse(tiersJson),
  creatures: schemas.creatures.parse(creaturesJson),
};

export type RulesData = typeof data;
export type Origin = RulesData['origins'][number];
export type Affinity = RulesData['affinities'][number];
export type Creature = RulesData['creatures'][number];

/** Which Affinity each Ability belongs to. */
export const abilityIndex: Readonly<Record<string, string>> = Object.fromEntries(
  data.affinities.flatMap((affinity) => affinity.abilities.map((a) => [a.id, affinity.id])),
);
