import {
  AI_ACTIONS,
  CAMPAIGN_ACTIONS,
  GUEST_AI_REQUESTS,
  allAffinities,
  checkAiResult,
  data,
  limitsOf,
  relevantSections,
  rulebookSections,
  type AiAction,
  type AiContext,
} from '@waymark/rules';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { PREAMBLE, TEMPLATES } from './aiTemplates';

/**
 * AI help. One function, a fixed instruction for each button, and a strict
 * check on everything that comes back. It returns proposals for a person to
 * review. It never writes to the database for the model: the only thing it
 * records is the count of requests.
 */

export interface Message {
  role: 'system' | 'user';
  content: string;
}
/** Sends messages to a model and returns its reply as text. */
export type ModelCall = (messages: Message[]) => Promise<{ text: string; cost?: number }>;

export const SITE = 'https://waymark-rpg.web.app';
const OFF = 'AI help is not switched on yet.';
const UNUSABLE = 'The AI did not return something usable, so nothing was saved. Try again.';

export function openRouterCaller(key: string, model: string): ModelCall {
  return async (messages) => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Title': 'Waymark',
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 1200,
        usage: { include: true },
      }),
    });
    if (!response.ok) {
      console.error('The model service refused a request', response.status);
      throw new HttpsError('unavailable', 'The AI service did not answer. Try again in a moment.');
    }
    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
      usage?: { cost?: number };
    };
    const text = body.choices?.[0]?.message?.content;
    return { text: typeof text === 'string' ? text : '', cost: body.usage?.cost };
  };
}

const clip = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** The month a request counts against, in UTC: allowances renew on the 1st. */
export const monthOf = (now: Date): string => now.toISOString().slice(0, 7);

/** Counts one request against the month's allowance, or refuses if it is used up. */
export async function reserve(
  db: Firestore,
  uid: string,
  now: Date,
  limits: Limits = {},
): Promise<{ used: number; allowance: number }> {
  const month = monthOf(now);
  const day = now.toISOString().slice(0, 10);
  const usage = db.doc(`usage/${uid}`);
  const everyone = db.doc(EVERYONE);

  // A ceiling on the whole app's requests in a day, whoever makes them. It is
  // a backstop, so it is read outside the transaction: every request sharing
  // one locked counter would make them queue behind each other.
  const total = await everyone.get();
  const today = total.get('day') === day ? Number(total.get('ai') ?? 0) : 0;
  if (limits.dailyCap !== undefined && today >= limits.dailyCap) {
    throw new HttpsError(
      'resource-exhausted',
      'AI help has been very busy today and is resting. Try again tomorrow.',
    );
  }

  const result = await db.runTransaction(async (tx) => {
    const [entitlement, record] = await Promise.all([
      tx.get(db.doc(`entitlements/${uid}`)),
      tx.get(usage),
    ]);
    const allowance = limits.guest ? GUEST_AI_REQUESTS : limitsOf(entitlement.data()).aiRequests;
    const used = record.get('month') === month ? Number(record.get('ai') ?? 0) : 0;
    if (used >= allowance) {
      throw new HttpsError(
        'resource-exhausted',
        limits.guest
          ? `A guest has ${allowance} AI requests a month, and you have used them. Create an account for more.`
          : `You have used all ${allowance} AI requests for this month. They renew on the 1st.`,
      );
    }
    tx.set(usage, { month, ai: used + 1, updatedAt: now.getTime() });
    return { used: used + 1, allowance };
  });
  await (total.get('day') === day
    ? everyone.update({ ai: FieldValue.increment(1) })
    : everyone.set({ day, ai: 1 }));
  return result;
}

/** Whose allowance applies, and the ceiling for everyone together. */
export interface Limits {
  /** A guest, with no account: a small allowance. */
  guest?: boolean;
  /** The most requests the whole app may make in a day. */
  dailyCap?: number;
}

/** The count of every account's requests today. Not a user id: those never start with an underscore. */
const EVERYONE = 'usage/_everyone';

/** Gives a request back when the model produced nothing usable. */
async function refund(db: Firestore, uid: string, now: Date): Promise<void> {
  const usage = db.doc(`usage/${uid}`);
  const everyone = db.doc(EVERYONE);
  await db.runTransaction(async (tx) => {
    const record = await tx.get(usage);
    if (record.get('month') === monthOf(now)) {
      tx.update(usage, { ai: Math.max(0, Number(record.get('ai') ?? 0) - 1) });
    }
  });
  if ((await everyone.get()).get('day') === now.toISOString().slice(0, 10)) {
    await everyone.update({ ai: FieldValue.increment(-1) });
  }
}

interface Prepared {
  /** What the model is given to write from. */
  payload: Record<string, unknown>;
  /** What its reply may refer to. */
  context: AiContext;
}

const oldestFirst = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => [...docs].reverse();

/** Gathers what a campaign action writes from. Read on the server: the browser's word is not taken for it. */
async function prepareCampaign(
  db: Firestore,
  uid: string,
  action: AiAction,
  campaignId: string,
  hint: string,
): Promise<Prepared> {
  const campaign = await db.doc(`campaigns/${campaignId}`).get();
  if (!campaign.exists || campaign.get('wardenUid') !== uid) {
    throw new HttpsError(
      'permission-denied',
      'Only the Warden of a campaign can use AI help for it.',
    );
  }
  const [brief, content, creatures, cards] = await Promise.all([
    campaign.ref.collection('shared').doc('brief').get(),
    campaign.ref.collection('shared').doc('content').get(),
    campaign.ref.collection('private').doc('creatures').get(),
    campaign.ref.collection('cards').get(),
  ]);
  const setting = clip(brief.get('setting'), 1500);
  const made = (content.data() ?? {}) as {
    origins?: { name: string }[];
    abilities?: { name: string }[];
    gear?: { name: string }[];
    affinities?: { id: string; name: string; about: string }[];
  };
  const cardList = cards.docs.map((c) => ({
    id: c.id,
    kind: String(c.get('kind')),
    name: clip(c.get('name'), 80),
    status: String(c.get('status')),
    text: clip(c.get('text'), 200),
  }));
  const base = { setting, hint };
  const names = (list: { name: string }[] | undefined) => (list ?? []).map((x) => clip(x.name, 60));

  switch (action) {
    case 'creature':
      return {
        payload: {
          ...base,
          existingNames: [
            ...data.creatures.map((c) => c.name),
            ...names(creatures.get('list') as { name: string }[] | undefined),
          ],
        },
        context: {},
      };
    case 'person':
    case 'place':
      return { payload: { ...base, existingNames: cardList.map((c) => c.name) }, context: {} };
    case 'item':
      return { payload: { ...base, existingNames: names(made.gear) }, context: {} };
    case 'origin':
      return {
        payload: {
          ...base,
          existingNames: [...data.origins.map((o) => o.name), ...names(made.origins)],
        },
        context: {},
      };
    case 'ability': {
      const affinities = allAffinities({ affinities: made.affinities ?? [] }).map((a) => ({
        id: a.id,
        name: a.name,
        about: a.about,
      }));
      return {
        payload: {
          ...base,
          affinities,
          existingNames: [
            ...data.affinities.flatMap((a) => a.abilities.map((b) => b.name)),
            ...names(made.abilities),
          ],
        },
        context: { affinities: affinities.map((a) => a.id) },
      };
    }
    default: {
      // recap and filing: the story so far.
      const [beats, feed, summaries] = await Promise.all([
        campaign.ref.collection('beats').orderBy('at', 'desc').limit(40).get(),
        campaign.ref.collection('log').orderBy('at', 'desc').limit(30).get(),
        campaign.ref.collection('summaries').get(),
      ]);
      // The players' own characters, so the model does not file them as people met.
      const party = summaries.docs.map((s) => clip(s.get('name'), 80));
      const told = oldestFirst(beats.docs).map((b) => clip(b.get('text'), 500));
      if (told.length === 0) {
        throw new HttpsError(
          'failed-precondition',
          'There is nothing on the timeline yet to work from.',
        );
      }
      return action === 'recap'
        ? {
            payload: {
              setting,
              party,
              beats: told,
              feed: oldestFirst(feed.docs).map((f) => clip(f.get('text'), 200)),
            },
            context: {},
          }
        : {
            payload: { setting, party, beats: told, cards: cardList },
            context: { cardIds: cardList.map((c) => c.id) },
          };
    }
  }
}

/** The two messages sent to the model. User text is only ever inside the second, as JSON. */
export function buildMessages(action: AiAction, payload: Record<string, unknown>): Message[] {
  return [
    { role: 'system', content: `${PREAMBLE}\n\n${TEMPLATES[action]}` },
    { role: 'user', content: `DATA:\n${JSON.stringify(payload)}` },
  ];
}

/** Reads the model's reply as JSON, forgiving only a code fence around it. */
export function parseReply(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

export interface AiAnswer {
  action: AiAction;
  proposal: Record<string, unknown>;
  /** Requests used this month, counting this one, and the month's allowance. */
  used: number;
  allowance: number;
}

/**
 * Asks the model, checks the reply, and asks once more if the reply was not
 * usable. Returns the checked reply, or `null` after two failures.
 */
export async function askChecked(
  model: ModelCall,
  action: AiAction,
  payload: Record<string, unknown>,
  context: AiContext,
): Promise<{
  value: Record<string, unknown> | null;
  attempts: number;
  cost: number;
  problems: string[];
}> {
  const messages = buildMessages(action, payload);
  let cost = 0;
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const retry: Message[] =
      attempt === 1
        ? []
        : [
            {
              role: 'system',
              content: `Your last reply could not be used: ${problems.slice(0, 5).join('; ')}. Reply again with one JSON object that follows the task exactly.`,
            },
          ];
    const reply = await model([...messages, ...retry]);
    cost += reply.cost ?? 0;
    const parsed = parseReply(reply.text);
    const checked =
      parsed === undefined
        ? ({ ok: false, problems: ['result: the reply was not JSON'] } as const)
        : checkAiResult(action, parsed, context);
    if (checked.ok)
      return {
        value: checked.value as Record<string, unknown>,
        attempts: attempt,
        cost,
        problems: [],
      };
    problems = [...checked.problems];
  }
  return { value: null, attempts: 2, cost, problems };
}

export async function aiHelp(
  db: Firestore,
  uid: string,
  input: { action?: unknown; campaignId?: unknown; hint?: unknown; question?: unknown },
  model: ModelCall | null,
  now: Date = new Date(),
  limits: Limits = {},
): Promise<AiAnswer> {
  const action = AI_ACTIONS.find((a) => a === input.action);
  if (!action)
    throw new HttpsError('invalid-argument', 'That is not something the AI can help with.');
  if (!model) throw new HttpsError('failed-precondition', OFF);

  let prepared: Prepared;
  if (CAMPAIGN_ACTIONS.includes(action)) {
    const campaignId = clip(input.campaignId, 200);
    if (!campaignId || campaignId.includes('/'))
      throw new HttpsError('invalid-argument', 'Choose a campaign first.');
    prepared = await prepareCampaign(db, uid, action, campaignId, clip(input.hint, 300));
  } else {
    const question = clip(input.question, 300);
    if (question.length < 3) throw new HttpsError('invalid-argument', 'Type a question first.');
    const sections = relevantSections(question, rulebookSections, 4);
    if (sections.length === 0) {
      // Nothing in the rulebook shares a word with the question. No request is spent.
      const usage = await db.doc(`usage/${uid}`).get();
      return {
        action,
        proposal: {
          answer: 'I could not find anything in the rulebook about that. Try other words.',
          sectionId: null,
        },
        used: usage.get('month') === monthOf(now) ? Number(usage.get('ai') ?? 0) : 0,
        allowance: limits.guest
          ? GUEST_AI_REQUESTS
          : limitsOf((await db.doc(`entitlements/${uid}`).get()).data()).aiRequests,
      };
    }
    prepared = {
      payload: {
        question,
        sections: sections.map((s) => ({ id: s.id, title: s.title, text: s.text })),
      },
      context: { sectionIds: sections.map((s) => s.id) },
    };
  }

  const { used, allowance } = await reserve(db, uid, now, limits);
  let result;
  try {
    result = await askChecked(model, action, prepared.payload, prepared.context);
  } catch (problem) {
    await refund(db, uid, now);
    throw problem;
  }
  if (result.value === null) {
    await refund(db, uid, now);
    console.warn('An AI reply was thrown away', action, result.problems.slice(0, 3));
    // 'aborted', so that the app shows this message and not a generic one about the connection.
    throw new HttpsError('aborted', UNUSABLE);
  }

  const proposal = result.value;
  if (action === 'rules') {
    const section = rulebookSections.find((s) => s.id === proposal.sectionId);
    // The link is made here from the rulebook's own list, never taken from the model.
    proposal.sectionTitle = section ? `${section.chapter}: ${section.title}` : null;
    proposal.link = section ? `${SITE}${section.path}` : null;
  }
  return { action, proposal, used, allowance };
}

/**
 * A stand-in model with fixed replies, used by the local emulator so the app
 * can be tested end to end without a real model or a key.
 */
export const fixtureModel: ModelCall = async (messages) => {
  const instructions = messages[0]!.content;
  const dataMessage = messages[1]!.content.replace(/^DATA:\n/, '');
  const given = JSON.parse(dataMessage) as {
    sections?: { id: string }[];
    cards?: { id: string }[];
    hint?: string;
  };
  const replies: Record<string, unknown> = {
    'invent one creature': {
      name: 'Reed Stalker',
      hp: 5,
      armor: 0,
      str: 9,
      dex: 14,
      wil: 8,
      attack: 'hooked claws',
      damage: 6,
      blast: false,
      notes: [
        'Tall, thin, and the colour of dead reeds.',
        'The frogs go silent just before it moves.',
      ],
    },
    'invent one person': {
      name: 'Hesta Vole',
      text: 'A toll-keeper with a ledger she never puts down.',
      secret: 'The ledger records who crossed the night the bridge fell.',
    },
    'invent one place': {
      name: 'The Sunken Chapel',
      text: 'Only the bell tower stands above the water. The bell still rings in a storm.',
      secret: 'The crypt below is dry, and someone lives in it.',
    },
    'invent one piece': {
      name: 'Storm Lantern',
      kind: 'special',
      bulky: false,
      damage: null,
      ranged: false,
      armor: null,
      charges: 2,
      text: 'Spend a charge to light everything Near as bright as day. It recharges when left out in a storm.',
    },
    'invent one Origin': {
      name: 'Marshborn',
      examples: 'heron-folk, reed people',
      attribute: 'dex',
      trait: 'You can stand perfectly still for hours, and walk on soft mud without sinking.',
      drawback: null,
      kit: [
        { name: 'Barbed spear', kind: 'weapon', damage: 8, bulky: false },
        { name: 'Reed cloak', kind: 'tool', damage: null, bulky: false },
      ],
    },
    'invent one Ability': {
      name: 'Still Water',
      text: 'Water you touch becomes as calm and clear as glass for ten minutes, out to Near.',
      affinity: 'shaping',
    },
    'write a': {
      title: 'The Fall of the Rope Bridge',
      summary:
        'The party reached the gorge and found the bridge already swaying. It fell as they crossed.',
      openThreads: ['Who cut the ropes?'],
    },
    'propose record': {
      newCards: [
        {
          kind: 'thread',
          name: 'Who cut the ropes?',
          text: 'The bridge did not fall by accident.',
        },
      ],
      changedCards: (given.cards ?? [])
        .slice(0, 1)
        .map((c) => ({ id: c.id, status: 'changed', why: 'Seen with a knife.' })),
    },
    'answer a': {
      answer:
        'Every player makes a Dexterity save. Those who succeed act before the enemies; those who fail act after.',
      sectionId: given.sections?.[0]?.id ?? null,
    },
  };
  // A hint of "broken" makes the stand-in misbehave, to test what the app does then.
  if (given.hint === 'broken') return { text: 'Sorry, I cannot do that.' };
  const key = Object.keys(replies).find((k) => instructions.includes(`TASK: ${k}`));
  return { text: JSON.stringify(replies[key ?? ''] ?? {}), cost: 0 };
};
