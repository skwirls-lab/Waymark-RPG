/**
 * Plans and their limits. Not game rules, but kept here because the app,
 * the Cloud Functions and the tests must all agree on them.
 */

export type Plan = 'free' | 'paid' | 'ai-warden';
export type BillingPeriod = 'monthly' | 'yearly';

export interface PlanLimits {
  /** Characters of your own that you can use. Warden-run characters never count. */
  characters: number;
  /** Campaigns you can run as Warden. Joining as a player is never limited. */
  campaigns: number;
  /** AI help requests each calendar month. */
  aiRequests: number;
  /** Whether the AI can run a campaign as Warden. */
  aiWarden: boolean;
}

/** "Unlimited" is 50: far more than anyone needs, and a number the database can enforce. */
export const UNLIMITED = 50;

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  free: { characters: 1, campaigns: 1, aiRequests: 30, aiWarden: false },
  paid: { characters: UNLIMITED, campaigns: UNLIMITED, aiRequests: 1000, aiWarden: false },
  'ai-warden': { characters: UNLIMITED, campaigns: UNLIMITED, aiRequests: 1000, aiWarden: true },
};

/** Prices in US cents. The yearly price is ten months for twelve. */
export const PRICES: Readonly<Record<BillingPeriod, number>> = { monthly: 499, yearly: 4990 };

/** Warden-run characters in one campaign, on every plan. */
export const WARDEN_CHARACTERS_PER_CAMPAIGN = 6;

/**
 * What an account is entitled to. Written only by the server.
 * No record at all means the free plan.
 */
export interface Entitlement {
  plan: Plan;
  /**
   * active: paid up. past_due: a payment failed and is being retried; the
   * plan stays for now. ending: cancelled, and runs until `renewsAt`.
   * none: nothing is being paid for.
   */
  status: 'active' | 'past_due' | 'ending' | 'none';
  period: BillingPeriod | null;
  /** When the paid period renews or ends, in milliseconds. */
  renewsAt: number | null;
  /** The time of the newest billing event applied, in seconds, as the provider reports it. */
  eventAt: number;
  customerId: string | null;
  subscriptionId: string | null;
}

export const FREE: Entitlement = {
  plan: 'free',
  status: 'none',
  period: null,
  renewsAt: null,
  eventAt: 0,
  customerId: null,
  subscriptionId: null,
};

/** The plan to enforce: anything unrecognised is the free plan. */
export function planOf(entitlement: { plan?: unknown } | null | undefined): Plan {
  const plan = entitlement?.plan;
  return plan === 'paid' || plan === 'ai-warden' ? plan : 'free';
}

export const limitsOf = (entitlement: { plan?: unknown } | null | undefined): PlanLimits =>
  PLAN_LIMITS[planOf(entitlement)];

/**
 * The state of a subscription, as the payment provider reports it in one
 * event. Provider-neutral: each provider's messages are translated to this.
 */
export interface BillingEvent {
  /** The provider's id for this event. An event is applied at most once. */
  id: string;
  /** When the provider created the event, in seconds. */
  at: number;
  uid: string;
  plan: Exclude<Plan, 'free'>;
  period: BillingPeriod;
  /** active: paid. past_due: payment failed, retrying. ending: cancelled, runs to the period's end. ended: over. */
  state: 'active' | 'past_due' | 'ending' | 'ended';
  renewsAt: number | null;
  customerId: string;
  subscriptionId: string;
}

/**
 * The entitlement after an event, or `null` if the event should change
 * nothing because a newer one has already been applied. Events can arrive
 * late and out of order; the newest event by the provider's clock wins.
 */
export function applyBillingEvent(
  current: Entitlement | null | undefined,
  event: BillingEvent,
): Entitlement | null {
  const now = current ?? FREE;
  if (event.at < now.eventAt) return null;
  // News about an old subscription must not end a newer one.
  if (
    event.state === 'ended' &&
    now.subscriptionId !== null &&
    now.subscriptionId !== event.subscriptionId &&
    now.plan !== 'free'
  ) {
    return null;
  }
  if (event.state === 'ended') {
    return { ...FREE, eventAt: event.at, customerId: event.customerId };
  }
  return {
    plan: event.plan,
    status: event.state,
    period: event.period,
    renewsAt: event.renewsAt,
    eventAt: event.at,
    customerId: event.customerId,
    subscriptionId: event.subscriptionId,
  };
}

/**
 * Which of an account's things are in use. Nothing is ever deleted when a
 * plan ends: what is over the limit becomes read-only until the owner
 * chooses what to keep.
 *
 * `slot` is the number in the thing's id. With no choice made, the lowest
 * slots stay active. A choice counts only if it fits within the limit.
 */
export function isActive(
  id: string,
  slot: number,
  limit: number,
  kept: readonly string[] = [],
): boolean {
  if (limit >= UNLIMITED) return true;
  if (kept.length > 0 && kept.length <= limit) return kept.includes(id);
  return slot <= limit;
}

/**
 * Whether a new thing can be made in this slot. Under a limit, only the
 * lowest slots can be filled, and not while a choice of what to keep stands:
 * otherwise a kept thing in a high slot and a new one in a low slot would
 * both be active.
 */
export function canCreate(slot: number, limit: number, kept: readonly string[] = []): boolean {
  if (!Number.isInteger(slot) || slot < 1 || slot > Math.min(limit, UNLIMITED)) return false;
  return limit >= UNLIMITED || kept.length === 0;
}
