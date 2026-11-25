import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import * as ai from './ai';
import * as billing from './billing';
import * as campaigns from './campaigns';
import { AI_DAILY_CAP, AI_MODEL, WARDEN_MODEL } from './config';
import { readSecret } from './secrets';
import * as play from './warden/play';

initializeApp();
const db = getFirestore();

/** Every callable needs a signed-in caller, guest or account holder. */
function uidOf(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return request.auth.uid;
}

const background = { region: 'us-central1', maxInstances: 5 } as const;
/**
 * For functions a browser calls. "public" lets the request reach the
 * function at all; each function then checks who is signed in. It is stated
 * outright so that every deploy applies it: left to the default, the first
 * functions were deployed without it and could not be called.
 */
const options = { ...background, invoker: 'public' } as const;

export const createCampaign = onCall(options, (request) =>
  campaigns.createCampaign(db, uidOf(request), request.data ?? {}),
);
export const joinCampaign = onCall(options, (request) =>
  campaigns.joinCampaign(db, uidOf(request), request.data ?? {}),
);
export const leaveCampaign = onCall(options, (request) =>
  campaigns.leaveCampaign(db, uidOf(request), request.data ?? {}),
);
export const removeMember = onCall(options, (request) =>
  campaigns.removeMember(db, uidOf(request), request.data ?? {}),
);
export const deleteCampaign = onCall(options, (request) =>
  campaigns.deleteCampaign(db, uidOf(request), request.data ?? {}),
);
export const createHandover = onCall(options, (request) =>
  campaigns.createHandover(db, uidOf(request), request.data ?? {}),
);
export const redeemHandover = onCall(options, (request) =>
  campaigns.redeemHandover(db, uidOf(request), request.data ?? {}),
);

export const onCharacterWritten = onDocumentWritten(
  { ...background, document: 'characters/{characterId}' },
  (event) =>
    campaigns.syncOwnedSummary(db, event.params.characterId, event.data?.before.data()?.campaignId),
);

export const onWardenCharacterWritten = onDocumentWritten(
  { ...background, document: 'campaigns/{campaignId}/characters/{characterId}' },
  (event) => campaigns.syncWardenSummary(db, event.params.campaignId, event.params.characterId),
);

// ---- Plans and payments ------------------------------------------------------

const inEmulator = process.env.FUNCTIONS_EMULATOR === 'true';

/** Stripe, once its key is in Secret Manager. Until then, `null`: nobody can be charged. */
async function stripe(): Promise<billing.StripeCall | null> {
  const key = inEmulator ? null : await readSecret('STRIPE_SECRET_KEY');
  return key ? billing.stripeCaller(key) : null;
}

const isGuest = (request: CallableRequest): boolean =>
  request.auth?.token.firebase?.sign_in_provider === 'anonymous';

/** Paying needs an account that can be signed in to again: not a guest. */
function accountOf(request: CallableRequest): string {
  const uid = uidOf(request);
  if (isGuest(request)) {
    throw new HttpsError(
      'failed-precondition',
      'Create an account first. A guest cannot hold a paid plan.',
    );
  }
  return uid;
}

export const createCheckout = onCall(options, async (request) =>
  billing.createCheckout(db, accountOf(request), request.data ?? {}, await stripe()),
);
export const createPortal = onCall(options, async (request) =>
  billing.createPortal(db, accountOf(request), request.data ?? {}, await stripe()),
);
export const exportMyData = onCall(options, (request) => billing.exportAccount(db, uidOf(request)));
export const deleteMyAccount = onCall(options, async (request) =>
  billing.deleteAccount(db, uidOf(request), {
    stripe: await stripe(),
    deleteSignIn: (uid) => getAuth().deleteUser(uid),
  }),
);

/**
 * Where Stripe tells us what happened. Until the signing secret is stored,
 * every message is refused, because none can be proved genuine.
 */
export const stripeWebhook = onRequest(options, async (request, response) => {
  const secret = inEmulator ? null : await readSecret('STRIPE_WEBHOOK_SECRET');
  const body = request.rawBody.toString('utf8');
  const signed =
    secret !== null &&
    billing.verifyStripeSignature(
      body,
      request.header('stripe-signature'),
      secret,
      Date.now() / 1000,
    );
  if (!signed) {
    response.status(400).send('Bad signature');
    return;
  }
  const event = billing.fromStripe(JSON.parse(body));
  response.status(200).send(event ? await billing.recordBillingEvent(db, event) : 'ignored');
});

// ---- AI help -------------------------------------------------------------------

/** The real model once its key is stored; fixed replies in the local emulator; otherwise none. */
async function model(): Promise<ai.ModelCall | null> {
  if (inEmulator) return ai.fixtureModel;
  const key = await readSecret('OPENROUTER_API_KEY');
  return key ? ai.openRouterCaller(key, AI_MODEL) : null;
}

export const aiHelp = onCall({ ...options, timeoutSeconds: 60 }, async (request) =>
  ai.aiHelp(db, uidOf(request), request.data ?? {}, await model(), new Date(), {
    guest: isGuest(request),
    dailyCap: AI_DAILY_CAP,
  }),
);

// ---- The AI Warden ----------------------------------------------------------------

/** The real model once its key is stored; a fixed stand-in in the local emulator; otherwise none. */
async function wardenModel(): Promise<play.WardenModelCall | null> {
  if (inEmulator) return play.fixtureWarden;
  const key = await readSecret('OPENROUTER_API_KEY');
  if (!key) return null;
  const call = ai.openRouterCaller(key, WARDEN_MODEL);
  return (messages) => call(messages);
}

export const wardenTurn = onCall({ ...options, timeoutSeconds: 120 }, async (request) =>
  play.wardenTurn(db, uidOf(request), request.data ?? {}, await wardenModel()),
);
export const setAiWarden = onCall(options, (request) =>
  play.setAiWarden(db, uidOf(request), request.data ?? {}),
);
