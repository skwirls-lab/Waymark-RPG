import { createCharacter, type BillingEvent } from '@waymark/rules';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { createHmac } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCheckout,
  createPortal,
  deleteAccount,
  exportAccount,
  fromStripe,
  recordBillingEvent,
  verifyStripeSignature,
  type StripeCall,
} from '../../functions/src/billing';
import {
  createCampaign,
  joinCampaign,
  redeemHandover,
  createHandover,
} from '../../functions/src/campaigns';

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

const event = (over: Partial<BillingEvent> = {}): BillingEvent => ({
  id: 'evt_1',
  at: 1000,
  uid: 'dana',
  plan: 'paid',
  period: 'monthly',
  state: 'active',
  renewsAt: 5_000_000,
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  ...over,
});
const entitlement = async (uid = 'dana') => (await db.doc(`entitlements/${uid}`).get()).data();
const exists = async (path: string) => (await db.doc(path).get()).exists;
const sheet = () =>
  createCharacter({
    name: 'Wren',
    background: 'Scout',
    attributes: { str: 9, dex: 13, wil: 11 },
    hp: 4,
    coins: 10,
    items: [],
  });
const start = (uid: string, name = 'The Rope Bridge') =>
  createCampaign(db, uid, { name, displayName: uid });
/** A stand-in for Stripe that records what it was asked. */
const fakeStripe = () => {
  const calls: { method: string; path: string; fields: Record<string, string> }[] = [];
  const call: StripeCall = async (method, path, fields = {}) => {
    calls.push({ method, path, fields });
    return { url: `https://pay.example/${path}` };
  };
  return { call, calls };
};

describe('entitlements from billing events', () => {
  it('a subscription makes the account paid', async () => {
    expect(await recordBillingEvent(db, event())).toBe('applied');
    expect(await entitlement()).toMatchObject({
      plan: 'paid',
      status: 'active',
      period: 'monthly',
      customerId: 'cus_1',
    });
  });

  it('the same event delivered twice is applied once', async () => {
    await recordBillingEvent(db, event());
    await recordBillingEvent(db, event({ id: 'evt_2', at: 2000, state: 'ended' }));
    expect(await recordBillingEvent(db, event())).toBe('duplicate');
    expect((await entitlement())?.plan).toBe('free');
  });

  it('the same event delivered twice at the same moment is applied once', async () => {
    const results = await Promise.all([
      recordBillingEvent(db, event()),
      recordBillingEvent(db, event()),
    ]);
    expect(results.sort()).toEqual(['applied', 'duplicate']);
  });

  it('events delivered out of order leave the newest state', async () => {
    // Cancelled at 3000 arrives first; the original sign-up at 1000 arrives late.
    expect(await recordBillingEvent(db, event({ id: 'evt_3', at: 3000, state: 'ended' }))).toBe(
      'applied',
    );
    expect(await recordBillingEvent(db, event({ id: 'evt_1', at: 1000 }))).toBe('stale');
    expect(await recordBillingEvent(db, event({ id: 'evt_2', at: 2000, state: 'past_due' }))).toBe(
      'stale',
    );
    expect(await entitlement()).toMatchObject({ plan: 'free', status: 'none', eventAt: 3000 });
  });

  it('a failed payment keeps the plan; the end of the subscription removes it', async () => {
    await recordBillingEvent(db, event());
    await recordBillingEvent(db, event({ id: 'evt_2', at: 2000, state: 'past_due' }));
    expect(await entitlement()).toMatchObject({ plan: 'paid', status: 'past_due' });
    await recordBillingEvent(db, event({ id: 'evt_3', at: 3000, state: 'ended' }));
    expect(await entitlement()).toMatchObject({ plan: 'free', status: 'none' });
  });

  it("one account's events never touch another's", async () => {
    await recordBillingEvent(db, event());
    await recordBillingEvent(db, event({ id: 'evt_2', uid: 'sam', state: 'ended', at: 9000 }));
    expect((await entitlement('dana'))?.plan).toBe('paid');
  });
});

describe('messages from Stripe', () => {
  const secret = 'whsec_test';
  const sign = (body: string, time: number, key = secret) =>
    `t=${time},v1=${createHmac('sha256', key).update(`${time}.${body}`).digest('hex')}`;

  it('accepts a correctly signed message', () => {
    expect(verifyStripeSignature('{"a":1}', sign('{"a":1}', 1000), secret, 1010)).toBe(true);
  });

  it('refuses a wrong key, a changed body, an old message, and a missing or broken header', () => {
    expect(verifyStripeSignature('{"a":1}', sign('{"a":1}', 1000, 'other'), secret, 1010)).toBe(
      false,
    );
    expect(verifyStripeSignature('{"a":2}', sign('{"a":1}', 1000), secret, 1010)).toBe(false);
    expect(verifyStripeSignature('{"a":1}', sign('{"a":1}', 1000), secret, 2000)).toBe(false);
    expect(verifyStripeSignature('{"a":1}', undefined, secret, 1010)).toBe(false);
    expect(verifyStripeSignature('{"a":1}', 't=abc,v1=zz', secret, 1010)).toBe(false);
    expect(verifyStripeSignature('{"a":1}', sign('{"a":1}', 1000, ''), '', 1010)).toBe(false);
  });

  const stripeEvent = (type: string, sub: Record<string, unknown>) => ({
    id: 'evt_s1',
    created: 1700000000,
    type,
    data: {
      object: {
        id: 'sub_1',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: 1702592000,
        metadata: { uid: 'dana', plan: 'paid', period: 'yearly' },
        ...sub,
      },
    },
  });

  it('reads an active subscription', () => {
    expect(fromStripe(stripeEvent('customer.subscription.created', {}))).toEqual({
      id: 'evt_s1',
      at: 1700000000,
      uid: 'dana',
      plan: 'paid',
      period: 'yearly',
      state: 'active',
      renewsAt: 1702592000000,
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
    });
  });

  it('reads failed payments, cancellations and endings', () => {
    const state = (type: string, sub: Record<string, unknown>) =>
      fromStripe(stripeEvent(type, sub))?.state;
    expect(state('customer.subscription.updated', { status: 'past_due' })).toBe('past_due');
    expect(state('customer.subscription.updated', { status: 'unpaid' })).toBe('past_due');
    expect(state('customer.subscription.updated', { cancel_at_period_end: true })).toBe('ending');
    expect(state('customer.subscription.updated', { status: 'canceled' })).toBe('ended');
    expect(state('customer.subscription.deleted', {})).toBe('ended');
    expect(state('customer.subscription.updated', { status: 'trialing' })).toBe('active');
  });

  it('finds the period end where newer versions of Stripe put it', () => {
    const moved = stripeEvent('customer.subscription.updated', {
      current_period_end: undefined,
      items: { data: [{ current_period_end: 1702592000 }] },
    });
    expect(fromStripe(moved)?.renewsAt).toBe(1702592000000);
    expect(
      fromStripe(stripeEvent('customer.subscription.updated', { current_period_end: undefined }))
        ?.renewsAt,
    ).toBeNull();
  });

  it('ignores everything it has no use for', () => {
    expect(
      fromStripe({ id: 'evt', created: 1, type: 'invoice.paid', data: { object: {} } }),
    ).toBeNull();
    expect(
      fromStripe(stripeEvent('customer.subscription.created', { status: 'incomplete' })),
    ).toBeNull();
    expect(fromStripe(stripeEvent('customer.subscription.created', { metadata: {} }))).toBeNull();
    expect(fromStripe(null)).toBeNull();
    expect(fromStripe({ type: 'customer.subscription.updated' })).toBeNull();
  });

  it('defaults to the monthly paid plan, and reads the AI Warden plan', () => {
    expect(
      fromStripe(stripeEvent('customer.subscription.created', { metadata: { uid: 'dana' } })),
    ).toMatchObject({
      plan: 'paid',
      period: 'monthly',
    });
    expect(
      fromStripe(
        stripeEvent('customer.subscription.created', {
          metadata: { uid: 'dana', plan: 'ai-warden' },
        }),
      )?.plan,
    ).toBe('ai-warden');
  });
});

describe('starting and managing a subscription', () => {
  it('asks Stripe for a monthly subscription at $4.99, tagged with the account', async () => {
    const { call, calls } = fakeStripe();
    const result = await createCheckout(
      db,
      'dana',
      { period: 'monthly', origin: 'https://waymark-rpg-app.web.app' },
      call,
    );
    expect(result.url).toBe('https://pay.example/checkout/sessions');
    expect(calls[0]!.fields).toMatchObject({
      mode: 'subscription',
      client_reference_id: 'dana',
      'line_items[0][price_data][unit_amount]': '499',
      'line_items[0][price_data][recurring][interval]': 'month',
      'subscription_data[metadata][uid]': 'dana',
      'subscription_data[metadata][period]': 'monthly',
      success_url: 'https://waymark-rpg-app.web.app/account?paid=1',
    });
    expect(calls[0]!.fields.customer).toBeUndefined();
  });

  it("asks for a yearly subscription at ten months' price, reusing a returning customer", async () => {
    await recordBillingEvent(db, event());
    await recordBillingEvent(db, event({ id: 'evt_2', at: 2000, state: 'ended' }));
    const { call, calls } = fakeStripe();
    await createCheckout(db, 'dana', { period: 'yearly' }, call);
    expect(calls[0]!.fields).toMatchObject({
      'line_items[0][price_data][unit_amount]': '4990',
      'line_items[0][price_data][recurring][interval]': 'year',
      customer: 'cus_1',
    });
  });

  it('never sends people back to an address that is not the app', async () => {
    const { call, calls } = fakeStripe();
    await createCheckout(db, 'dana', { origin: 'https://evil.example' }, call);
    expect(calls[0]!.fields.cancel_url).toBe('https://waymark-rpg-app.web.app/account');
  });

  it('refuses a second subscription, and refuses everything while payments are not connected', async () => {
    await expect(createCheckout(db, 'dana', {}, null)).rejects.toThrow(
      'Paid plans are not open yet.',
    );
    await expect(createPortal(db, 'dana', {}, null)).rejects.toThrow(
      'Paid plans are not open yet.',
    );
    await recordBillingEvent(db, event());
    await expect(createCheckout(db, 'dana', {}, fakeStripe().call)).rejects.toThrow(
      'already have a paid plan',
    );
  });

  it('opens the page for cancelling only for someone who has paid', async () => {
    const { call, calls } = fakeStripe();
    await expect(createPortal(db, 'dana', {}, call)).rejects.toThrow('no paid plan to manage');
    await recordBillingEvent(db, event());
    expect((await createPortal(db, 'dana', {}, call)).url).toBe(
      'https://pay.example/billing_portal/sessions',
    );
    expect(calls[0]!.fields.customer).toBe('cus_1');
  });
});

describe('limits enforced on the server', () => {
  it('a free account runs one campaign; a second is refused', async () => {
    await start('dana');
    await expect(start('dana', 'Another')).rejects.toThrow('A free account can run one campaign');
  });

  it('a paid account runs more, and each records its slot', async () => {
    await recordBillingEvent(db, event());
    const first = await start('dana');
    const second = await start('dana', 'Another');
    expect(second.campaignId).toBe('dana_2');
    expect((await db.doc(`campaigns/${first.campaignId}`).get()).get('slot')).toBe(1);
    expect((await db.doc(`campaigns/${second.campaignId}`).get()).get('slot')).toBe(2);
  });

  it('after the plan ends, both campaigns remain and a third cannot be started', async () => {
    await recordBillingEvent(db, event());
    await start('dana');
    await start('dana', 'Another');
    await recordBillingEvent(db, event({ id: 'evt_2', at: 2000, state: 'ended' }));
    expect(await exists('campaigns/dana_1')).toBe(true);
    expect(await exists('campaigns/dana_2')).toBe(true);
    await expect(start('dana', 'Third')).rejects.toThrow('A free account can run one campaign');
  });

  it('a free account that kept a later campaign cannot fill the first slot as well', async () => {
    await recordBillingEvent(db, event());
    await start('dana');
    await start('dana', 'Another');
    await recordBillingEvent(db, event({ id: 'evt_2', at: 2000, state: 'ended' }));
    await db.doc('users/dana').set({ keepCampaigns: ['dana_2'] });
    await db.recursiveDelete(db.doc('campaigns/dana_1'));
    await expect(start('dana', 'Sneaky')).rejects.toThrow('A free account can run one campaign');
  });

  it('a hand-over is refused when a free account already holds a character', async () => {
    const { campaignId } = await start('dana');
    await db
      .doc(`campaigns/${campaignId}/characters/w1`)
      .set({ name: 'Pip', sheet: sheet(), createdAt: 1, updatedAt: 1 });
    const { code } = await createHandover(db, 'dana', { campaignId, characterId: 'w1' });
    await db
      .doc('characters/sam_1')
      .set({ ownerUid: 'sam', slot: 1, name: 'Wren', sheet: sheet() });
    await expect(redeemHandover(db, 'sam', { code, displayName: 'Sam' })).rejects.toThrow(
      'no free character slot',
    );
    await recordBillingEvent(db, event({ uid: 'sam' }));
    expect((await redeemHandover(db, 'sam', { code, displayName: 'Sam' })).characterId).toBe(
      'sam_2',
    );
  });
});

describe('your data', () => {
  async function world() {
    const { campaignId, joinCode } = await start('dana');
    await joinCampaign(db, 'sam', { code: joinCode, displayName: 'Sam' });
    await db
      .doc(`campaigns/${campaignId}/private/notes`)
      .set({ text: 'The ferryman is the thief.' });
    await db
      .doc(`campaigns/${campaignId}/shared/brief`)
      .set({ setting: 'A drowned valley.', sessions: [] });
    await db
      .doc('characters/dana_1')
      .set({ ownerUid: 'dana', slot: 1, name: 'Ash', sheet: sheet(), campaignId: null });
    await db
      .doc('characters/sam_1')
      .set({ ownerUid: 'sam', slot: 1, name: 'Wren', sheet: sheet(), campaignId });
    await db
      .doc('users/dana/worlds/w1')
      .set({ name: 'Drowned Lands', content: {}, creatures: [], updatedAt: 1 });
    const other = await start('sam', 'Sam runs this');
    await joinCampaign(db, 'dana', { code: other.joinCode, displayName: 'Dana' });
    return { campaignId, otherId: other.campaignId };
  }

  it("the export holds the account's own things and nobody else's", async () => {
    const { campaignId } = await world();
    const data = (await exportAccount(db, 'dana')) as {
      characters: { name: string }[];
      campaignsRun: {
        id: string;
        joinCode?: string;
        private: { text: string }[];
        members: unknown[];
      }[];
      campaignsJoined: { id: string }[];
      worlds: { name: string }[];
      plan: { plan: string };
    };
    expect(data.characters.map((c) => c.name)).toEqual(['Ash']);
    expect(data.campaignsRun.map((c) => c.id)).toEqual([campaignId]);
    expect(data.campaignsRun[0]!.private[0]!.text).toBe('The ferryman is the thief.');
    expect(data.campaignsRun[0]!.joinCode).toBeUndefined();
    expect(data.campaignsJoined).toHaveLength(2);
    expect(data.worlds.map((w) => w.name)).toEqual(['Drowned Lands']);
    expect(data.plan.plan).toBe('free');
    expect(JSON.stringify(data)).not.toContain('Sam runs this"}],"private');
    expect(JSON.stringify(await exportAccount(db, 'sam'))).not.toContain(
      'The ferryman is the thief.',
    );
  });

  it('deleting an account removes what was theirs and leaves the rest in a known state', async () => {
    const { campaignId, otherId } = await world();
    const deleteSignIn = vi.fn(async () => {});
    await deleteAccount(db, 'dana', { stripe: null, deleteSignIn });

    // Theirs: gone.
    expect(await exists('characters/dana_1')).toBe(false);
    expect(await exists('users/dana/worlds/w1')).toBe(false);
    expect(await exists(`campaigns/${campaignId}`)).toBe(false);
    expect(await exists(`campaigns/${campaignId}/private/notes`)).toBe(false);
    expect((await db.collection('users/dana/memberships').get()).size).toBe(0);
    expect(deleteSignIn).toHaveBeenCalledWith('dana');

    // A player in the deleted campaign keeps their character, now in no campaign.
    const wren = await db.doc('characters/sam_1').get();
    expect(wren.exists).toBe(true);
    expect(wren.get('campaignId')).toBeNull();
    expect(await exists(`users/sam/memberships/${campaignId}`)).toBe(false);

    // The campaign they had only joined goes on without them.
    expect(await exists(`campaigns/${otherId}`)).toBe(true);
    expect(await exists(`campaigns/${otherId}/members/dana`)).toBe(false);
  });

  it('deleting a paying account cancels the subscription first', async () => {
    await recordBillingEvent(db, event());
    const { call, calls } = fakeStripe();
    await deleteAccount(db, 'dana', { stripe: call, deleteSignIn: async () => {} });
    expect(calls).toEqual([{ method: 'DELETE', path: 'subscriptions/sub_1', fields: {} }]);
    expect(await exists('entitlements/dana')).toBe(false);
  });

  it('a paying account is not deleted if the subscription cannot be cancelled', async () => {
    await recordBillingEvent(db, event());
    await db
      .doc('characters/dana_1')
      .set({ ownerUid: 'dana', slot: 1, name: 'Ash', sheet: sheet() });
    await expect(
      deleteAccount(db, 'dana', { stripe: null, deleteSignIn: async () => {} }),
    ).rejects.toThrow('could not be cancelled');
    expect(await exists('characters/dana_1')).toBe(true);
  });
});
