import { describe, expect, it } from 'vitest';
import {
  FREE,
  PLAN_LIMITS,
  PRICES,
  UNLIMITED,
  applyBillingEvent,
  canCreate,
  isActive,
  limitsOf,
  planOf,
  type BillingEvent,
} from '../src/index.ts';

const event = (over: Partial<BillingEvent> = {}): BillingEvent => ({
  id: 'evt_1',
  at: 1000,
  uid: 'u1',
  plan: 'paid',
  period: 'monthly',
  state: 'active',
  renewsAt: 5_000_000,
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  ...over,
});

describe('plans and their limits', () => {
  it('free holds one character and one campaign; paid plans are unlimited', () => {
    expect(PLAN_LIMITS.free).toMatchObject({
      characters: 1,
      campaigns: 1,
      aiRequests: 30,
      aiWarden: false,
    });
    expect(PLAN_LIMITS.paid).toMatchObject({
      characters: UNLIMITED,
      campaigns: UNLIMITED,
      aiRequests: 1000,
      aiWarden: false,
    });
    expect(PLAN_LIMITS['ai-warden'].aiWarden).toBe(true);
  });

  it('the paid plan is $4.99 a month, and a year costs ten months', () => {
    expect(PRICES.monthly).toBe(499);
    expect(PRICES.yearly).toBe(4990);
  });

  it('no record, or a record that makes no sense, is the free plan', () => {
    for (const record of [null, undefined, {}, { plan: 'gold' }, { plan: 7 }]) {
      expect(planOf(record)).toBe('free');
    }
    expect(planOf({ plan: 'paid' })).toBe('paid');
    expect(limitsOf({ plan: 'ai-warden' }).campaigns).toBe(UNLIMITED);
    expect(limitsOf(null).characters).toBe(1);
  });
});

describe('billing events', () => {
  it('a new subscription makes a free account paid', () => {
    expect(applyBillingEvent(null, event())).toEqual({
      plan: 'paid',
      status: 'active',
      period: 'monthly',
      renewsAt: 5_000_000,
      eventAt: 1000,
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
    });
  });

  it('a failed payment keeps the plan while the provider retries', () => {
    const paid = applyBillingEvent(null, event())!;
    expect(
      applyBillingEvent(paid, event({ id: 'evt_2', at: 2000, state: 'past_due' })),
    ).toMatchObject({
      plan: 'paid',
      status: 'past_due',
    });
  });

  it('cancelling keeps the plan until the period ends, then the account is free', () => {
    const paid = applyBillingEvent(null, event())!;
    const ending = applyBillingEvent(paid, event({ id: 'evt_2', at: 2000, state: 'ending' }))!;
    expect(ending).toMatchObject({ plan: 'paid', status: 'ending', renewsAt: 5_000_000 });
    const ended = applyBillingEvent(ending, event({ id: 'evt_3', at: 3000, state: 'ended' }))!;
    expect(ended).toEqual({ ...FREE, eventAt: 3000, customerId: 'cus_1' });
  });

  it('an event older than one already applied changes nothing', () => {
    const ended = applyBillingEvent(null, event({ at: 3000, state: 'ended' }))!;
    expect(applyBillingEvent(ended, event({ id: 'evt_0', at: 1000, state: 'active' }))).toBeNull();
  });

  it('events from the same second are applied in the order they arrive', () => {
    const paid = applyBillingEvent(null, event())!;
    expect(applyBillingEvent(paid, event({ id: 'evt_2', state: 'past_due' }))?.status).toBe(
      'past_due',
    );
  });

  it('the end of an old subscription does not end a newer one', () => {
    const second = applyBillingEvent(null, event({ subscriptionId: 'sub_2', at: 2000 }))!;
    expect(
      applyBillingEvent(
        second,
        event({ id: 'evt_9', at: 2500, state: 'ended', subscriptionId: 'sub_1' }),
      ),
    ).toBeNull();
    // Once free, though, an "ended" for any subscription is simply recorded.
    const free = applyBillingEvent(
      second,
      event({ id: 'evt_3', at: 3000, state: 'ended', subscriptionId: 'sub_2' }),
    )!;
    expect(
      applyBillingEvent(
        free,
        event({ id: 'evt_4', at: 3500, state: 'ended', subscriptionId: 'sub_1' }),
      )?.plan,
    ).toBe('free');
  });

  it('a yearly AI Warden subscription is recorded as such', () => {
    expect(applyBillingEvent(FREE, event({ plan: 'ai-warden', period: 'yearly' }))).toMatchObject({
      plan: 'ai-warden',
      period: 'yearly',
    });
  });
});

describe('what stays in use when a plan ends', () => {
  it('on an unlimited plan everything is active', () => {
    expect(isActive('u_7', 7, UNLIMITED)).toBe(true);
    expect(isActive('u_7', 7, UNLIMITED, ['u_1'])).toBe(true);
  });

  it('with no choice made, the lowest slot stays active and the rest are read-only', () => {
    expect(isActive('u_1', 1, 1)).toBe(true);
    expect(isActive('u_2', 2, 1)).toBe(false);
  });

  it('the owner can choose which to keep, up to the limit', () => {
    expect(isActive('u_3', 3, 1, ['u_3'])).toBe(true);
    expect(isActive('u_1', 1, 1, ['u_3'])).toBe(false);
  });

  it('a choice of more than the limit is ignored', () => {
    expect(isActive('u_3', 3, 1, ['u_3', 'u_1'])).toBe(false);
    expect(isActive('u_1', 1, 1, ['u_3', 'u_1'])).toBe(true);
  });

  it('new things go in the lowest slots only, and not while a choice stands', () => {
    expect(canCreate(1, 1)).toBe(true);
    expect(canCreate(2, 1)).toBe(false);
    expect(canCreate(1, 1, ['u_3'])).toBe(false);
    expect(canCreate(0, 1)).toBe(false);
    expect(canCreate(1.5, UNLIMITED)).toBe(false);
    expect(canCreate(UNLIMITED, UNLIMITED, ['u_3'])).toBe(true);
    expect(canCreate(UNLIMITED + 1, UNLIMITED)).toBe(false);
  });
});
