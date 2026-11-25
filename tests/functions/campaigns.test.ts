import { createCharacter } from '@waymark/rules';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CODE_LENGTH,
  createCampaign,
  createHandover,
  deleteCampaign,
  joinCampaign,
  leaveCampaign,
  newCode,
  normalizeCode,
  redeemHandover,
  removeMember,
  summarize,
  isSheet,
  syncOwnedSummary,
  syncWardenSummary,
} from '../../functions/src/campaigns';

// These run against the Firestore emulator, through the same functions the
// deployed callables use.
let db: Firestore;

beforeAll(() => {
  if (getApps().length === 0) initializeApp({ projectId: 'demo-waymark' });
  db = getFirestore();
});

beforeEach(async () => {
  await fetch(
    'http://127.0.0.1:8080/emulator/v1/projects/demo-waymark/databases/(default)/documents',
    { method: 'DELETE' },
  );
});

const sheet = () =>
  createCharacter({
    name: 'Wren',
    background: 'Scout',
    attributes: { str: 9, dex: 13, wil: 11 },
    hp: 4,
    coins: 10,
    items: [],
  });
const exists = async (path: string) => (await db.doc(path).get()).exists;
/**
 * Summaries are kept by background triggers, which the emulator also runs
 * while these tests call the same functions directly. They settle within
 * moments, so assertions about summaries wait for the settled state.
 */
const settles = (check: () => Promise<void>) => vi.waitFor(check, { timeout: 5000, interval: 50 });
const summaryExists = (path: string, expected: boolean) =>
  settles(async () => expect(await exists(path), path).toBe(expected));
const start = (uid = 'dana') =>
  createCampaign(db, uid, { name: 'The Rope Bridge', displayName: 'Dana' });
const ownCharacter = (uid: string, campaignId: string | null) =>
  db
    .doc(`characters/${uid}_1`)
    .set({ ownerUid: uid, slot: 1, name: 'Wren', sheet: sheet(), campaignId });

describe('codes', () => {
  it('are six characters from letters and digits that are hard to confuse', () => {
    for (let i = 0; i < 200; i++)
      expect(newCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(CODE_LENGTH).toBe(6);
  });
  it('are read forgivingly: case, spaces and dashes do not matter', () => {
    expect(normalizeCode(' abc-234 ')).toBe('ABC234');
    expect(normalizeCode(42)).toBe('');
  });
});

describe('creating a campaign', () => {
  it('creates the campaign, a join code, the Warden as a member, and their membership', async () => {
    const { campaignId, joinCode } = await start();
    expect(campaignId).toBe('dana_1');
    expect((await db.doc(`campaigns/${campaignId}`).get()).data()).toMatchObject({
      name: 'The Rope Bridge',
      wardenUid: 'dana',
      joinCode,
    });
    expect((await db.doc(`joinCodes/${joinCode}`).get()).get('campaignId')).toBe(campaignId);
    expect((await db.doc(`campaigns/${campaignId}/members/dana`).get()).data()).toMatchObject({
      role: 'warden',
      control: 'direct',
    });
    expect((await db.doc(`users/dana/memberships/${campaignId}`).get()).get('role')).toBe('warden');
  });

  it('a free account can run one campaign', async () => {
    await start();
    await expect(start()).rejects.toThrow(/one campaign/);
  });

  it('two requests at the same moment still produce only one', async () => {
    const results = await Promise.allSettled([start(), start(), start()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db.collection('campaigns').get()).size).toBe(1);
    expect((await db.collection('joinCodes').get()).size).toBe(1);
  });

  it('a paid plan can run more', async () => {
    await db.doc('entitlements/dana').set({ plan: 'paid' });
    expect((await start()).campaignId).toBe('dana_1');
    expect((await start()).campaignId).toBe('dana_2');
  });

  it('deleting a campaign frees the slot', async () => {
    const { campaignId } = await start();
    await deleteCampaign(db, 'dana', { campaignId });
    expect((await start()).campaignId).toBe('dana_1');
  });

  it("needs a campaign name and the Warden's name", async () => {
    await expect(createCampaign(db, 'dana', { name: '', displayName: 'Dana' })).rejects.toThrow(
      /campaign name/,
    );
    await expect(
      createCampaign(db, 'dana', { name: 'x'.repeat(61), displayName: 'Dana' }),
    ).rejects.toThrow(/campaign name/);
    await expect(createCampaign(db, 'dana', { name: 'Fine' })).rejects.toThrow(/Your name/);
  });

  it('finds another code if the first is taken', async () => {
    await db.doc('joinCodes/AAAAAA').set({ campaignId: 'someone-else' });
    // Returns 0 for the first six draws ("AAAAAA"), then moves on.
    let draws = 0;
    const random = () => (draws++ < CODE_LENGTH ? 0 : 0.5);
    const { joinCode } = await createCampaign(
      db,
      'dana',
      { name: 'Test', displayName: 'Dana' },
      random,
    );
    expect(joinCode).not.toBe('AAAAAA');
  });

  it('gives up cleanly if no free code can be found', async () => {
    await db.doc('joinCodes/AAAAAA').set({ campaignId: 'someone-else' });
    await expect(
      createCampaign(db, 'dana', { name: 'Test', displayName: 'Dana' }, () => 0),
    ).rejects.toThrow(/free code/);
    expect(await exists('campaigns/dana_1')).toBe(false);
  });
});

describe('joining a campaign', () => {
  it('with a good code, adds the player with "ask me first"', async () => {
    const { campaignId, joinCode } = await start();
    expect(
      await joinCampaign(db, 'sam', { code: joinCode.toLowerCase(), displayName: 'Sam' }),
    ).toEqual({ campaignId });
    expect((await db.doc(`campaigns/${campaignId}/members/sam`).get()).data()).toMatchObject({
      role: 'player',
      control: 'ask',
      displayName: 'Sam',
    });
    expect((await db.doc(`users/sam/memberships/${campaignId}`).get()).data()).toMatchObject({
      name: 'The Rope Bridge',
      role: 'player',
    });
  });

  it('with a bad code, is refused', async () => {
    await start();
    await expect(joinCampaign(db, 'sam', { code: 'ZZZZZZ', displayName: 'Sam' })).rejects.toThrow(
      /No campaign has that code/,
    );
    await expect(joinCampaign(db, 'sam', { code: 'short', displayName: 'Sam' })).rejects.toThrow(
      /No campaign has that code/,
    );
    await expect(joinCampaign(db, 'sam', { displayName: 'Sam' })).rejects.toThrow(
      /No campaign has that code/,
    );
  });

  it('needs a name', async () => {
    const { joinCode } = await start();
    await expect(joinCampaign(db, 'sam', { code: joinCode })).rejects.toThrow(/Your name/);
  });

  it('joining twice changes nothing, and never demotes the Warden', async () => {
    const { campaignId, joinCode } = await start();
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' });
    await db.doc(`campaigns/${campaignId}/members/sam`).update({ control: 'direct' });
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Other' });
    expect((await db.doc(`campaigns/${campaignId}/members/sam`).get()).data()).toMatchObject({
      control: 'direct',
      displayName: 'Sam',
    });
    await joinCampaign(db, 'dana', { code: joinCode, displayName: 'Dana' });
    expect((await db.doc(`campaigns/${campaignId}/members/dana`).get()).get('role')).toBe('warden');
  });
});

describe('leaving and removing', () => {
  it('a player who leaves takes their character out and loses their summary', async () => {
    const { campaignId, joinCode } = await start();
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' });
    await ownCharacter('sam', campaignId);
    await db.doc(`campaigns/${campaignId}/summaries/sam_1`).set({ name: 'Wren' });

    await leaveCampaign(db, 'sam', { campaignId });
    expect(await exists(`campaigns/${campaignId}/members/sam`)).toBe(false);
    expect(await exists(`users/sam/memberships/${campaignId}`)).toBe(false);
    await summaryExists(`campaigns/${campaignId}/summaries/sam_1`, false);
    expect((await db.doc('characters/sam_1').get()).get('campaignId')).toBeNull();
  });

  it('the Warden cannot leave; a non-member cannot leave', async () => {
    const { campaignId } = await start();
    await expect(leaveCampaign(db, 'dana', { campaignId })).rejects.toThrow(/Warden cannot leave/);
    await expect(leaveCampaign(db, 'nobody', { campaignId })).rejects.toThrow(
      /not in that campaign/,
    );
    await expect(leaveCampaign(db, 'nobody', {})).rejects.toThrow(/not in that campaign/);
  });

  it('the Warden can remove a player, with the same clean-up', async () => {
    const { campaignId, joinCode } = await start();
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' });
    await ownCharacter('sam', campaignId);
    await removeMember(db, 'dana', { campaignId, memberUid: 'sam' });
    expect(await exists(`campaigns/${campaignId}/members/sam`)).toBe(false);
    expect((await db.doc('characters/sam_1').get()).get('campaignId')).toBeNull();
  });

  it('only the Warden can remove, and not themselves or a non-member', async () => {
    const { campaignId, joinCode } = await start();
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' });
    await joinCampaign(db, 'jo', { code: joinCode, displayName: 'Jo' });
    await expect(removeMember(db, 'sam', { campaignId, memberUid: 'jo' })).rejects.toThrow(
      /Only the Warden/,
    );
    await expect(removeMember(db, 'dana', { campaignId, memberUid: 'dana' })).rejects.toThrow(
      /cannot be removed/,
    );
    await expect(removeMember(db, 'dana', { campaignId, memberUid: 'ghost' })).rejects.toThrow(
      /not in the campaign/,
    );
    await expect(
      removeMember(db, 'dana', { campaignId: 'nope', memberUid: 'sam' }),
    ).rejects.toThrow(/does not exist/);
    await expect(removeMember(db, 'dana', { memberUid: 'sam' })).rejects.toThrow(/Which campaign/);
  });
});

describe('deleting a campaign', () => {
  it("removes everything and frees every member's character", async () => {
    const { campaignId, joinCode } = await start();
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' });
    await ownCharacter('sam', campaignId);
    await db.doc(`campaigns/${campaignId}/characters/w1`).set({ name: 'Pip', sheet: sheet() });
    await db.doc(`campaigns/${campaignId}/summaries/w1`).set({ name: 'Pip' });
    const { code } = await createHandover(db, 'dana', { campaignId, characterId: 'w1' });

    await deleteCampaign(db, 'dana', { campaignId });
    for (const path of [
      `campaigns/${campaignId}`,
      `campaigns/${campaignId}/members/dana`,
      `campaigns/${campaignId}/members/sam`,
      `campaigns/${campaignId}/characters/w1`,
      `campaigns/${campaignId}/summaries/w1`,
      `joinCodes/${joinCode}`,
      `handovers/${code}`,
      `users/sam/memberships/${campaignId}`,
      `users/dana/memberships/${campaignId}`,
    ]) {
      await summaryExists(path, false);
    }
    expect(await exists('characters/sam_1')).toBe(true);
    expect((await db.doc('characters/sam_1').get()).get('campaignId')).toBeNull();
  });

  it('only the Warden can delete', async () => {
    const { campaignId, joinCode } = await start();
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' });
    await expect(deleteCampaign(db, 'sam', { campaignId })).rejects.toThrow(/Only the Warden/);
    expect(await exists(`campaigns/${campaignId}`)).toBe(true);
  });
});

describe('handing a Warden-run character to a player', () => {
  const setUp = async () => {
    const { campaignId } = await start();
    await db
      .doc(`campaigns/${campaignId}/characters/w1`)
      .set({ name: 'Pip', description: 'Small', notes: 'n', sheet: sheet(), createdAt: 5 });
    await db.doc(`campaigns/${campaignId}/summaries/w1`).set({ name: 'Pip' });
    const { code } = await createHandover(db, 'dana', { campaignId, characterId: 'w1' });
    return { campaignId, code };
  };

  it('whoever redeems the code becomes the owner and a member', async () => {
    const { campaignId, code } = await setUp();
    const result = await redeemHandover(db, 'jo', { code: code.toLowerCase(), displayName: 'Jo' });
    expect(result).toEqual({ characterId: 'jo_1', campaignId });
    expect((await db.doc('characters/jo_1').get()).data()).toMatchObject({
      ownerUid: 'jo',
      slot: 1,
      name: 'Pip',
      campaignId,
      description: 'Small',
    });
    expect(await exists(`campaigns/${campaignId}/characters/w1`)).toBe(false);
    // The new owner's summary is written in the same step as the old one is removed.
    expect((await db.doc(`campaigns/${campaignId}/summaries/jo_1`).get()).data()).toMatchObject({
      name: 'Pip',
      kind: 'owned',
      ownerUid: 'jo',
    });
    await summaryExists(`campaigns/${campaignId}/summaries/w1`, false);
    expect((await db.doc(`campaigns/${campaignId}/members/jo`).get()).data()).toMatchObject({
      role: 'player',
      control: 'ask',
    });
  });

  it('a code works only once', async () => {
    const { code } = await setUp();
    await redeemHandover(db, 'jo', { code, displayName: 'Jo' });
    await expect(redeemHandover(db, 'sam', { code, displayName: 'Sam' })).rejects.toThrow(
      /already been used/,
    );
  });

  it('is refused if the new owner has no free slot, and the character stays with the Warden', async () => {
    const { campaignId, code } = await setUp();
    await ownCharacter('jo', null);
    await expect(redeemHandover(db, 'jo', { code, displayName: 'Jo' })).rejects.toThrow(
      /no free character slot/,
    );
    expect(await exists(`campaigns/${campaignId}/characters/w1`)).toBe(true);
    expect(await exists(`handovers/${code}`)).toBe(true);
  });

  it('uses the next free slot on a paid plan, and keeps an existing membership', async () => {
    const { campaignId, code } = await setUp();
    await db.doc('entitlements/jo').set({ plan: 'paid' });
    await ownCharacter('jo', null);
    await db
      .doc(`campaigns/${campaignId}/members/jo`)
      .set({ role: 'player', displayName: 'Jo', control: 'direct' });
    expect((await redeemHandover(db, 'jo', { code, displayName: 'Jo' })).characterId).toBe('jo_2');
    expect((await db.doc(`campaigns/${campaignId}/members/jo`).get()).get('control')).toBe(
      'direct',
    );
  });

  it('a bad or empty code is refused', async () => {
    await setUp();
    await expect(redeemHandover(db, 'jo', { code: 'NOPE22', displayName: 'Jo' })).rejects.toThrow(
      /not valid/,
    );
    await expect(redeemHandover(db, 'jo', { displayName: 'Jo' })).rejects.toThrow(/not valid/);
  });

  it('is refused if the character has since been deleted', async () => {
    const { campaignId, code } = await setUp();
    await db.doc(`campaigns/${campaignId}/characters/w1`).delete();
    await expect(redeemHandover(db, 'jo', { code, displayName: 'Jo' })).rejects.toThrow(
      /no longer exists/,
    );
  });

  it('only the Warden can ask for a code, and only for a character that exists', async () => {
    const { campaignId } = await setUp();
    await expect(createHandover(db, 'sam', { campaignId, characterId: 'w1' })).rejects.toThrow(
      /Only the Warden/,
    );
    await expect(createHandover(db, 'dana', { campaignId, characterId: 'w5' })).rejects.toThrow(
      /not in this campaign/,
    );
    await expect(createHandover(db, 'dana', { campaignId })).rejects.toThrow(
      /not in this campaign/,
    );
  });
});

describe('summaries', () => {
  it('hold only the name, HP and conditions', () => {
    const hurt = sheet();
    hurt.hp.current = 1;
    hurt.deprived = true;
    expect(summarize('Wren', hurt, 'owned', 'sam')).toEqual({
      name: 'Wren',
      hp: { current: 1, full: 4 },
      status: 'ok',
      deprived: true,
      kind: 'owned',
      ownerUid: 'sam',
    });
    hurt.critical = true;
    expect(summarize('Wren', hurt, 'warden', null).status).toBe('critical');
  });

  const place = (campaignId: string | null) =>
    db.doc('characters/sam_1').set({ name: 'Wren', sheet: sheet(), ownerUid: 'sam', campaignId });

  it("follow a player's character into, between and out of campaigns", async () => {
    await place('k1');
    await syncOwnedSummary(db, 'sam_1');
    await settles(async () =>
      expect((await db.doc('campaigns/k1/summaries/sam_1').get()).data()).toMatchObject({
        name: 'Wren',
        kind: 'owned',
        ownerUid: 'sam',
      }),
    );

    await place('k2');
    await syncOwnedSummary(db, 'sam_1', 'k1');
    await summaryExists('campaigns/k1/summaries/sam_1', false);
    await summaryExists('campaigns/k2/summaries/sam_1', true);

    await place(null);
    await syncOwnedSummary(db, 'sam_1', 'k2');
    await summaryExists('campaigns/k2/summaries/sam_1', false);

    await place('k1');
    await syncOwnedSummary(db, 'sam_1');
    await db.doc('characters/sam_1').delete();
    await syncOwnedSummary(db, 'sam_1', 'k1');
    await summaryExists('campaigns/k1/summaries/sam_1', false);
  });

  it('a character outside any campaign has no summary', async () => {
    await place(null);
    await syncOwnedSummary(db, 'sam_1');
    await settles(async () => expect((await db.collectionGroup('summaries').get()).size).toBe(0));
  });

  it('a malformed sheet gets no summary and does not stop anything', async () => {
    expect(isSheet(sheet())).toBe(true);
    for (const bad of [
      null,
      undefined,
      {},
      { hp: { current: 1 } },
      { hp: { current: 1 }, attributes: {} },
      'text',
    ]) {
      expect(isSheet(bad)).toBe(false);
    }
    await db
      .doc('characters/sam_1')
      .set({ name: 'X', sheet: { hp: { current: 4 } }, ownerUid: 'sam', campaignId: 'k1' });
    await syncOwnedSummary(db, 'sam_1');
    await summaryExists('campaigns/k1/summaries/sam_1', false);

    await db.doc('campaigns/k1/summaries/w1').set({ name: 'Old' });
    await db.doc('campaigns/k1/characters/w1').set({ name: 'X', sheet: 'nonsense' });
    await syncWardenSummary(db, 'k1', 'w1');
    await summaryExists('campaigns/k1/summaries/w1', false);
  });

  it('follow a Warden-run character and go when it goes', async () => {
    await db.doc('campaigns/k1/characters/w1').set({ name: 'Pip', sheet: sheet() });
    await syncWardenSummary(db, 'k1', 'w1');
    await settles(async () =>
      expect((await db.doc('campaigns/k1/summaries/w1').get()).data()).toMatchObject({
        name: 'Pip',
        kind: 'warden',
        ownerUid: null,
      }),
    );
    await db.doc('campaigns/k1/characters/w1').delete();
    await syncWardenSummary(db, 'k1', 'w1');
    await summaryExists('campaigns/k1/summaries/w1', false);
  });

  it('a sync that starts while the character is in a campaign cleans up if it leaves meanwhile', async () => {
    // Simulates the slow trigger CI exposed: the character leaves between the
    // sync's write and its re-check. Done by leaving from inside the first write.
    await place('k1');
    let left = false;
    const original = db.doc.bind(db);
    const spy = (path: string) => {
      const ref = original(path);
      if (path === 'campaigns/k1/summaries/sam_1' && !left) {
        const set = ref.set.bind(ref);
        ref.set = (async (data: FirebaseFirestore.DocumentData) => {
          const result = await set(data);
          left = true;
          await original('characters/sam_1').update({ campaignId: null });
          return result;
        }) as typeof ref.set;
      }
      return ref;
    };
    await syncOwnedSummary({ doc: spy } as unknown as Firestore, 'sam_1');
    expect(left).toBe(true);
    await summaryExists('campaigns/k1/summaries/sam_1', false);
  });

  it('a late update for a character that has since been handed over does not bring its summary back', async () => {
    // The order CI exposed: the Warden changes a character, hands it over, and
    // only then does the trigger for the earlier change run.
    const { campaignId } = await start();
    await db.doc(`campaigns/${campaignId}/characters/w1`).set({ name: 'Pip', sheet: sheet() });
    const { code } = await createHandover(db, 'dana', { campaignId, characterId: 'w1' });
    await redeemHandover(db, 'jo', { code, displayName: 'Jo' });

    await syncWardenSummary(db, campaignId, 'w1');
    await summaryExists(`campaigns/${campaignId}/summaries/w1`, false);

    await syncOwnedSummary(db, 'jo_1');
    await settles(async () => {
      const summaries = await db.collection(`campaigns/${campaignId}/summaries`).get();
      expect(summaries.docs.map((d) => d.id)).toEqual(['jo_1']);
    });
  });
});

describe('guessing codes', () => {
  it('ten wrong join codes in an hour, and the eleventh try is refused even if right', async () => {
    const { joinCode } = await start();
    const at = 1_000_000;
    for (let i = 0; i < 10; i++) {
      await expect(
        joinCampaign(db, 'mallory', { code: 'ZZZZZ2', displayName: 'M' }, at + i),
      ).rejects.toThrow('No campaign has that code');
    }
    await expect(
      joinCampaign(db, 'mallory', { code: joinCode, displayName: 'M' }, at + 20),
    ).rejects.toThrow('Too many wrong codes. Check the code, wait an hour, and try again.');
    expect(await exists('campaigns/dana_1/members/mallory')).toBe(false);
  });

  it('after an hour the count starts again', async () => {
    const { joinCode } = await start();
    await db.doc('throttle/mallory').set({ since: 1_000_000, misses: 10 });
    const later = 1_000_000 + 60 * 60 * 1000;
    await expect(
      joinCampaign(db, 'mallory', { code: 'ZZZZZ2', displayName: 'M' }, later),
    ).rejects.toThrow('No campaign has that code');
    expect((await db.doc('throttle/mallory').get()).data()).toEqual({ since: later, misses: 1 });
    expect(
      (await joinCampaign(db, 'mallory', { code: joinCode, displayName: 'M' }, later + 1))
        .campaignId,
    ).toBe('dana_1');
  });

  it("one person's wrong guesses do not lock anyone else out", async () => {
    const { joinCode } = await start();
    await db.doc('throttle/mallory').set({ since: Date.now(), misses: 10 });
    expect((await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' })).campaignId).toBe(
      'dana_1',
    );
  });

  it('wrong hand-over codes are counted the same way, and share the count', async () => {
    await db.doc('throttle/mallory').set({ since: 1_000_000, misses: 9 });
    await expect(
      redeemHandover(db, 'mallory', { code: 'ZZZZZ2', displayName: 'M' }, 1_000_001),
    ).rejects.toThrow('That code is not valid');
    await expect(
      redeemHandover(db, 'mallory', { code: 'ZZZZZ2', displayName: 'M' }, 1_000_002),
    ).rejects.toThrow('Too many wrong codes');
  });

  it('a typo or two costs an honest player nothing', async () => {
    const { joinCode } = await start();
    await expect(joinCampaign(db, 'sam', { code: 'ZZZZZ2', displayName: 'Sam' })).rejects.toThrow();
    expect((await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' })).campaignId).toBe(
      'dana_1',
    );
  });
});
