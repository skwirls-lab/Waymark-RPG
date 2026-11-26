import { limitsOf, randomRng, type Character, type Fight, type Rng } from '@waymark/rules';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isSheet } from '../campaigns';
import {
  Refused,
  asFightCreature,
  runTurn,
  type CardInfo,
  type Event,
  type Pending,
  type Session,
  type TurnInput,
  type WardenModel,
} from './engine';

/**
 * Connects the AI Warden's engine to a campaign. It loads the session from
 * the database, hands it to the engine, and stores what the engine says
 * happened. It writes nothing of its own invention: every write below comes
 * from the engine's returned session or one of its events.
 */

export type WardenModelCall = WardenModel;

/** Turns a month on the AI Warden plan: about twenty hours of play. */
export const WARDEN_TURNS_PER_MONTH = 1000;
const OFF = 'The AI Warden is not switched on yet.';
const BUSY_MS = 60_000;

const clip = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

interface Loaded {
  session: Session;
  /** Where each character's sheet is stored. */
  paths: Record<string, string>;
  ownerUid: string;
}

async function load(db: Firestore, campaignId: string): Promise<Loaded> {
  const campaign = db.doc(`campaigns/${campaignId}`);
  const [doc, brief, owned, run, cards, notes, beats, scene, fight, creatures] = await Promise.all([
    campaign.get(),
    campaign.collection('shared').doc('brief').get(),
    db.collection('characters').where('campaignId', '==', campaignId).get(),
    campaign.collection('characters').get(),
    campaign.collection('cards').get(),
    campaign.collection('cardNotes').get(),
    campaign.collection('beats').orderBy('at', 'desc').limit(15).get(),
    campaign.collection('private').doc('scene').get(),
    campaign.collection('private').doc('fight').get(),
    campaign.collection('private').doc('creatures').get(),
  ]);
  const party: Record<string, Character> = {};
  const paths: Record<string, string> = {};
  for (const c of [...owned.docs, ...run.docs]) {
    if (!isSheet(c.get('sheet'))) continue;
    party[c.id] = c.get('sheet') as Character;
    paths[c.id] = c.ref.path;
  }
  const secret = Object.fromEntries(notes.docs.map((n) => [n.id, clip(n.get('text'), 400)]));
  const sessions = (brief.get('sessions') ?? []) as { mission?: string; stakes?: string }[];
  const latest = sessions.at(-1);
  return {
    ownerUid: String(doc.get('wardenUid')),
    paths,
    session: {
      brief: {
        setting: clip(brief.get('setting'), 1500),
        mission: clip([latest?.mission, latest?.stakes].filter(Boolean).join(' '), 600),
      },
      party,
      cards: cards.docs.map((c): CardInfo => ({
        id: c.id,
        kind: String(c.get('kind')),
        name: clip(c.get('name'), 80),
        text: clip(c.get('text'), 300),
        notes: secret[c.id] ?? '',
        status: c.get('status'),
      })),
      beats: [...beats.docs].reverse().map((b) => clip(b.get('text'), 300)),
      scene: {
        summary: clip(scene.get('summary'), 600),
        dangers: Array.isArray(scene.get('dangers')) ? scene.get('dangers') : [],
      },
      fight: (fight.get('fight') as Fight | null | undefined) ?? null,
      creatures: ((creatures.get('list') ?? []) as Parameters<typeof asFightCreature>[0][]).map(
        asFightCreature,
      ),
      exchanges: Array.isArray(scene.get('exchanges')) ? scene.get('exchanges') : [],
      pending: (scene.get('pending') as Pending | null | undefined) ?? null,
    },
  };
}

/** Stores a finished turn: the changed sheets, the fight, the scene, and each event. */
async function store(
  db: Firestore,
  campaignId: string,
  before: Loaded,
  after: Session,
  events: Event[],
  said: { who: string; uid: string; text: string } | null,
  now: number,
  sessionId: string,
): Promise<void> {
  const campaign = db.doc(`campaigns/${campaignId}`);
  const batch = db.batch();
  let order = 0;
  /**
   * Each line of the turn is kept twice: in `turns`, which the play screen
   * reads, and on the campaign's timeline, which is the record of everything.
   * Lines of one turn are a millisecond apart, so they keep their order.
   */
  const turn = (data: { kind: string; who: string; text: string; uid?: string }) => {
    const n = order++;
    batch.set(campaign.collection('turns').doc(), { at: now, order: n, ...data });
    batch.set(campaign.collection('beats').doc(), {
      at: Timestamp.fromMillis(now + n),
      text: (data.kind === 'player' ? `${data.who}: ${data.text}` : data.text).slice(0, 2000),
      milestone: false,
      private: false,
      cardId: null,
      byUid: data.uid ?? 'ai-warden',
      kind: data.kind === 'player' ? 'said' : data.kind,
      sessionId,
    });
  };

  for (const [id, sheet] of Object.entries(after.party)) {
    const was = before.session.party[id];
    if (was && JSON.stringify(was) !== JSON.stringify(sheet)) {
      batch.update(db.doc(before.paths[id]!), {
        sheet,
        name: sheet.name,
        undo: { sheet: was, text: 'The Warden changed this.', at: now },
        updatedAt: now,
      });
    }
  }
  batch.set(campaign.collection('private').doc('fight'), { fight: after.fight });
  batch.set(campaign.collection('private').doc('scene'), {
    summary: after.scene.summary,
    dangers: after.scene.dangers,
    exchanges: after.exchanges,
    pending: after.pending,
    busyUntil: 0,
  });
  if (said) turn({ kind: 'player', who: said.who, uid: said.uid, text: said.text });

  let suggestions: string[] = [];
  for (const event of events) {
    switch (event.kind) {
      case 'narration':
        suggestions = event.suggestions;
        turn({ kind: 'narration', who: 'The Warden', text: event.text });
        break;
      case 'result':
        turn({ kind: 'result', who: 'The rules', text: event.text });
        break;
      case 'beat':
        batch.set(campaign.collection('beats').doc(), {
          at: Timestamp.fromMillis(now + order++),
          text: event.text,
          milestone: event.milestone,
          private: false,
          cardId: null,
          byUid: 'ai-warden',
          sessionId,
        });
        break;
      case 'reveal-card':
        batch.update(campaign.collection('cards').doc(event.cardId), {
          status: 'met',
          updatedAt: now,
        });
        break;
      case 'propose-card':
        // Proposed cards start hidden, for the campaign's owner to look over.
        batch.set(campaign.collection('cards').doc(), {
          kind: event.card.kind,
          name: event.card.name,
          text: event.card.text,
          status: 'planned',
          createdAt: now,
          updatedAt: now,
        });
        break;
      case 'ask-roll':
        break;
    }
  }
  // What every player needs to see to take their turn.
  batch.set(campaign.collection('shared').doc('play'), {
    pending: after.pending,
    suggestions,
    updatedAt: now,
  });
  await batch.commit();
}

/** One request at a time for each campaign, and a count against the owner's month. */
async function begin(
  db: Firestore,
  campaignId: string,
  ownerUid: string,
  now: Date,
): Promise<void> {
  const scene = db.doc(`campaigns/${campaignId}/private/scene`);
  const usage = db.doc(`usage/${ownerUid}`);
  const month = now.toISOString().slice(0, 7);
  await db.runTransaction(async (tx) => {
    const [state, record, entitlement] = await Promise.all([
      tx.get(scene),
      tx.get(usage),
      tx.get(db.doc(`entitlements/${ownerUid}`)),
    ]);
    if (!limitsOf(entitlement.data()).aiWarden) {
      throw new HttpsError(
        'failed-precondition',
        "This campaign's owner needs the AI Warden plan.",
      );
    }
    if (Number(state.get('busyUntil') ?? 0) > now.getTime()) {
      throw new HttpsError(
        'aborted',
        'The Warden is answering someone else. Try again in a moment.',
      );
    }
    const used = record.get('wardenMonth') === month ? Number(record.get('warden') ?? 0) : 0;
    if (used >= WARDEN_TURNS_PER_MONTH) {
      throw new HttpsError(
        'resource-exhausted',
        "This month's AI Warden play time is used up. It renews on the 1st.",
      );
    }
    tx.set(scene, { busyUntil: now.getTime() + BUSY_MS }, { merge: true });
    tx.set(usage, { wardenMonth: month, warden: used + 1 }, { merge: true });
  });
}

export async function wardenTurn(
  db: Firestore,
  uid: string,
  input: { campaignId?: unknown; text?: unknown; roll?: unknown },
  model: WardenModel | null,
  now: Date = new Date(),
  rng: Rng = randomRng,
): Promise<{ ok: true }> {
  const campaignId = clip(input.campaignId, 200);
  if (!campaignId || campaignId.includes('/'))
    throw new HttpsError('invalid-argument', 'Choose a campaign first.');
  const [campaign, member] = await Promise.all([
    db.doc(`campaigns/${campaignId}`).get(),
    db.doc(`campaigns/${campaignId}/members/${uid}`).get(),
  ]);
  if (!campaign.exists || !member.exists)
    throw new HttpsError('permission-denied', 'You are not in that campaign.');
  if (campaign.get('aiWarden') !== true)
    throw new HttpsError('failed-precondition', 'This campaign is not run by the AI Warden.');
  if (!model) throw new HttpsError('failed-precondition', OFF);
  // The story moves only during a session, which the campaign's owner starts.
  const playing = await db.doc(`campaigns/${campaignId}/shared/session`).get();
  const sessionId = playing.get('activeId') as string | null | undefined;
  if (!sessionId) {
    throw new HttpsError(
      'failed-precondition',
      "No session is being played. The campaign's owner starts one.",
    );
  }

  const loaded = await load(db, campaignId);
  const isOwner = loaded.ownerUid === uid;
  const mine = Object.keys(loaded.session.party).filter((id) => id.startsWith(`${uid}_`));
  const who = clip(member.get('displayName'), 40) || 'A player';

  let turnInput: TurnInput;
  let said: { who: string; uid: string; text: string } | null = null;
  if (input.roll !== undefined) {
    const pending = loaded.session.pending;
    if (!pending) throw new HttpsError('failed-precondition', 'No roll is being waited for.');
    // A player rolls for their own character. The owner may roll for a character with no player.
    if (!mine.includes(pending.characterId) && !isOwner) {
      throw new HttpsError('permission-denied', 'That roll belongs to another player.');
    }
    turnInput = { type: 'roll', value: Number(input.roll) };
  } else {
    const text = clip(input.text, 500);
    if (!text) throw new HttpsError('invalid-argument', 'Say what your character does.');
    const character = mine[0] ? loaded.session.party[mine[0]]!.name : who;
    said = { who: character, uid, text };
    turnInput = { type: 'say', characterId: mine[0] ?? null, who: character, text };
  }

  await begin(db, campaignId, loaded.ownerUid, now);
  try {
    const result = await runTurn(loaded.session, turnInput, model, rng);
    await store(
      db,
      campaignId,
      loaded,
      result.session,
      result.events,
      said,
      now.getTime(),
      sessionId,
    );
  } catch (problem) {
    await db.doc(`campaigns/${campaignId}/private/scene`).set({ busyUntil: 0 }, { merge: true });
    if (problem instanceof Refused) throw new HttpsError('failed-precondition', problem.message);
    throw problem;
  }
  return { ok: true };
}

/** The campaign's owner hands the campaign to the AI Warden, or takes it back. */
export async function setAiWarden(
  db: Firestore,
  uid: string,
  input: { campaignId?: unknown; on?: unknown },
): Promise<{ aiWarden: boolean }> {
  const campaign = db.doc(`campaigns/${clip(input.campaignId, 200) || 'none'}`);
  const doc = await campaign.get();
  if (!doc.exists || doc.get('wardenUid') !== uid) {
    throw new HttpsError('permission-denied', "Only the campaign's owner can do that.");
  }
  const on = input.on === true;
  if (on && !limitsOf((await db.doc(`entitlements/${uid}`).get()).data()).aiWarden) {
    throw new HttpsError('failed-precondition', 'An AI-run campaign needs the AI Warden plan.');
  }
  await campaign.update({ aiWarden: on });
  return { aiWarden: on };
}

/**
 * A stand-in for the model with fixed behavior, used by the local emulator so
 * the app can be tested end to end without a real model.
 */
export const fixtureWarden: WardenModel = async (messages) => {
  const last = messages.at(-1)!.content;
  const shown = messages[1]!.content;
  const data = JSON.parse(shown.slice(shown.indexOf('{'), shown.lastIndexOf('}') + 1)) as {
    conversation: { who: string; text: string }[];
    party: { id: string; name: string }[];
  };
  const speaker = [...data.conversation].reverse().find((c) => c.who !== 'Warden');
  const said = speaker?.text ?? '';
  // Whoever spoke last is the one who acts.
  const hero = data.party.find((p) => p.name === speaker?.who) ?? data.party[0];
  const reply = (narration: string, tools: object[] = []) => ({
    text: JSON.stringify({
      narration,
      tools,
      suggestions: ['Ask the ferryman a question', 'Look for another way across'],
    }),
    cost: 0,
  });
  if (last.includes('RESULTS')) {
    return reply(
      /passed/.test(last)
        ? 'You land on the far side, heart pounding.'
        : 'The Warden describes what follows.',
    );
  }
  if (/jump/i.test(said) && hero) {
    return reply('The gap is wide, and the rock on the far side is slick.', [
      {
        name: 'call_for_save',
        args: {
          character: hero.id,
          attribute: 'dexterity',
          why: 'To clear the gap. Fail, and you fall short.',
        },
      },
    ]);
  }
  return reply(`The ferryman looks up. "${said.slice(0, 60)}?" he repeats, and shrugs.`);
};
