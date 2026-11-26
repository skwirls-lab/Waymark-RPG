import { createCharacter, sequenceRng } from '@waymark/rules';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCampaign, joinCampaign } from '../../functions/src/campaigns';
import type { WardenModel } from '../../functions/src/warden/engine';
import {
  fixtureWarden,
  setAiWarden,
  wardenTurn,
  WARDEN_TURNS_PER_MONTH,
} from '../../functions/src/warden/play';

let db: Firestore;
let cid: string;
const NOW = new Date('2026-11-25T12:00:00Z');

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-waymark' });
  db = getFirestore();
});

const sheet = (name: string) =>
  createCharacter({
    name,
    background: 'Scout',
    attributes: { str: 9, dex: 13, wil: 11 },
    hp: 4,
    coins: 10,
    items: [],
  });
const reply = (narration: string, tools: object[] = []) =>
  JSON.stringify({ narration, tools, suggestions: ['Look around', 'Ask a question'] });
const scripted = (...replies: string[]): WardenModel => {
  let i = 0;
  return async () => ({ text: replies[Math.min(i++, replies.length - 1)]!, cost: 0 });
};
const turns = async () =>
  (await db.collection(`campaigns/${cid}/turns`).get()).docs
    .map((d) => d.data())
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map((t) => `${t.kind}: ${t.text}`);
// Each turn happens a second after the last, as turns do.
let tick = 0;
const play = (
  uid: string,
  input: object,
  model: WardenModel | null,
  rolls: number[] = [],
  now = new Date(NOW.getTime() + 1000 * tick++),
) => wardenTurn(db, uid, { campaignId: cid, ...input }, model, now, sequenceRng(rolls));

// Dana owns an AI-run campaign. Sam plays Wren in it. Jo plays Ash.
beforeEach(async () => {
  await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-waymark/databases/(default)/documents',
    { method: 'DELETE' },
  );
  const made = await createCampaign(db, 'dana', { name: 'The Rope Bridge', displayName: 'Dana' });
  cid = made.campaignId;
  await joinCampaign(db, 'sam', { code: made.joinCode, displayName: 'Sam' });
  await joinCampaign(db, 'jo', { code: made.joinCode, displayName: 'Jo' });
  await db.doc('entitlements/dana').set({ plan: 'ai-warden', status: 'active' });
  await db.doc('characters/sam_1').set({
    ownerUid: 'sam',
    slot: 1,
    name: 'Wren',
    sheet: sheet('Wren'),
    campaignId: cid,
    updatedAt: 1,
  });
  await db.doc('characters/jo_1').set({
    ownerUid: 'jo',
    slot: 1,
    name: 'Ash',
    sheet: sheet('Ash'),
    campaignId: cid,
    updatedAt: 1,
  });
  await db.doc(`campaigns/${cid}/shared/brief`).set({
    setting: 'A drowned valley.',
    sessions: [{ id: 's', title: 'One', mission: 'Cross the gorge.', stakes: '', expected: '' }],
  });
  await db.doc(`campaigns/${cid}/cards/c1`).set({
    kind: 'person',
    name: 'Old Marrow',
    text: 'Keeps the ferry.',
    status: 'planned',
    createdAt: 1,
    updatedAt: 1,
  });
  await setAiWarden(db, 'dana', { campaignId: cid, on: true });
  await db.doc(`campaigns/${cid}/shared/session`).set({ activeId: 's1' });
});

describe('handing a campaign to the AI Warden', () => {
  it("needs the campaign's owner, and the AI Warden plan", async () => {
    await expect(setAiWarden(db, 'sam', { campaignId: cid, on: true })).rejects.toThrow(
      "Only the campaign's owner",
    );
    await db.doc('entitlements/dana').set({ plan: 'paid', status: 'active' });
    await expect(setAiWarden(db, 'dana', { campaignId: cid, on: true })).rejects.toThrow(
      'needs the AI Warden plan',
    );
    expect(await setAiWarden(db, 'dana', { campaignId: cid, on: false })).toEqual({
      aiWarden: false,
    });
    await expect(play('sam', { text: 'Hello' }, scripted(reply('Hi')))).rejects.toThrow(
      'not run by the AI Warden',
    );
  });

  it('the story moves only during a session', async () => {
    await db.doc(`campaigns/${cid}/shared/session`).set({ activeId: null });
    await expect(play('sam', { text: 'Hello' }, scripted(reply('Hi')))).rejects.toThrow(
      'No session is being played',
    );
    expect((await db.collection(`campaigns/${cid}/turns`).get()).size).toBe(0);
  });

  it('only members can play, and only while the model is connected and the plan holds', async () => {
    await expect(play('stranger', { text: 'Hello' }, scripted(reply('Hi')))).rejects.toThrow(
      'not in that campaign',
    );
    await expect(play('sam', { text: 'Hello' }, null)).rejects.toThrow('not switched on yet');
    await expect(play('sam', { text: '  ' }, scripted(reply('Hi')))).rejects.toThrow(
      'Say what your character does',
    );
    await db.doc('entitlements/dana').set({ plan: 'free', status: 'none' });
    await expect(play('sam', { text: 'Hello' }, scripted(reply('Hi')))).rejects.toThrow(
      'needs the AI Warden plan',
    );
  });
});

describe('a turn, stored', () => {
  it('records what the player said and what the Warden narrated, for everyone to read', async () => {
    await play('sam', { text: 'I look at the bridge.' }, scripted(reply('It sways in the wind.')));
    expect(await turns()).toEqual([
      'player: I look at the bridge.',
      'narration: It sways in the wind.',
    ]);
    expect((await db.doc(`campaigns/${cid}/shared/play`).get()).data()).toMatchObject({
      pending: null,
      suggestions: ['Look around', 'Ask a question'],
    });
    expect((await db.collection(`campaigns/${cid}/turns`).get()).docs[0]!.get('who')).toMatch(
      /Wren|The Warden/,
    );
  });

  it('a save waits for the right player; another player cannot roll it, the owner can', async () => {
    const ask = reply('The planks crack.', [
      {
        name: 'call_for_save',
        args: {
          character: 'Wren',
          attribute: 'dex',
          why: 'To keep your footing. Fail and you fall.',
        },
      },
    ]);
    await play('sam', { text: 'I run across.' }, scripted(ask));
    expect((await db.doc(`campaigns/${cid}/shared/play`).get()).get('pending')).toMatchObject({
      kind: 'save',
      characterId: 'sam_1',
    });
    await expect(play('jo', { roll: 5 }, scripted(reply('ok')))).rejects.toThrow(
      'belongs to another player',
    );
    await expect(
      play('sam', { text: 'I do something else' }, scripted(reply('ok'))),
    ).rejects.toThrow('waiting for a roll');
    await play('sam', { roll: 5 }, scripted(reply('You make it across.')));
    expect(await turns()).toEqual([
      'player: I run across.',
      'narration: The planks crack.',
      'result: Wren rolled 5 for a Dexterity save against 13: passed.',
      'narration: You make it across.',
    ]);
    expect((await db.doc(`campaigns/${cid}/shared/play`).get()).get('pending')).toBeNull();
  });

  it('damage changes the sheet, can be undone, and is told to the table in the feed', async () => {
    await db
      .doc(`campaigns/${cid}/private/scene`)
      .set({ summary: 'A rotten bridge.', dangers: ['rotten planks'] });
    const harm = reply('A plank gives way.', [
      { name: 'deal_damage', args: { character: 'Ash', die: 6, why: 'The fall' } },
    ]);
    await play(
      'jo',
      { text: 'I cross anyway.' },
      scripted(harm, reply('You catch the rope.')),
      [2],
    );
    const ash = await db.doc('characters/jo_1').get();
    expect(ash.get('sheet').hp.current).toBe(2);
    expect(ash.get('undo').sheet.hp.current).toBe(4);
    expect((await db.doc('characters/sam_1').get()).get('updatedAt')).toBe(1);
    const timeline = (await db.collection(`campaigns/${cid}/beats`).get()).docs
      .map((d) => d.data())
      .sort((a, b) => a.at.toMillis() - b.at.toMillis());
    expect(timeline.map((b) => `${b.kind}: ${b.text}`)).toEqual([
      'said: Ash: I cross anyway.',
      'narration: A plank gives way.\n\nYou catch the rope.',
      'result: The fall: Ash took 2 damage. HP 2.',
    ]);
    expect(timeline.every((b) => b.sessionId === 's1' && b.private === false)).toBe(true);
  });

  it('every change to the game appears as a result: nothing changes silently', async () => {
    await db.doc(`campaigns/${cid}/private/scene`).set({ summary: 's', dangers: ['x'] });
    const before = JSON.stringify((await db.doc('characters/jo_1').get()).get('sheet'));
    await play(
      'jo',
      { text: 'go' },
      scripted(
        reply('Hm.', [{ name: 'set_hp', args: { character: 'Ash', hp: 0 } }]),
        reply('Nothing happens.'),
      ),
    );
    expect(JSON.stringify((await db.doc('characters/jo_1').get()).get('sheet'))).toBe(before);
    expect((await turns()).filter((t) => t.startsWith('result'))).toEqual([]);
  });

  it('keeps the record: a beat, a revealed card, and a proposed card that starts hidden', async () => {
    const tools = [
      { name: 'reveal_card', args: { card: 'Old Marrow' } },
      { name: 'add_beat', args: { text: 'The party met Old Marrow.', milestone: true } },
      {
        name: 'propose_card',
        args: { kind: 'place', name: 'The Ferry Landing', text: 'A stone jetty.' },
      },
    ];
    await play(
      'sam',
      { text: 'I greet the ferryman.' },
      scripted(reply('He looks up.', tools), reply('"No crossing tonight."')),
    );
    expect((await db.doc(`campaigns/${cid}/cards/c1`).get()).get('status')).toBe('met');
    const beats = (await db.collection(`campaigns/${cid}/beats`).get()).docs
      .map((d) => d.data())
      .filter((b) => !b.kind);
    expect(beats[0]).toMatchObject({
      text: 'The party met Old Marrow.',
      milestone: true,
      private: false,
    });
    const cards = (await db.collection(`campaigns/${cid}/cards`).get()).docs.map((d) => d.data());
    expect(cards.find((c) => c.name === 'The Ferry Landing')).toMatchObject({
      kind: 'place',
      status: 'planned',
    });
  });

  it('remembers the scene and the conversation from turn to turn', async () => {
    await play(
      'sam',
      { text: 'I look.' },
      scripted(
        reply('Holes line the wall.', [
          {
            name: 'update_scene',
            args: { summary: 'A trapped corridor.', dangers: ['dart trap'] },
          },
        ]),
        reply('What now?'),
      ),
    );
    const seen: string[] = [];
    const watching: WardenModel = async (messages) => {
      seen.push(messages[1]!.content);
      return { text: reply('You wait.') };
    };
    await play('jo', { text: 'I wait.' }, watching);
    expect(seen[0]).toContain('A trapped corridor.');
    expect(seen[0]).toContain('I look.');
    expect(seen[0]).toContain('Old Marrow');
  });
});

describe('limits', () => {
  it('one answer at a time for a campaign', async () => {
    await db.doc(`campaigns/${cid}/private/scene`).set({ busyUntil: NOW.getTime() + 300_000 });
    await expect(play('sam', { text: 'Hello' }, scripted(reply('Hi')))).rejects.toThrow(
      'answering someone else',
    );
    await play(
      'sam',
      { text: 'Hello' },
      scripted(reply('Hi')),
      [],
      new Date(NOW.getTime() + 301_000),
    );
  });

  it('a failed turn frees the campaign for the next one', async () => {
    const broken: WardenModel = async () => {
      throw new Error('network');
    };
    await expect(play('sam', { text: 'Hello' }, broken)).rejects.toThrow('network');
    await play('sam', { text: 'Hello again' }, scripted(reply('Hi')));
  });

  it("turns are counted against the owner's month, and stop at the limit", async () => {
    await play('sam', { text: 'Hello' }, scripted(reply('Hi')));
    expect((await db.doc('usage/dana').get()).data()).toMatchObject({
      wardenMonth: '2026-11',
      warden: 1,
    });
    await db.doc('usage/dana').set({ wardenMonth: '2026-11', warden: WARDEN_TURNS_PER_MONTH });
    await expect(play('sam', { text: 'More' }, scripted(reply('Hi')))).rejects.toThrow(
      'play time is used up',
    );
    await play(
      'sam',
      { text: 'More' },
      scripted(reply('Hi')),
      [],
      new Date('2026-12-01T00:00:10Z'),
    );
  });
});

describe('the stand-in Warden used by the emulator', () => {
  it('plays a small scene: talk, a jump, a save, an outcome', async () => {
    await play('sam', { text: 'Can we cross?' }, fixtureWarden);
    await play('sam', { text: 'I jump the gap.' }, fixtureWarden);
    await play('sam', { roll: 4 }, fixtureWarden);
    const told = await turns();
    expect(told[1]).toMatch(/^narration: The ferryman looks up/);
    expect(told.at(-2)).toMatch(/passed/);
    expect(told.at(-1)).toBe('narration: You land on the far side, heart pounding.');
  });
});
