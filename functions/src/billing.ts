import {
  PRICES,
  applyBillingEvent,
  planOf,
  type BillingEvent,
  type BillingPeriod,
  type Entitlement,
} from '@waymark/rules';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { deleteCampaign, leaveCampaign } from './campaigns';

/**
 * Plans and payments. The payment provider tells us what happened; we turn
 * each message into a provider-neutral BillingEvent and apply it to the
 * account's entitlement. Nothing here trusts the browser.
 */

export type Applied = 'applied' | 'duplicate' | 'stale';

/**
 * Applies one event, exactly once. The provider may deliver an event twice,
 * or deliver events out of order; neither can leave the wrong plan in place.
 */
export async function recordBillingEvent(db: Firestore, event: BillingEvent): Promise<Applied> {
  const seen = db.doc(`billingEvents/${event.id}`);
  const entitlement = db.doc(`entitlements/${event.uid}`);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(seen)).exists) return 'duplicate';
    const current = (await tx.get(entitlement)).data() as Entitlement | undefined;
    const next = applyBillingEvent(current, event);
    tx.set(seen, {
      uid: event.uid,
      at: event.at,
      state: event.state,
      applied: next !== null,
      receivedAt: Date.now(),
    });
    if (next === null) return 'stale';
    tx.set(entitlement, { ...next, updatedAt: Date.now() });
    return 'applied';
  });
}

// ---- Stripe ----------------------------------------------------------------

/**
 * Checks that a webhook really came from Stripe: the header carries a time
 * and an HMAC-SHA256 of "time.body" made with our webhook secret.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(',').map((part) => part.trim().split('='));
  const time = Number(parts.find(([key]) => key === 't')?.[1]);
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value ?? '');
  if (!Number.isFinite(time) || Math.abs(nowSeconds - time) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${time}.${rawBody}`).digest();
  return signatures.some((signature) => {
    const given = Buffer.from(signature, 'hex');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type Json = Record<string, unknown>;
const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Turns a Stripe event into a BillingEvent, or `null` for the many kinds of
 * event we have no use for. Only subscription events matter: each carries
 * the whole state of the subscription, so no event depends on another.
 */
export function fromStripe(event: unknown): BillingEvent | null {
  const e = event as { id?: unknown; created?: unknown; type?: unknown; data?: { object?: Json } };
  const type = text(e?.type);
  const sub = e?.data?.object;
  if (!type?.startsWith('customer.subscription.') || !sub) return null;
  const metadata = (sub.metadata ?? {}) as Json;
  const uid = text(metadata.uid);
  const id = text(e.id);
  const subscriptionId = text(sub.id);
  const customerId = text(sub.customer);
  if (!uid || !id || !subscriptionId || !customerId || typeof e.created !== 'number') return null;

  const status = text(sub.status);
  const firstItem = ((sub.items as Json | undefined)?.data as Json[] | undefined)?.[0];
  const periodEnd = sub.current_period_end ?? firstItem?.current_period_end ?? sub.cancel_at;
  const over =
    type.endsWith('.deleted') || status === 'canceled' || status === 'incomplete_expired';
  // A subscription that was never paid for gives nothing.
  if (!over && (status === 'incomplete' || status === 'paused')) return null;
  const state: BillingEvent['state'] = over
    ? 'ended'
    : status === 'past_due' || status === 'unpaid'
      ? 'past_due'
      : sub.cancel_at_period_end === true
        ? 'ending'
        : 'active';
  return {
    id,
    at: e.created,
    uid,
    plan: metadata.plan === 'ai-warden' ? 'ai-warden' : 'paid',
    period: metadata.period === 'yearly' ? 'yearly' : 'monthly',
    state,
    renewsAt: typeof periodEnd === 'number' ? periodEnd * 1000 : null,
    customerId,
    subscriptionId,
  };
}

/** Calls Stripe's API: a path and form fields in, the parsed answer out. */
export type StripeCall = (
  method: 'POST' | 'DELETE',
  path: string,
  fields?: Record<string, string>,
) => Promise<Json>;

export function stripeCaller(secretKey: string): StripeCall {
  return async (method, path, fields = {}) => {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: method === 'POST' ? new URLSearchParams(fields).toString() : undefined,
    });
    const body = (await response.json()) as Json;
    if (!response.ok) {
      console.error('Stripe refused a request', path, (body.error as Json | undefined)?.message);
      throw new HttpsError(
        'unavailable',
        'The payment service did not answer. Try again in a moment.',
      );
    }
    return body;
  };
}

const NOT_OPEN = 'Paid plans are not open yet.';

/** Starts a subscription: returns the address of the provider's payment page. */
export async function createCheckout(
  db: Firestore,
  uid: string,
  input: { period?: unknown; origin?: unknown },
  stripe: StripeCall | null,
): Promise<{ url: string }> {
  if (!stripe) throw new HttpsError('failed-precondition', NOT_OPEN);
  const period: BillingPeriod = input.period === 'yearly' ? 'yearly' : 'monthly';
  const origin = safeOrigin(input.origin);
  const current = (await db.doc(`entitlements/${uid}`).get()).data() as Entitlement | undefined;
  if (planOf(current) !== 'free') {
    throw new HttpsError('failed-precondition', 'You already have a paid plan.');
  }
  const session = await stripe('POST', 'checkout/sessions', {
    mode: 'subscription',
    client_reference_id: uid,
    success_url: `${origin}/account?paid=1`,
    cancel_url: `${origin}/account`,
    ...(current?.customerId ? { customer: current.customerId } : {}),
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(PRICES[period]),
    'line_items[0][price_data][recurring][interval]': period === 'yearly' ? 'year' : 'month',
    'line_items[0][price_data][product_data][name]': 'Waymark',
    'subscription_data[metadata][uid]': uid,
    'subscription_data[metadata][plan]': 'paid',
    'subscription_data[metadata][period]': period,
  });
  const url = text(session.url);
  if (!url)
    throw new HttpsError(
      'unavailable',
      'The payment service did not answer. Try again in a moment.',
    );
  return { url };
}

/** Opens the provider's page for changing a card or cancelling. */
export async function createPortal(
  db: Firestore,
  uid: string,
  input: { origin?: unknown },
  stripe: StripeCall | null,
): Promise<{ url: string }> {
  if (!stripe) throw new HttpsError('failed-precondition', NOT_OPEN);
  const current = (await db.doc(`entitlements/${uid}`).get()).data() as Entitlement | undefined;
  if (!current?.customerId)
    throw new HttpsError('failed-precondition', 'You have no paid plan to manage.');
  const session = await stripe('POST', 'billing_portal/sessions', {
    customer: current.customerId,
    return_url: `${safeOrigin(input.origin)}/account`,
  });
  const url = text(session.url);
  if (!url)
    throw new HttpsError(
      'unavailable',
      'The payment service did not answer. Try again in a moment.',
    );
  return { url };
}

/** Where the provider may send people back to: only the app's own addresses. */
export const ALLOWED_ORIGINS = [
  'https://waymark-rpg-app.web.app',
  'https://waymark-rpg-app.firebaseapp.com',
];
function safeOrigin(origin: unknown): string {
  return typeof origin === 'string' && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]!;
}

// ---- Your data ---------------------------------------------------------------

const all = async (query: FirebaseFirestore.Query) =>
  (await query.get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));

/** Everything the app holds about one account, for them to download. */
export async function exportAccount(db: Firestore, uid: string): Promise<Json> {
  const [user, entitlement, characters, memberships, worlds] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`entitlements/${uid}`).get(),
    all(db.collection('characters').where('ownerUid', '==', uid)),
    all(db.collection(`users/${uid}/memberships`)),
    all(db.collection(`users/${uid}/worlds`)),
  ]);
  const campaignsRun = [];
  for (const campaign of (await db.collection('campaigns').where('wardenUid', '==', uid).get())
    .docs) {
    const parts: Json = {};
    for (const sub of await campaign.ref.listCollections()) {
      // Other people's presence and summaries are theirs, not the Warden's.
      if (sub.id === 'presence' || sub.id === 'summaries') continue;
      parts[sub.id] = await all(sub);
    }
    // The join code lets anyone in; it is shown in the app, not in a file that may be passed around.
    const rest: Json = { ...campaign.data() };
    delete rest.joinCode;
    campaignsRun.push({ id: campaign.id, ...rest, ...parts });
  }
  const plan = entitlement.data();
  return {
    exportedAt: new Date().toISOString(),
    account: { uid, ...(user.data() ?? {}) },
    plan: plan
      ? { plan: plan.plan, status: plan.status, period: plan.period, renewsAt: plan.renewsAt }
      : { plan: 'free' },
    characters,
    campaignsJoined: memberships,
    campaignsRun,
    worlds,
  };
}

/**
 * Deletes an account and what belongs to it. Campaigns they ran are deleted
 * for everyone, and the players' own characters are simply taken out of
 * them. They leave the campaigns they joined. A paid plan is cancelled.
 */
export async function deleteAccount(
  db: Firestore,
  uid: string,
  deps: { stripe: StripeCall | null; deleteSignIn: (uid: string) => Promise<void> },
): Promise<void> {
  const entitlement = (await db.doc(`entitlements/${uid}`).get()).data() as Entitlement | undefined;
  if (entitlement?.subscriptionId && planOf(entitlement) !== 'free') {
    if (!deps.stripe)
      throw new HttpsError(
        'failed-precondition',
        'Your plan could not be cancelled. Try again later.',
      );
    await deps.stripe('DELETE', `subscriptions/${entitlement.subscriptionId}`);
  }
  for (const membership of (await db.collection(`users/${uid}/memberships`).get()).docs) {
    if (membership.get('role') === 'warden')
      await deleteCampaign(db, uid, { campaignId: membership.id });
    else await leaveCampaign(db, uid, { campaignId: membership.id });
  }
  // A campaign whose membership record went missing must not be left behind.
  for (const campaign of (await db.collection('campaigns').where('wardenUid', '==', uid).get())
    .docs) {
    await deleteCampaign(db, uid, { campaignId: campaign.id });
  }
  for (const character of (await db.collection('characters').where('ownerUid', '==', uid).get())
    .docs) {
    await character.ref.delete();
  }
  await db.recursiveDelete(db.doc(`users/${uid}`));
  for (const path of [`entitlements/${uid}`, `usage/${uid}`, `throttle/${uid}`]) {
    await db.doc(path).delete();
  }
  await deps.deleteSignIn(uid);
}
